import { beforeEach, describe, it, expect, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  job: true,
  live: false,
  readError: false,
  listError: false,
  removeError: false,
  queueError: false,
  removed: [] as string[][],
  queueDeletes: 0,
  create: vi.fn(),
}));
vi.mock('@/env', () => ({ serverEnv: () => ({ SUPABASE_STORAGE_BUCKET: 'images' }) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    fake.create();
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: table === 'events' ? (fake.live ? { id: 'live' } : null) : fake.job ? { event_id: 'job' } : null,
              error: fake.readError ? {} : null,
            }),
          }),
        }),
        delete: () => ({
          eq: async () => {
            fake.queueDeletes++;
            return { error: fake.queueError ? {} : null };
          },
        }),
      }),
      storage: {
        from: () => ({
          list: async (prefix: string) => ({
            data: prefix.endsWith('/nested') ? [{ id: 'file', name: 'logo.png' }] : [{ id: null, name: 'nested' }],
            error: fake.listError ? {} : null,
          }),
          remove: async (paths: string[]) => {
            fake.removed.push(paths);
            return { error: fake.removeError ? {} : null };
          },
        }),
      },
    };
  },
}));
import { cleanDeletedEventImages } from '@/server/image-cleanup';
const id = '10000000-0000-4000-8000-000000000001';
beforeEach(() =>
  Object.assign(fake, {
    job: true,
    live: false,
    readError: false,
    listError: false,
    removeError: false,
    queueError: false,
    removed: [],
    queueDeletes: 0,
  }),
);
describe('Durable image cleanup', () => {
  it('removes only the queued deleted event folder then acknowledges its job', async () => {
    expect(await cleanDeletedEventImages(id)).toBe(true);
    expect(fake.removed).toEqual([[`events/${id}/nested/logo.png`]]);
    expect(fake.queueDeletes).toBe(1);
  });
  it('retains the job on storage failures and succeeds when retried', async () => {
    fake.removeError = true;
    expect(await cleanDeletedEventImages(id)).toBe(false);
    expect(fake.queueDeletes).toBe(0);
    fake.removeError = false;
    expect(await cleanDeletedEventImages(id)).toBe(true);
    expect(fake.queueDeletes).toBe(1);
  });
  it.each(['live', 'readError', 'listError'] as const)('does not delete files when %s is set', async (key) => {
    fake[key] = true;
    expect(await cleanDeletedEventImages(id)).toBe(false);
    expect(fake.removed).toEqual([]);
    expect(fake.queueDeletes).toBe(0);
  });
  it('rejects invalid ids and accepts already-completed work', async () => {
    expect(await cleanDeletedEventImages('../other')).toBe(false);
    fake.job = false;
    expect(await cleanDeletedEventImages(id)).toBe(true);
    expect(fake.removed).toEqual([]);
  });
  it('reports failure if job acknowledgement fails', async () => {
    fake.queueError = true;
    expect(await cleanDeletedEventImages(id)).toBe(false);
  });
});
