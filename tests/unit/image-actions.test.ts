import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; args: unknown[] };
const fake = vi.hoisted(() => ({
  authorize: vi.fn(),
  canEdit: vi.fn(),
  revalidate: vi.fn(),
  calls: [] as { table: string; op: string; args: unknown[] }[],
  results: {} as Record<string, unknown>,
}));
vi.mock('next/cache', () => ({ revalidatePath: fake.revalidate }));
vi.mock('@/env', () => ({ serverEnv: () => ({ SUPABASE_STORAGE_BUCKET: 'images' }) }));
vi.mock('@/server/auth', () => ({ authorizeAdmin: fake.authorize, canEditEvent: fake.canEdit }));
vi.mock('@/lib/supabase/server', () => ({
  // Records every call. Terminals return the result set for "<table>.<first op>";
  // rpc calls are "rpc.<name>"; storage calls are "storage.<op>".
  createClient: async () => ({
    from: (table: string) => {
      let first = '';
      const chain: Record<string, unknown> = {};
      for (const op of ['select', 'insert', 'delete', 'eq', 'order', 'limit'])
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
    rpc: (fn: string, args: unknown) => {
      fake.calls.push({ table: 'rpc', op: fn, args: [args] });
      const done = async () => fake.results[`rpc.${fn}`] ?? { data: null, error: null };
      return { single: done, then: (r: (v: unknown) => unknown, j: (e: unknown) => unknown) => done().then(r, j) };
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
import { removeEventImage, uploadEventImage } from '@/server/actions/images';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EVENT = uuid(1);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = new Uint8Array(
  [...'RIFF']
    .map((c) => c.charCodeAt(0))
    .concat(
      [9, 9, 9, 9],
      [...'WEBP'].map((c) => c.charCodeAt(0)),
    ),
);
const form = (kind: string, file: BlobPart | null = PNG, eventId = EVENT) => {
  const f = new FormData();
  f.set('eventId', eventId);
  f.set('kind', kind);
  if (file !== null) f.set('file', new Blob([file]), 'image');
  return f;
};
const of = (table: string, op: string) =>
  fake.calls.filter((c: Call) => c.table === table && c.op === op).map((c: Call) => c.args);
const written = () => fake.calls.some((c: Call) => ['upload', 'insert', 'delete'].includes(c.op) || c.table === 'rpc');

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
  fake.results = {};
  fake.authorize.mockResolvedValue({ ok: true });
  fake.canEdit.mockResolvedValue(true);
});

describe('uploadEventImage (E-15 to E-18)', () => {
  it("stores the logo in the event's folder, records it, deletes the file it replaced and returns the new version", async () => {
    fake.results['rpc.set_event_logo'] = {
      data: { old_path: `events/${EVENT}/logo-old.webp`, version: 'v2' },
      error: null,
    };
    expect(await uploadEventImage(form('logo'))).toEqual({ ok: true, data: { version: 'v2' } });
    const [bucket, path, body, options] = (
      of('storage', 'upload') as [string, string, Uint8Array, Record<string, unknown>][]
    )[0]!;
    expect(bucket).toBe('images');
    expect(path).toMatch(new RegExp(`^events/${EVENT}/logo-[0-9a-f-]{36}\\.png$`));
    expect(body).toEqual(PNG);
    expect(options).toEqual({ contentType: 'image/png', cacheControl: '31536000', upsert: false });
    expect(of('rpc', 'set_event_logo')).toEqual([[{ p_event_id: EVENT, p_path: path }]]);
    expect(of('storage', 'remove')).toEqual([['images', [`events/${EVENT}/logo-old.webp`]]]);
    expect(fake.revalidate).toHaveBeenCalledWith(`/admin/events/${EVENT}`);
    expect(fake.revalidate).toHaveBeenCalledWith(`/events/${EVENT}`);
    expect(fake.calls.some((c: Call) => c.table === 'game_scores')).toBe(false);
  });

  it('decides the type from the bytes, not the name or declared type', async () => {
    fake.results['rpc.set_major_sponsor'] = { data: null, error: null };
    await uploadEventImage(form('major', WEBP));
    const [, path, , options] = (of('storage', 'upload') as [string, string, unknown, Record<string, unknown>][])[0]!;
    expect(path).toMatch(/\/major-[0-9a-f-]{36}\.webp$/);
    expect(options).toMatchObject({ contentType: 'image/webp' });
    // No earlier major sponsor: nothing to delete.
    expect(of('storage', 'remove')).toEqual([]);
  });

  it('adds a minor sponsor after the last one', async () => {
    fake.results['event_sponsors.select'] = { data: { sort_order: 4 }, error: null };
    fake.results['event_sponsors.insert'] = { data: null, error: null };
    expect(await uploadEventImage(form('minor'))).toEqual({ ok: true, data: { version: undefined } });
    const [row] = (of('event_sponsors', 'insert') as [Record<string, unknown>][])[0]!;
    expect(row).toMatchObject({ event_id: EVENT, tier: 'minor', sort_order: 5 });
    expect(row!.image_path).toMatch(new RegExp(`^events/${EVENT}/minor-`));
  });

  it('refuses before any write: signed out, bad fields, no file, over 5 MB, not an image, not your event', async () => {
    fake.authorize.mockResolvedValueOnce({ ok: false, error: 'Please sign in again.' });
    expect(await uploadEventImage(form('logo'))).toEqual({ ok: false, error: 'Please sign in again.' });
    expect(await uploadEventImage(form('banner'))).toEqual({
      ok: false,
      error: 'Upload failed: no image was received.',
    });
    expect((await uploadEventImage(form('logo', PNG, 'not-a-uuid'))).ok).toBe(false);
    expect((await uploadEventImage(form('logo', null))).ok).toBe(false);
    expect((await uploadEventImage(form('logo', new Uint8Array()))).ok).toBe(false);
    expect(await uploadEventImage(form('logo', new Uint8Array(5 * 1024 * 1024 + 1)))).toEqual({
      ok: false,
      error: 'Upload failed: the image is larger than 5 MB.',
    });
    expect(await uploadEventImage(form('logo', '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toEqual({
      ok: false,
      error: 'Upload failed: only PNG, JPEG or WebP images can be stored.',
    });
    fake.canEdit.mockResolvedValueOnce(false);
    expect(await uploadEventImage(form('logo'))).toEqual({ ok: false, error: 'You can only edit your own events.' });
    expect(written()).toBe(false);
  });

  it('reports a refused upload, and deletes the new file again when the event cannot record it', async () => {
    fake.results['storage.upload'] = { data: null, error: { message: 'mime type not supported' } };
    expect(await uploadEventImage(form('logo'))).toEqual({
      ok: false,
      error: 'Upload failed: the image store did not accept it. Please try again.',
    });
    expect(of('rpc', 'set_event_logo')).toEqual([]);
    fake.calls.length = 0;
    delete fake.results['storage.upload'];
    fake.results['rpc.set_event_logo'] = { data: null, error: { code: '23514', message: 'check' } };
    expect(await uploadEventImage(form('logo'))).toEqual({
      ok: false,
      error: 'Upload failed: it could not be saved to the event. Please try again.',
    });
    const [, uploaded] = (of('storage', 'upload') as [string, string][])[0]!;
    expect(of('storage', 'remove')).toEqual([['images', [uploaded]]]);
    expect(fake.revalidate).not.toHaveBeenCalled();
  });
});

describe('removeEventImage (E-15 to E-18)', () => {
  it('clears the logo, deletes its file and returns the new version', async () => {
    fake.results['rpc.set_event_logo'] = {
      data: { old_path: `events/${EVENT}/logo-a.webp`, version: 'v3' },
      error: null,
    };
    expect(await removeEventImage({ kind: 'logo', eventId: EVENT })).toEqual({ ok: true, data: { version: 'v3' } });
    expect(of('rpc', 'set_event_logo')).toEqual([[{ p_event_id: EVENT }]]);
    expect(of('storage', 'remove')).toEqual([['images', [`events/${EVENT}/logo-a.webp`]]]);
  });

  it('clears the major sponsor and removes one minor sponsor of this event only', async () => {
    fake.results['rpc.set_major_sponsor'] = { data: `events/${EVENT}/major-a.webp`, error: null };
    expect(await removeEventImage({ kind: 'major', eventId: EVENT })).toEqual({
      ok: true,
      data: { version: undefined },
    });
    fake.results['event_sponsors.delete'] = { data: { image_path: `events/${EVENT}/minor-b.png` }, error: null };
    expect((await removeEventImage({ kind: 'minor', eventId: EVENT, sponsorId: uuid(7) })).ok).toBe(true);
    expect(of('event_sponsors', 'eq')).toEqual([
      ['id', uuid(7)],
      ['event_id', EVENT],
      ['tier', 'minor'],
    ]);
    expect(of('storage', 'remove')).toEqual([
      ['images', [`events/${EVENT}/major-a.webp`]],
      ['images', [`events/${EVENT}/minor-b.png`]],
    ]);
  });

  it('refuses bad input, other owners and a sponsor that is not there, deleting nothing', async () => {
    const refused = 'Could not remove the image. Refresh and try again.';
    expect(await removeEventImage({ kind: 'minor', eventId: EVENT } as never)).toEqual({ ok: false, error: refused });
    fake.canEdit.mockResolvedValueOnce(false);
    expect(await removeEventImage({ kind: 'logo', eventId: EVENT })).toEqual({
      ok: false,
      error: 'You can only edit your own events.',
    });
    expect(await removeEventImage({ kind: 'minor', eventId: EVENT, sponsorId: uuid(8) })).toEqual({
      ok: false,
      error: refused,
    });
    fake.results['rpc.set_major_sponsor'] = { data: null, error: { code: '42501', message: 'x' } };
    expect(await removeEventImage({ kind: 'major', eventId: EVENT })).toEqual({ ok: false, error: refused });
    fake.results['rpc.set_event_logo'] = { data: null, error: { code: '42501', message: 'x' } };
    expect(await removeEventImage({ kind: 'logo', eventId: EVENT })).toEqual({ ok: false, error: refused });
    fake.authorize.mockResolvedValueOnce({ ok: false, error: 'Please sign in again.' });
    expect(await removeEventImage({ kind: 'logo', eventId: EVENT })).toEqual({
      ok: false,
      error: 'Please sign in again.',
    });
    expect(of('storage', 'remove')).toEqual([]);
  });
});
