import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; args: unknown[] };
const fake = vi.hoisted(() => ({
  authorize: vi.fn(),
  revalidate: vi.fn(),
  calls: [] as { table: string; op: string; args: unknown[] }[],
  results: {} as Record<string, unknown>,
}));
vi.mock('next/cache', () => ({ revalidatePath: fake.revalidate }));
vi.mock('@/env', () => ({ serverEnv: () => ({ SUPABASE_STORAGE_BUCKET: 'images' }) }));
vi.mock('@/server/auth', () => ({ authorizeSuperadmin: fake.authorize }));
vi.mock('@/lib/supabase/server', () => ({
  // Records every call. Terminals return the result set for "<table>.<first op>";
  // storage calls are "storage.<op>".
  createClient: async () => ({
    from: (table: string) => {
      let first = '';
      const chain: Record<string, unknown> = {};
      for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit'])
        chain[op] = (...args: unknown[]) => {
          if (!first) first = op;
          fake.calls.push({ table, op, args });
          return chain;
        };
      const done = async () => fake.results[`${table}.${first}`] ?? { data: null, error: null };
      chain.single = done;
      chain.maybeSingle = done;
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => done().then(resolve, reject);
      return chain;
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (...args: unknown[]) => {
          fake.calls.push({ table: 'storage', op: 'upload', args: [bucket, ...args] });
          return fake.results['storage.upload'] ?? { data: {}, error: null };
        },
        remove: async (...args: unknown[]) => {
          fake.calls.push({ table: 'storage', op: 'remove', args: [bucket, ...args] });
          return { data: [], error: null };
        },
      }),
    },
  }),
}));
import { removePlatformSponsor, saveDefaultRules, uploadPlatformSponsor } from '@/server/actions/platform';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const form = (tier: string, file: BlobPart | null = PNG) => {
  const f = new FormData();
  f.set('tier', tier);
  if (file !== null) f.set('file', new Blob([file]), 'image');
  return f;
};
const of = (table: string, op: string) =>
  fake.calls.filter((c: Call) => c.table === table && c.op === op).map((c: Call) => c.args);
const written = () => fake.calls.some((c: Call) => ['upload', 'insert', 'update', 'delete', 'remove'].includes(c.op));
const SIGNED_OUT = { ok: false, error: 'Please sign in again.' };
const NOT_SUPER = { ok: false, error: 'Only a superadmin can do this.' };

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
  fake.results = {};
  fake.authorize.mockResolvedValue({ ok: true });
});

describe('uploadPlatformSponsor (S-01)', () => {
  it('stores the logo in the platform folder and adds it after the last sponsor of its tier', async () => {
    fake.results['platform_sponsors.select'] = { data: { sort_order: 2 }, error: null };
    expect(await uploadPlatformSponsor(form('secondary', JPEG))).toEqual({ ok: true, data: undefined });
    const [bucket, path, body, options] = (
      of('storage', 'upload') as [string, string, Uint8Array, Record<string, unknown>][]
    )[0]!;
    expect(bucket).toBe('images');
    expect(path).toMatch(/^platform\/secondary-[0-9a-f-]{36}\.jpg$/);
    expect(body).toEqual(JPEG);
    expect(options).toEqual({ contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    expect(of('platform_sponsors', 'eq')).toEqual([['tier', 'secondary']]);
    expect(of('platform_sponsors', 'insert')).toEqual([[{ tier: 'secondary', image_path: path, sort_order: 3 }]]);
    expect(fake.revalidate).toHaveBeenCalledWith('/admin/settings');
    expect(fake.revalidate).toHaveBeenCalledWith('/(public)/events/[eventId]', 'page');
  });

  it('starts a tier at 0 when it has no sponsors yet', async () => {
    await uploadPlatformSponsor(form('primary'));
    const [[row]] = of('platform_sponsors', 'insert') as [[Record<string, unknown>]];
    expect(row).toMatchObject({ tier: 'primary', sort_order: 0 });
    expect(row.image_path).toMatch(/^platform\/primary-[0-9a-f-]{36}\.png$/);
  });

  it('refuses before any write: not a superadmin, bad tier, no file, over 5 MB, not an image', async () => {
    fake.authorize.mockResolvedValueOnce(NOT_SUPER);
    expect(await uploadPlatformSponsor(form('primary'))).toEqual(NOT_SUPER);
    fake.authorize.mockResolvedValueOnce(SIGNED_OUT);
    expect(await uploadPlatformSponsor(form('primary'))).toEqual(SIGNED_OUT);
    expect(await uploadPlatformSponsor(form('major'))).toEqual({
      ok: false,
      error: 'Upload failed: no image was received.',
    });
    expect((await uploadPlatformSponsor(form('primary', null))).ok).toBe(false);
    expect((await uploadPlatformSponsor(form('primary', new Uint8Array()))).ok).toBe(false);
    expect(await uploadPlatformSponsor(form('primary', new Uint8Array(5 * 1024 * 1024 + 1)))).toEqual({
      ok: false,
      error: 'Upload failed: the image is larger than 5 MB.',
    });
    expect(await uploadPlatformSponsor(form('primary', '<svg><script/></svg>'))).toEqual({
      ok: false,
      error: 'Upload failed: only PNG, JPEG or WebP images can be stored.',
    });
    expect(written()).toBe(false);
  });

  it('reports a refused upload, and deletes the new file again when it cannot be recorded', async () => {
    fake.results['storage.upload'] = { data: null, error: { message: 'mime type not supported' } };
    expect(await uploadPlatformSponsor(form('primary'))).toEqual({
      ok: false,
      error: 'Upload failed: the image store did not accept it. Please try again.',
    });
    expect(of('platform_sponsors', 'insert')).toEqual([]);
    fake.calls.length = 0;
    delete fake.results['storage.upload'];
    fake.results['platform_sponsors.insert'] = { data: null, error: { code: '42501', message: 'rls' } };
    expect(await uploadPlatformSponsor(form('primary'))).toEqual({
      ok: false,
      error: 'Upload failed: it could not be saved to the platform. Please try again.',
    });
    const [, uploaded] = (of('storage', 'upload') as [string, string][])[0]!;
    expect(of('storage', 'remove')).toEqual([['images', [uploaded]]]);
    expect(fake.revalidate).not.toHaveBeenCalled();
  });
});

describe('removePlatformSponsor (S-01)', () => {
  it('removes that sponsor and deletes its file', async () => {
    fake.results['platform_sponsors.delete'] = { data: { image_path: 'platform/primary-a.webp' }, error: null };
    expect(await removePlatformSponsor(uuid(5))).toEqual({ ok: true, data: undefined });
    expect(of('platform_sponsors', 'eq')).toEqual([['id', uuid(5)]]);
    expect(of('storage', 'remove')).toEqual([['images', ['platform/primary-a.webp']]]);
    expect(fake.revalidate).toHaveBeenCalledWith('/(public)/events/[eventId]', 'page');
  });

  it('refuses a bad id, a sponsor that is not there and a non-superadmin, deleting no file', async () => {
    const refused = { ok: false, error: 'Could not remove the sponsor. Refresh and try again.' };
    expect(await removePlatformSponsor('not-a-uuid')).toEqual(refused);
    expect(await removePlatformSponsor(uuid(6))).toEqual(refused);
    fake.authorize.mockResolvedValueOnce(NOT_SUPER);
    expect(await removePlatformSponsor(uuid(6))).toEqual(NOT_SUPER);
    expect(of('storage', 'remove')).toEqual([]);
  });
});

describe('saveDefaultRules (S-02)', () => {
  it('saves the rules cleaned to the allow-list', async () => {
    fake.results['platform_settings.update'] = { data: [{ id: true }], error: null };
    expect(
      await saveDefaultRules('<h2>Fouls</h2><p onclick="x()">Five <strong>fouls</strong></p><script>alert(1)</script>'),
    ).toEqual({ ok: true, data: undefined });
    expect(of('platform_settings', 'update')).toEqual([
      [{ default_rules_html: '<h2>Fouls</h2><p>Five <strong>fouls</strong></p>' }],
    ]);
    expect(of('platform_settings', 'eq')).toEqual([['id', true]]);
    expect(fake.revalidate).toHaveBeenCalledWith('/admin/settings');
  });

  it('stores rules with no text as empty, which means the built-in rules', async () => {
    fake.results['platform_settings.update'] = { data: [{ id: true }], error: null };
    await saveDefaultRules('<p></p><p>&nbsp;</p>');
    expect(of('platform_settings', 'update')).toEqual([[{ default_rules_html: '' }]]);
  });

  it('refuses a non-superadmin and over-long rules, and reports a save that changed nothing', async () => {
    fake.authorize.mockResolvedValueOnce(NOT_SUPER);
    expect(await saveDefaultRules('<p>x</p>')).toEqual(NOT_SUPER);
    expect(await saveDefaultRules('x'.repeat(200_001))).toEqual({
      ok: false,
      error: 'The rules are too long to save.',
    });
    expect(written()).toBe(false);
    // RLS lets the update through with no rows when the caller lost the role meanwhile.
    fake.results['platform_settings.update'] = { data: [], error: null };
    expect(await saveDefaultRules('<p>x</p>')).toEqual({
      ok: false,
      error: 'Could not save the default rules. Please try again.',
    });
  });
});
