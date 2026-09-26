import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; args: unknown[] };
const SUPER = '00000000-0000-4000-8000-000000000001';
const fake = vi.hoisted(() => ({
  authorize: vi.fn(),
  revalidate: vi.fn(),
  generateLink: vi.fn(),
  getUserById: vi.fn(),
  deleteUser: vi.fn(),
  noSecret: false,
  calls: [] as { table: string; op: string; args: unknown[] }[],
  results: {} as Record<string, unknown>,
}));
vi.mock('next/cache', () => ({ revalidatePath: fake.revalidate }));
vi.mock('@/env', () => ({ serverEnv: () => ({ NEXT_PUBLIC_SITE_URL: 'https://connect.example' }) }));
vi.mock('@/server/auth', () => ({ authorizeSuperadmin: fake.authorize }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (fake.noSecret) throw new Error('SUPABASE_SECRET_KEY is not set');
    return {
      auth: { admin: { generateLink: fake.generateLink, getUserById: fake.getUserById, deleteUser: fake.deleteUser } },
    };
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      let first = '';
      const chain: Record<string, unknown> = {};
      for (const op of ['select', 'update', 'eq'])
        chain[op] = (...args: unknown[]) => {
          if (!first) first = op;
          fake.calls.push({ table, op, args });
          return chain;
        };
      const done = async () => fake.results[`${table}.${first}`] ?? { data: null, error: null };
      chain.maybeSingle = done;
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => done().then(resolve, reject);
      return chain;
    },
    rpc: async (fn: string, args?: unknown) => {
      fake.calls.push({ table: 'rpc', op: fn, args: [args] });
      return fake.results[`rpc.${fn}`] ?? { data: null, error: null };
    },
  }),
}));
import { createAdminAccount, newSetupLink, setAdminDisabled, setAdminRole } from '@/server/actions/admins';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NEW = uuid(9);
const of = (table: string, op: string) =>
  fake.calls.filter((c: Call) => c.table === table && c.op === op).map((c: Call) => c.args);
const NOT_SUPER = { ok: false, error: 'Only a superadmin can do this.' };
const GONE = { ok: false, error: 'That account no longer exists. Refresh the page.' };
const linked = (user: object | null, token = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8') => ({
  data: { user, properties: user ? { hashed_token: token } : null },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
  fake.results = {};
  fake.noSecret = false;
  fake.authorize.mockResolvedValue({ ok: true, data: { id: SUPER, role: 'superadmin' } });
  fake.generateLink.mockResolvedValue(linked({ id: NEW }));
  fake.results['profiles.update'] = { data: [{ id: NEW }], error: null };
  fake.results['rpc.list_admin_accounts'] = { data: [{ id: SUPER, email: 'me@example.com' }], error: null };
});

describe('createAdminAccount (A-09)', () => {
  it('creates the account with an invite token, sets the role through the session, and returns the set-up link', async () => {
    expect(await createAdminAccount({ name: '  Sam Lee ', email: ' Sam@Example.COM ', role: 'superadmin' })).toEqual({
      ok: true,
      data: {
        name: 'Sam Lee',
        email: 'sam@example.com',
        link: 'https://connect.example/auth/confirm?token_hash=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8&type=invite',
      },
    });
    expect(of('rpc', 'record_account_link')).toEqual([[{ p_account: NEW, p_kind: 'invite' }]]);
    expect(fake.generateLink).toHaveBeenCalledWith({
      type: 'invite',
      email: 'sam@example.com',
      options: { data: { display_name: 'Sam Lee' } },
    });
    expect(of('profiles', 'update')).toEqual([[{ role: 'superadmin', display_name: 'Sam Lee' }]]);
    expect(of('profiles', 'eq')).toEqual([['id', NEW]]);
    expect(fake.revalidate).toHaveBeenCalledWith('/admin/admins');
  });

  it('checks the details and the caller before creating anything', async () => {
    expect(await createAdminAccount({ name: ' ', email: 'a@b.co', role: 'admin' })).toEqual({
      ok: false,
      error: 'Enter a name.',
    });
    expect(await createAdminAccount({ name: 'Sam', email: 'not an email', role: 'admin' })).toEqual({
      ok: false,
      error: 'Enter a valid email address.',
    });
    expect((await createAdminAccount({ name: 'Sam', email: 'a@b.co', role: 'owner' as never })).ok).toBe(false);
    expect((await createAdminAccount({ name: 'x'.repeat(121), email: 'a@b.co', role: 'admin' })).ok).toBe(false);
    fake.authorize.mockResolvedValueOnce(NOT_SUPER);
    expect(await createAdminAccount({ name: 'Sam', email: 'a@b.co', role: 'admin' })).toEqual(NOT_SUPER);
    expect(fake.generateLink).not.toHaveBeenCalled();
  });

  it('refuses an email that already has an account before asking Auth, so no account is taken over', async () => {
    // Auth would hand back an unfinished account with a fresh token rather than refuse it.
    fake.results['rpc.list_admin_accounts'] = { data: [{ id: uuid(4), email: 'Sam@Example.com' }], error: null };
    expect(await createAdminAccount({ name: 'Sam', email: 'sam@example.com', role: 'superadmin' })).toEqual({
      ok: false,
      error: 'An account with this email already exists. Use New set-up link on its row.',
    });
    expect(fake.generateLink).not.toHaveBeenCalled();
    expect(of('profiles', 'update')).toEqual([]);
    expect(fake.deleteUser).not.toHaveBeenCalled();
    fake.results['rpc.list_admin_accounts'] = { data: null, error: { code: '42501' } };
    expect(await createAdminAccount({ name: 'Sam', email: 'sam@example.com', role: 'admin' })).toEqual({
      ok: false,
      error: 'Could not create the account. Please try again.',
    });
    expect(fake.generateLink).not.toHaveBeenCalled();
  });

  it('does not hand over a link it could not put on record', async () => {
    fake.results['rpc.record_account_link'] = { data: null, error: { code: '42501' } };
    expect(await createAdminAccount({ name: 'Sam', email: 'a@b.co', role: 'admin' })).toEqual({
      ok: false,
      error: 'The account was created, but its link could not be made. Use New set-up link on its row.',
    });
    expect(fake.deleteUser).not.toHaveBeenCalled();
  });

  it('says so when the email already has an account, or account management is not configured', async () => {
    fake.generateLink.mockResolvedValueOnce({
      data: { user: null, properties: null },
      error: {
        code: 'email_exists',
        status: 422,
        message: 'A user with this email address has already been registered',
      },
    });
    expect(await createAdminAccount({ name: 'Sam', email: 'a@b.co', role: 'admin' })).toEqual({
      ok: false,
      error: 'An account with this email already exists. Use New set-up link on its row.',
    });
    fake.generateLink.mockResolvedValueOnce({ data: { user: null, properties: null }, error: { status: 500 } });
    expect(await createAdminAccount({ name: 'Sam', email: 'a@b.co', role: 'admin' })).toEqual({
      ok: false,
      error: 'Could not create the account. Please try again.',
    });
    fake.noSecret = true;
    expect(await createAdminAccount({ name: 'Sam', email: 'a@b.co', role: 'admin' })).toEqual({
      ok: false,
      error: 'Account management is not set up on this server.',
    });
    expect(of('profiles', 'update')).toEqual([]);
  });

  it('removes the new user again when the role cannot be set, so no account is left without one', async () => {
    fake.results['profiles.update'] = { data: [], error: null };
    expect(await createAdminAccount({ name: 'Sam', email: 'a@b.co', role: 'admin' })).toEqual({
      ok: false,
      error: 'Could not create the account. Please try again.',
    });
    expect(fake.deleteUser).toHaveBeenCalledWith(NEW);
    expect(fake.revalidate).not.toHaveBeenCalled();
  });
});

describe('newSetupLink (A-09)', () => {
  beforeEach(() => {
    fake.results['profiles.select'] = { data: { display_name: 'Sam Lee', role: 'admin', disabled_at: null } };
  });

  it('gives a password link to someone who has set up, and the invite again to someone who has not', async () => {
    fake.getUserById.mockResolvedValueOnce({
      data: { user: { email: 'sam@example.com', email_confirmed_at: '2026-09-27T00:00:00Z' } },
      error: null,
    });
    expect(await newSetupLink(uuid(5))).toEqual({
      ok: true,
      data: {
        name: 'Sam Lee',
        email: 'sam@example.com',
        link: 'https://connect.example/auth/confirm?token_hash=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8&type=recovery',
      },
    });
    expect(fake.generateLink).toHaveBeenLastCalledWith({ type: 'recovery', email: 'sam@example.com' });
    expect(of('rpc', 'record_account_link')).toEqual([[{ p_account: uuid(5), p_kind: 'recovery' }]]);
    fake.getUserById.mockResolvedValueOnce({
      data: { user: { email: 'sam@example.com', email_confirmed_at: null } },
      error: null,
    });
    const again = await newSetupLink(uuid(5));
    expect(again.ok && again.data.link).toMatch(/type=invite$/);
    expect(fake.generateLink).toHaveBeenLastCalledWith({ type: 'invite', email: 'sam@example.com' });
    fake.getUserById.mockResolvedValueOnce({
      data: { user: { email: 'sam@example.com', email_confirmed_at: null } },
      error: null,
    });
    fake.results['rpc.record_account_link'] = { data: null, error: { code: '42501' } };
    expect(await newSetupLink(uuid(5))).toEqual({
      ok: false,
      error: 'Could not make a set-up link. Please try again.',
    });
  });

  it('refuses your own account, one that is gone, disabled or without a role, and a failed link', async () => {
    expect(await newSetupLink(SUPER)).toEqual({
      ok: false,
      error: 'This is your own account. Use Change password instead.',
    });
    expect(await newSetupLink('nope')).toEqual(GONE);
    fake.results['profiles.select'] = { data: null };
    expect(await newSetupLink(uuid(5))).toEqual(GONE);
    fake.results['profiles.select'] = { data: { display_name: 'Sam', role: 'admin', disabled_at: '2026-09-27' } };
    expect(await newSetupLink(uuid(5))).toEqual({
      ok: false,
      error: 'Enable the account before making a set-up link.',
    });
    fake.results['profiles.select'] = { data: { display_name: 'Sam', role: null, disabled_at: null } };
    expect(await newSetupLink(uuid(5))).toEqual({
      ok: false,
      error: 'Give the account a role before making a set-up link.',
    });
    expect(fake.generateLink).not.toHaveBeenCalled();
    fake.results['profiles.select'] = { data: { display_name: 'Sam', role: 'admin', disabled_at: null } };
    fake.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404 } });
    expect(await newSetupLink(uuid(5))).toEqual(GONE);
    fake.getUserById.mockResolvedValueOnce({
      data: { user: { email: 's@e.co', email_confirmed_at: null } },
      error: null,
    });
    fake.generateLink.mockResolvedValueOnce({ data: { user: null, properties: null }, error: { status: 500 } });
    expect(await newSetupLink(uuid(5))).toEqual({
      ok: false,
      error: 'Could not make a set-up link. Please try again.',
    });
  });
});

describe('setAdminRole and setAdminDisabled (A-09)', () => {
  it('changes another account through the session and refreshes the list', async () => {
    fake.results['profiles.update'] = { data: [{ id: uuid(5) }], error: null };
    expect(await setAdminRole({ userId: uuid(5), role: 'superadmin' })).toEqual({ ok: true, data: undefined });
    expect(of('profiles', 'update')).toEqual([[{ role: 'superadmin' }]]);
    expect(await setAdminDisabled({ userId: uuid(5), disabled: true })).toEqual({ ok: true, data: undefined });
    const [[disabled]] = of('profiles', 'update').slice(1) as [[{ disabled_at: string }]];
    expect(Date.parse(disabled.disabled_at)).not.toBeNaN();
    await setAdminDisabled({ userId: uuid(5), disabled: false });
    expect(of('profiles', 'update').at(-1)).toEqual([{ disabled_at: null }]);
    expect(fake.revalidate).toHaveBeenCalledWith('/admin/admins');
  });

  it('never changes your own account, and reports a gone account, a refusal and a non-superadmin', async () => {
    expect(await setAdminRole({ userId: SUPER, role: 'admin' })).toEqual({
      ok: false,
      error: 'You cannot change your own role.',
    });
    expect(await setAdminDisabled({ userId: SUPER, disabled: true })).toEqual({
      ok: false,
      error: 'You cannot disable your own account.',
    });
    expect(of('profiles', 'update')).toEqual([]);
    expect(await setAdminRole({ userId: 'x', role: 'admin' })).toEqual(GONE);
    fake.results['profiles.update'] = { data: [], error: null };
    expect(await setAdminRole({ userId: uuid(5), role: 'admin' })).toEqual(GONE);
    expect(await setAdminDisabled({ userId: uuid(5), disabled: true })).toEqual(GONE);
    fake.results['profiles.update'] = { data: null, error: { code: '42501' } };
    expect(await setAdminRole({ userId: uuid(5), role: 'admin' })).toEqual({
      ok: false,
      error: 'Could not change the role. Please try again.',
    });
    expect(await setAdminDisabled({ userId: uuid(5), disabled: true })).toEqual({
      ok: false,
      error: 'Could not change the account. Please try again.',
    });
    fake.authorize.mockResolvedValueOnce(NOT_SUPER);
    expect(await setAdminDisabled({ userId: uuid(5), disabled: true })).toEqual(NOT_SUPER);
  });
});
