import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Web address actions (PRD P-14): create with an address, check one, change one. */

const fake = vi.hoisted(() => ({
  authorize: vi.fn(),
  canEdit: vi.fn(),
  rpc: vi.fn(),
  preview: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: fake.revalidate }));
vi.mock('@/server/auth', () => ({ authorizeAdmin: fake.authorize, canEditEvent: fake.canEdit }));
vi.mock('@/server/image-cleanup', () => ({ cleanDeletedEventImages: vi.fn() }));
vi.mock('@/env', () => ({ serverEnv: () => ({ DEFAULT_EVENT_TIMEZONE: 'Pacific/Auckland' }) }));
vi.mock('@/server/mobile/reader', () => ({ mobileConfigured: true, mobileReader: () => ({ preview: fake.preview }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: fake.rpc }) }));
import { changeEventSlug, checkEventSlug, createEvent } from '@/server/actions/events';
import { importLeague } from '@/server/actions/mobile-import';

const id = '10000000-0000-4000-8000-000000000001';
const TAKEN = { code: '23505', hint: 'event_slug_taken', message: 'That web address is already used by another event' };
/** free_event_slug answers with the suggestion; the other call with its own result. */
const rpcs = (other: { data: unknown; error: unknown }, suggestion = 'harbour-2026-2') =>
  fake.rpc.mockImplementation(async (name: string) =>
    name === 'free_event_slug' ? { data: suggestion, error: null } : other,
  );

beforeEach(() => {
  vi.clearAllMocks();
  fake.authorize.mockResolvedValue({ ok: true });
  fake.canEdit.mockResolvedValue(true);
  fake.preview.mockResolvedValue({ league: { id: 'league', name: 'Harbour' }, teams: [] });
});

describe('creating an event with a web address', () => {
  it('stores the address as typed, normalised', async () => {
    rpcs({ data: id, error: null });
    expect(await createEvent({ name: ' Harbour ', slug: 'Harbour 2026' })).toEqual({ ok: true, data: id });
    expect(fake.rpc).toHaveBeenCalledWith(
      'create_draft_event',
      expect.objectContaining({ p_name: 'Harbour', p_slug: 'harbour-2026' }),
    );
  });

  it('refuses an unusable address before writing anything', async () => {
    expect(await createEvent({ name: 'Harbour', slug: '!!!' })).toEqual({
      ok: false,
      error: 'Enter a web address, such as summer-league-2026.',
    });
    expect(await createEvent({ name: 'Harbour', slug: '0d1f2e3c-4b5a-4968-8776-a5b4c3d2e1f0' })).toEqual({
      ok: false,
      error: 'Choose an address that does not look like an event id.',
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('offers the first free address when the chosen one is taken', async () => {
    rpcs({ data: null, error: TAKEN });
    expect(await createEvent({ name: 'Harbour', slug: 'harbour-2026' })).toEqual({
      ok: false,
      error: 'Another event already uses that web address. Try harbour-2026-2.',
    });
  });

  it('treats a race lost on the unique index as taken too', async () => {
    rpcs({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "events_slug_key"' },
    });
    expect(await createEvent({ name: 'Harbour', slug: 'harbour-2026' })).toEqual({
      ok: false,
      error: 'Another event already uses that web address. Try harbour-2026-2.',
    });
  });

  it('keeps other failures generic', async () => {
    rpcs({ data: null, error: { code: '42501', message: 'Admin access required' } });
    expect(await createEvent({ name: 'Harbour', slug: 'harbour-2026' })).toEqual({
      ok: false,
      error: 'Could not create the event. Please try again.',
    });
  });

  it('needs an admin', async () => {
    fake.authorize.mockResolvedValue({ ok: false, error: 'Sign in' });
    expect((await createEvent({ name: 'Harbour', slug: 'harbour-2026' })).ok).toBe(false);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe('checking an address', () => {
  it('is free when the database gives the same address back', async () => {
    rpcs({ data: null, error: null }, 'harbour-2026');
    expect(await checkEventSlug('Harbour 2026')).toEqual({
      ok: true,
      data: { slug: 'harbour-2026', free: true, suggestion: 'harbour-2026' },
    });
  });

  it('is taken with a suggestion otherwise, and counts the event’s own addresses when editing', async () => {
    rpcs({ data: null, error: null }, 'harbour-2026-2');
    expect(await checkEventSlug('harbour-2026', id)).toEqual({
      ok: true,
      data: { slug: 'harbour-2026', free: false, suggestion: 'harbour-2026-2' },
    });
    expect(fake.rpc).toHaveBeenCalledWith('free_event_slug', { p_slug: 'harbour-2026', p_event_id: id });
  });

  it('refuses a malformed event id and an unusable address', async () => {
    expect((await checkEventSlug('harbour-2026', 'not-an-id')).ok).toBe(false);
    expect(await checkEventSlug('')).toEqual({ ok: false, error: 'Enter a web address, such as summer-league-2026.' });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('says so when the check fails', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { code: 'XX000' } });
    expect(await checkEventSlug('harbour-2026')).toEqual({
      ok: false,
      error: 'Could not check the web address. Try again.',
    });
  });
});

describe('changing an address', () => {
  it('changes it and hands back the new version', async () => {
    rpcs({ data: 'v2', error: null });
    expect(await changeEventSlug(id, 'Harbour Finals')).toEqual({
      ok: true,
      data: { slug: 'harbour-finals', version: 'v2' },
    });
    expect(fake.rpc).toHaveBeenCalledWith('set_event_slug', { p_event_id: id, p_slug: 'harbour-finals' });
    expect(fake.revalidate).toHaveBeenCalledWith(`/admin/events/${id}`);
  });

  it('only for the event’s editors', async () => {
    fake.canEdit.mockResolvedValue(false);
    expect(await changeEventSlug(id, 'harbour-finals')).toEqual({
      ok: false,
      error: 'You can only change your own events.',
    });
    expect(await changeEventSlug('not-an-id', 'harbour-finals')).toEqual({
      ok: false,
      error: 'You can only change your own events.',
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('offers the first free address when the new one is taken', async () => {
    rpcs({ data: null, error: TAKEN }, 'harbour-finals-2');
    expect(await changeEventSlug(id, 'harbour-finals')).toEqual({
      ok: false,
      error: 'Another event already uses that web address. Try harbour-finals-2.',
    });
    expect(fake.revalidate).not.toHaveBeenCalled();
  });

  it('keeps other failures generic', async () => {
    rpcs({ data: null, error: { code: '42501' } });
    expect(await changeEventSlug(id, 'harbour-finals')).toEqual({
      ok: false,
      error: 'Could not change the web address. Please try again.',
    });
  });
});

describe('importing a league with a web address', () => {
  const choice = {
    leagueId: 'league',
    eventName: 'Harbour',
    divisionName: 'Open',
    slug: 'harbour-2026',
    allowDuplicate: false,
  };

  it('reports a taken address, not a duplicate league', async () => {
    rpcs({ data: null, error: TAKEN });
    expect(await importLeague(choice)).toEqual({
      ok: false,
      error: 'Another event already uses that web address. Try harbour-2026-2.',
    });
  });

  it('refuses an unusable address with its reason', async () => {
    expect(await importLeague({ ...choice, slug: '---' })).toEqual({
      ok: false,
      error: 'Enter a web address, such as summer-league-2026.',
    });
    expect(fake.preview).not.toHaveBeenCalled();
  });
});
