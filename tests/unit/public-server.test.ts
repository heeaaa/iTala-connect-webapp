import { beforeEach, describe, expect, it, vi } from 'vitest';

import { legacyTarget } from '@/app/(public)/legacy-hash-redirect';

/*
 * The loaders and the score action against a fake Supabase client. This
 * checks the queries we send and how results and errors are handled; RLS
 * itself is proven by pgTAP and the integration suite (NOT RUN without the
 * local Supabase stack).
 */

type Result = { data: unknown; error: { code?: string; message?: string } | null };
const db = vi.hoisted(() => ({
  tables: new Map<string, Result>(),
  calls: [] as { table: string; ops: [string, ...unknown[]][] }[],
  rpc: vi.fn(),
}));

function builder(table: string) {
  const call = { table, ops: [] as [string, ...unknown[]][] };
  db.calls.push(call);
  const result = () => db.tables.get(table) ?? { data: [], error: null };
  const api: Record<string, unknown> = {
    select: (...a: unknown[]) => (call.ops.push(['select', ...a]), api),
    eq: (...a: unknown[]) => (call.ops.push(['eq', ...a]), api),
    maybeSingle: () => Promise.resolve(result()),
    then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
  };
  return api;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: builder, rpc: db.rpc }),
}));
const auth = vi.hoisted(() => ({ canEdit: false, authorized: true }));
vi.mock('@/server/auth', () => ({
  canEditEvent: async () => auth.canEdit,
  authorizeAdmin: async () =>
    auth.authorized ? { ok: true, data: { id: 'u1' } } : { ok: false, error: 'Please sign in again.' },
}));
vi.mock('@/env', () => ({ serverEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }) }));

const { findEventByLegacyId, findPublicEvent, loadHomeEvents, loadPublicEvent, LoadError } =
  await import('@/server/public/load-event');
const { saveScore } = await import('@/server/actions/scores');
const { SAVE_SCORE_FAILED } = await import('@/server/actions/score-messages');

const EVENT_ID = '0b6f5d7e-3c1a-4d8e-9f2b-6a7c8d9e0f11';
const event = {
  id: EVENT_ID,
  name: 'Spring Hoops',
  status: 'published',
  schedule_days: ['2026-10-03'],
  time_start: '09:00:00',
  time_end: '20:00:00',
  courts: 1,
  court_names: ['Court 1'],
  timezone: 'Pacific/Auckland',
  logo_path: null,
  theme_primary: '#FFCC00',
  theme_bg: '#0D0D0D',
  theme_text: '#E0E0E0',
  theme_text_secondary: '#888888',
  theme_heading: '#FFFFFF',
  rules_html: '<p>Play fair</p><script>alert(1)</script>',
};

beforeEach(() => {
  db.tables.clear();
  db.calls.length = 0;
  db.rpc.mockReset();
  auth.canEdit = false;
  auth.authorized = true;
});

describe('loadPublicEvent', () => {
  it('returns null for a malformed id without querying (real 404, N-04)', async () => {
    expect(await loadPublicEvent('not-a-uuid')).toBeNull();
    expect(db.calls).toHaveLength(0);
  });

  it('returns null when RLS hides the event', async () => {
    db.tables.set('events', { data: null, error: null });
    expect(await loadPublicEvent(EVENT_ID)).toBeNull();
  });

  it('maps nested divisions, teams and players, and sanitises the rules', async () => {
    auth.canEdit = true;
    db.tables.set('events', { data: event, error: null });
    db.tables.set('divisions', {
      data: [
        {
          id: 'd1',
          name: 'Open',
          color: '#6C63FF',
          sort_order: 0,
          created_at: '',
          teams: [
            {
              id: 't1',
              division_id: 'd1',
              name: 'Hawks',
              coach: '',
              sort_order: 0,
              created_at: '',
              players: [{ id: 'p1', team_id: 't1', name: 'Ari', number: '4', sort_order: 0 }],
            },
          ],
        },
        { id: 'd2', name: 'Empty', color: '#2BBF8A', sort_order: 1, created_at: '', teams: null },
      ],
      error: null,
    });
    const data = await loadPublicEvent(EVENT_ID);
    expect(data!.canEdit).toBe(true);
    expect(data!.rulesHtml).toBe('<p>Play fair</p>');
    expect(data!.model.teams).toEqual([
      { id: 't1', divisionId: 'd1', name: 'Hawks', coach: '', players: [{ id: 'p1', name: 'Ari', number: '4' }] },
    ]);
    expect(data!.model.divisions.map((d) => d.teamIds)).toEqual([['t1'], []]);
    expect(typeof data!.loadedAt).toBe('number');
    // Every child query is scoped to the event.
    for (const t of ['divisions', 'games', 'game_scores', 'event_sponsors']) {
      expect(db.calls.find((c) => c.table === t)!.ops).toContainEqual(['eq', 'event_id', EVENT_ID]);
    }
  });

  it('throws a LoadError when a query fails (error page, N-04)', async () => {
    db.tables.set('events', { data: null, error: { message: 'down' } });
    await expect(loadPublicEvent(EVENT_ID)).rejects.toBeInstanceOf(LoadError);
    db.tables.set('events', { data: event, error: null });
    db.tables.set('games', { data: null, error: { message: 'down' } });
    await expect(loadPublicEvent(EVENT_ID)).rejects.toThrow('Could not load this event');
  });
});

describe('findPublicEvent (P-14): an id, a web address or an old one', () => {
  const ref = { id: EVENT_ID, slug: 'spring-hoops-2026' };

  it('finds an event by its id', async () => {
    db.tables.set('events', { data: ref, error: null });
    expect(await findPublicEvent(EVENT_ID)).toEqual(ref);
    expect(db.calls[0]!.ops).toContainEqual(['eq', 'id', EVENT_ID]);
  });

  it('finds an event by its address, as typed with capitals', async () => {
    db.tables.set('events', { data: ref, error: null });
    expect(await findPublicEvent('Spring-Hoops-2026')).toEqual(ref);
    expect(db.calls[0]!.ops).toContainEqual(['eq', 'slug', 'spring-hoops-2026']);
    expect(db.calls.some((c) => c.table === 'event_slugs')).toBe(false);
  });

  it('follows an old address to the current one', async () => {
    db.tables.set('events', { data: null, error: null });
    db.tables.set('event_slugs', { data: { events: ref }, error: null });
    expect(await findPublicEvent('spring-2026')).toEqual(ref);
    expect(db.calls.find((c) => c.table === 'event_slugs')!.ops).toContainEqual(['eq', 'slug', 'spring-2026']);
  });

  it('is null when nothing visible has that address (a draft to the public, N-04)', async () => {
    db.tables.set('events', { data: null, error: null });
    db.tables.set('event_slugs', { data: null, error: null });
    expect(await findPublicEvent('secret-draft-2026')).toBeNull();
  });

  it('is null for an address that cannot exist, without querying', async () => {
    expect(await findPublicEvent('!!!')).toBeNull();
    expect(await findPublicEvent('---')).toBeNull();
    expect(db.calls).toHaveLength(0);
  });

  it('throws a LoadError when a lookup fails', async () => {
    db.tables.set('events', { data: null, error: { message: 'down' } });
    await expect(findPublicEvent(EVENT_ID)).rejects.toBeInstanceOf(LoadError);
    await expect(findPublicEvent('spring-2026')).rejects.toBeInstanceOf(LoadError);
    db.tables.set('events', { data: null, error: null });
    db.tables.set('event_slugs', { data: null, error: { message: 'down' } });
    await expect(findPublicEvent('spring-2026')).rejects.toBeInstanceOf(LoadError);
  });
});

describe('loadHomeEvents (H-03)', () => {
  it('asks the database for published events only and maps cards', async () => {
    db.tables.set('events', {
      data: [
        {
          id: 'e',
          slug: 'spring-2026',
          name: 'Spring',
          schedule_days: [],
          timezone: 'Pacific/Auckland',
          logo_path: null,
          divisions: [{ count: 3 }],
        },
      ],
      error: null,
    });
    const cards = await loadHomeEvents(new Date('2026-09-26T00:00:00Z'));
    expect(db.calls[0]!.ops).toContainEqual(['eq', 'status', 'published']);
    expect(cards).toEqual([
      expect.objectContaining({ id: 'e', slug: 'spring-2026', divisionCount: 3, when: 'undated' }),
    ]);
  });

  it('throws when the list cannot load', async () => {
    db.tables.set('events', { data: null, error: { message: 'down' } });
    await expect(loadHomeEvents()).rejects.toThrow('Could not load events');
  });
});

describe('legacy links', () => {
  it('reads #/event/{firebaseId} hashes only', () => {
    expect(legacyTarget('#/event/-NabcDEF_123')).toBe('/l/-NabcDEF_123');
    expect(legacyTarget('#/event/-Nabc/extra?x=1')).toBe('/l/-Nabc');
    expect(legacyTarget('#/admin')).toBeNull();
    expect(legacyTarget('#/event/<script>')).toBeNull();
    expect(legacyTarget('')).toBeNull();
  });

  it('looks up the Firebase id, giving the web address, and rejects odd ids without querying', async () => {
    db.tables.set('events', { data: { slug: 'spring-hoops-2026' }, error: null });
    expect(await findEventByLegacyId('-Nabc')).toBe('spring-hoops-2026');
    expect(db.calls[0]!.ops).toContainEqual(['eq', 'legacy_firebase_id', '-Nabc']);
    db.calls.length = 0;
    expect(await findEventByLegacyId('../etc')).toBeNull();
    expect(db.calls).toHaveLength(0);
    db.tables.set('events', { data: null, error: null });
    expect(await findEventByLegacyId('-Nmissing')).toBeNull();
    db.tables.set('events', { data: null, error: { message: 'down' } });
    await expect(findEventByLegacyId('-Nabc')).rejects.toBeInstanceOf(LoadError);
  });
});

describe('saveScore (PRD P-08)', () => {
  const GAME = '11111111-1111-4111-8111-111111111111';

  it('sends both sides to set_score', async () => {
    db.rpc.mockResolvedValue({ error: null });
    expect(await saveScore({ gameId: GAME, score1: 0, score2: 12 })).toEqual({ ok: true, data: undefined });
    expect(db.rpc).toHaveBeenCalledWith('set_score', { p_game_id: GAME, p_s1: 0, p_s2: 12 });
  });

  it('clears with both blank', async () => {
    db.rpc.mockResolvedValue({ error: null });
    await saveScore({ gameId: GAME, score1: null, score2: null });
    expect(db.rpc).toHaveBeenCalledWith('set_score', { p_game_id: GAME, p_s1: null, p_s2: null });
  });

  it.each([
    [{ gameId: 'x', score1: 1, score2: 1 }],
    [{ gameId: GAME, score1: -1, score2: 1 }],
    [{ gameId: GAME, score1: 1.5, score2: 1 }],
    [{ gameId: GAME, score1: 1000, score2: 1 }],
  ])('rejects bad input without calling Postgres: %j', async (input) => {
    expect(await saveScore(input)).toEqual({ ok: false, error: 'Scores must be whole numbers from 0 to 999.' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('needs a signed-in admin', async () => {
    auth.authorized = false;
    expect(await saveScore({ gameId: GAME, score1: 1, score2: 1 })).toEqual({
      ok: false,
      error: 'Please sign in again.',
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('explains a permission refusal and a failure', async () => {
    db.rpc.mockResolvedValue({ error: { code: '42501' } });
    expect(await saveScore({ gameId: GAME, score1: 1, score2: 1 })).toEqual({
      ok: false,
      error: 'You can only enter scores for your own events.',
    });
    db.rpc.mockResolvedValue({ error: { code: '08006' } });
    expect(await saveScore({ gameId: GAME, score1: 1, score2: 1 })).toEqual({ ok: false, error: SAVE_SCORE_FAILED });
  });
});
