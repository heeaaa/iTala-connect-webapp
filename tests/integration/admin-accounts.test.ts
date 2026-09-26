/**
 * Admins screen (PRD A-09) against the real local Auth server: set-up links
 * are made without any email, work once, and lead to a password; the account
 * list and role changes follow the same rules through the API the app calls.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../support/supabase';

let superadmin: TestUser;
let admin: TestUser;
const invited: string[] = [];
const address = (tag: string) => `${tag}-${randomUUID().slice(0, 8)}@itala.test`;

beforeAll(async () => {
  [superadmin, admin] = await Promise.all([
    createUser('superadmin', { tag: 'acc-super', name: 'Accounts Super' }),
    createUser('admin', { tag: 'acc-admin', name: 'Accounts Admin' }),
  ]);
});

afterAll(async () => {
  const db = adminClient();
  for (const id of invited) await db.auth.admin.deleteUser(id);
  await deleteUsers([superadmin, admin].filter(Boolean));
});

async function invite(name: string) {
  const email = address('invite');
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { display_name: name } },
  });
  if (error) throw error;
  invited.push(data.user.id);
  return { email, id: data.user.id, token: data.properties.hashed_token };
}

describe('Set-up links (A-09)', () => {
  it('an invite creates the account and a one-time token, with no email, and the profile takes the name', async () => {
    const { id, token } = await invite('Invited Person');
    // The set-up page accepts exactly this format (src/server/actions/account.ts).
    expect(token).toMatch(/^[0-9a-f]{56}$/);
    const { data: user } = await adminClient().auth.admin.getUserById(id);
    expect(user.user?.email_confirmed_at ?? null).toBeNull();
    const { data: profile } = await adminClient().from('profiles').select('display_name, role').eq('id', id).single();
    expect(profile).toEqual({ display_name: 'Invited Person', role: null });
  });

  it('the link signs the person in once, then they choose a password and sign in with it', async () => {
    const { email, token } = await invite('Link Person');
    const person = anonClient();
    const verified = await person.auth.verifyOtp({ type: 'invite', token_hash: token });
    expect(verified.error).toBeNull();
    expect(verified.data.session).not.toBeNull();
    const again = await anonClient().auth.verifyOtp({ type: 'invite', token_hash: token });
    expect(again.error).not.toBeNull();
    expect(again.data.session).toBeNull();

    const password = `Pw-${randomUUID()}`;
    expect((await person.auth.updateUser({ password })).error).toBeNull();
    const signIn = await anonClient().auth.signInWithPassword({ email, password });
    expect(signIn.error).toBeNull();
  });

  it('inviting an address that is already set up is refused as an existing account', async () => {
    const { data, error } = await adminClient().auth.admin.generateLink({ type: 'invite', email: admin.email });
    expect(data.user).toBeNull();
    expect(['email_exists', 'user_already_exists']).toContain(error?.code);
  });

  it('a new invite for someone who never finished replaces the old token', async () => {
    const { email, token: first } = await invite('Late Person');
    const { data, error } = await adminClient().auth.admin.generateLink({ type: 'invite', email });
    expect(error).toBeNull();
    const second = data.properties!.hashed_token;
    expect(second).not.toBe(first);
    expect((await anonClient().auth.verifyOtp({ type: 'invite', token_hash: first })).error).not.toBeNull();
    expect((await anonClient().auth.verifyOtp({ type: 'invite', token_hash: second })).error).toBeNull();
  });

  it('a password link for a set-up account signs them in once so they can choose a new password', async () => {
    const { data, error } = await adminClient().auth.admin.generateLink({ type: 'recovery', email: admin.email });
    expect(error).toBeNull();
    const person = anonClient();
    const verified = await person.auth.verifyOtp({ type: 'recovery', token_hash: data.properties!.hashed_token });
    expect(verified.error).toBeNull();
    expect(verified.data.user?.id).toBe(admin.id);
    const password = `Pw-${randomUUID()}`;
    expect((await person.auth.updateUser({ password })).error).toBeNull();
    expect((await anonClient().auth.signInWithPassword({ email: admin.email, password })).error).toBeNull();
    admin.password = password;
  });
});

describe('Accounts through the API (A-09)', () => {
  it('a superadmin sees every account with its email; an admin cannot list them', async () => {
    const asSuper = await signedInClient(superadmin);
    const { data, error } = await asSuper.rpc('list_admin_accounts');
    expect(error).toBeNull();
    const row = data!.find((a) => a.id === admin.id);
    expect(row).toMatchObject({ email: admin.email, role: 'admin', display_name: 'Accounts Admin' });
    const asAdmin = await signedInClient(admin);
    const refused = await asAdmin.rpc('list_admin_accounts');
    expect(refused.error?.code).toBe('42501');
  });

  it('a superadmin sets a role and disables an account through their own session, but never their own', async () => {
    const { id } = await invite('Role Person');
    const asSuper = await signedInClient(superadmin);
    const promoted = await asSuper.from('profiles').update({ role: 'superadmin' }).eq('id', id).select('role');
    expect(promoted.error).toBeNull();
    expect(promoted.data).toEqual([{ role: 'superadmin' }]);
    const disabled = await asSuper
      .from('profiles')
      .update({ disabled_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    expect(disabled.data).toHaveLength(1);
    const self = await asSuper.from('profiles').update({ role: 'admin' }).eq('id', superadmin.id).select('id');
    expect(self.error?.code).toBe('42501');
    const asAdmin = await signedInClient(admin);
    const byAdmin = await asAdmin.from('profiles').update({ role: 'superadmin' }).eq('id', id).select('id');
    expect(byAdmin.data ?? []).toEqual([]);
  });
});
