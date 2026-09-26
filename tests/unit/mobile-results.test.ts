import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/mobile.json';
import {
  GROUPS,
  detailLine,
  driftLine,
  finishedWhen,
  mobileFinalSchema,
  num,
  resultLine,
  type InboxFinal,
} from '@/lib/mobile-results';
import { createMobileReader } from '@/server/mobile/transport';

const fake = vi.hoisted(() => ({
  results: {} as Record<string, { data: unknown; error: unknown }>,
  finals: vi.fn(),
}));
vi.mock('@/server/mobile/reader', () => ({ mobileReader: () => ({ finals: fake.finals }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const op of ['select', 'eq', 'in']) chain[op] = () => chain;
      const done = async () => fake.results[table] ?? { data: [], error: null };
      chain.maybeSingle = done;
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => done().then(resolve, reject);
      return chain;
    },
  }),
}));
import { NOT_LINKED, SCORES_UNREADABLE, loadInbox } from '@/server/mobile/results';

const final = (o: Partial<Record<keyof InboxFinal | 'winner_team_id' | 'finished_at_ts', unknown>> = {}) =>
  mobileFinalSchema.parse({
    game_id: 'fin-1',
    league_id: 'L1',
    league_name: 'Harbour League',
    home_team_id: 'm-hawks',
    home_name: 'Harbour Hawks',
    away_team_id: 'm-owls',
    away_name: 'Night Owls',
    home_pts: 58,
    away_pts: 51,
    event_count: 48,
    finished_at: Date.parse('2026-09-27T07:05:00Z'),
    last_event_at: '2026-09-27T07:05:00Z',
    ...o,
  }) as InboxFinal;

describe('Finished games from the mobile app (M-02, M-05)', () => {
  it('reads string numbers as numbers and ignores columns the inbox does not use', () => {
    const f = mobileFinalSchema.parse({
      game_id: 'g',
      home_team_id: 'a',
      away_team_id: 'b',
      home_pts: '70',
      away_pts: '61',
      event_count: '64',
      finished_at: '1790000000000',
      last_event_at: null,
      winner_team_id: 'a',
      finished_at_ts: '2026-09-21T20:00:00Z',
    });
    expect(f).toMatchObject({ home_pts: 70, away_pts: 61, event_count: 64, league_name: null, home_name: null });
    expect('winner_team_id' in f).toBe(false);
    expect(() =>
      mobileFinalSchema.parse({ game_id: 'g', home_team_id: 'a', away_team_id: 'b', home_pts: 'x' }),
    ).toThrow();
  });

  it('words a card as the old inbox did, in the event time zone and DD/MM/YYYY', () => {
    const f = final();
    expect(resultLine(f)).toBe('Harbour Hawks 58 - 51 Night Owls');
    expect(resultLine(final({ home_name: null, home_pts: null }))).toBe('m-hawks ? - 51 Night Owls');
    expect(detailLine(f, 'Pacific/Auckland')).toBe('Harbour League · finished 27/09/2026 8:05 pm · 48 stats');
    expect(detailLine(final({ event_count: 1, league_name: null }), 'America/Vancouver')).toBe(
      'finished 27/09/2026 12:05 am · 1 stat',
    );
    expect(finishedWhen(null, 'Pacific/Auckland')).toBe('no finish time');
    expect(finishedWhen('not a time', 'Pacific/Auckland')).toBe('no finish time');
    expect(driftLine({ s1: 58, s2: 51, eventCount: 48 }, final({ home_pts: 60, event_count: 50 }))).toBe(
      'Published 58-51, the mobile app now says 60-51 (48 to 50 stats)',
    );
    expect(num('')).toBe('?');
    expect(num(0)).toBe('0');
  });

  it('keeps the old group order', () => {
    expect(GROUPS.map((g) => g.state)).toEqual([
      'proposed',
      'drifted',
      'ambiguous',
      'settling',
      'review',
      'unlinked',
      'unmatched',
      'approved',
    ]);
  });

  it('reader: fetches a league’s finished games with GET only, newest first', async () => {
    const calls: { url: URL; method?: string }[] = [];
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, method: init?.method });
      if (url.pathname.startsWith('/auth/'))
        return Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 });
      return Response.json(fixture.final_game_scores);
    });
    const rows = await createMobileReader('http://mobile.test', 'key', request).finals('league-open');
    expect(rows.map((r) => r.game_id)).toEqual(['fin-result', 'fin-empty', 'fin-settling', 'fin-ghost']);
    expect(rows[2]).toMatchObject({ home_pts: 20, away_pts: 18, event_count: 30 });
    const read = calls.find((c) => c.url.pathname === '/rest/v1/final_game_scores')!;
    expect(read.method).toBe('GET');
    expect(read.url.searchParams.get('league_id')).toBe('eq.league-open');
    expect(read.url.searchParams.get('order')).toBe('finished_at.desc,game_id.asc');
    expect(calls.filter((c) => c.url.pathname.startsWith('/rest/')).every((c) => c.method === 'GET')).toBe(true);
  });
});

// A published event with one linked division (Hawks, Owls, Kea) and one unlinked one.
const EVENT = '00000000-0000-4000-8000-000000000001';
const OPEN = '00000000-0000-4000-8000-0000000000d1';
const OTHER = '00000000-0000-4000-8000-0000000000d2';
const T = { hawks: 't-hawks', owls: 't-owls', kea: 't-kea', x: 't-x' };
const game = (id: string, t1: string | null, t2: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  division_id: OPEN,
  day: '2026-09-27',
  start_time: '19:00:00',
  court: 1,
  group_id: null,
  team1_id: t1,
  team2_id: t2,
  label: 'Open',
  type: 'group',
  is_playoff: false,
  bracket_game_id: null,
  team1_source: null,
  team2_source: null,
  playoff_round: null,
  position: 0,
  ...extra,
});
const eventRow = (linked = true) => ({
  id: EVENT,
  name: 'League Night',
  timezone: 'Pacific/Auckland',
  court_names: ['Court 1'],
  divisions: [
    {
      id: OPEN,
      name: 'Open',
      sort_order: 0,
      created_at: '2026-09-01',
      teams: [
        { id: T.hawks, name: 'Harbour Hawks', sort_order: 0, created_at: '1' },
        { id: T.owls, name: 'Night Owls', sort_order: 1, created_at: '2' },
        { id: T.kea, name: 'Kea', sort_order: 2, created_at: '3' },
      ],
      division_mobile_links: linked
        ? {
            league_id: 'L1',
            league_name: 'Harbour League',
            division_mobile_team_links: [
              { team_id: T.hawks, mobile_team_id: 'm-hawks' },
              { team_id: T.owls, mobile_team_id: 'm-owls' },
              { team_id: T.kea, mobile_team_id: 'm-kea' },
            ],
          }
        : null,
    },
    {
      id: OTHER,
      name: 'Social',
      sort_order: 1,
      created_at: '2026-09-02',
      teams: [{ id: T.x, name: 'X', sort_order: 0, created_at: '1' }],
      division_mobile_links: null,
    },
  ],
  games: [
    game('g1', T.hawks, T.owls, { position: 0 }),
    game('g2', T.owls, T.kea, { position: 1, start_time: '20:00:00' }),
    game('g3', T.hawks, T.kea, { position: 2, start_time: '21:00:00' }),
    // The final: seed 1 v seed 2 of the group, stored as TBD (resolved only once the group is complete).
    game('gf', null, null, {
      position: 3,
      day: '2026-09-28',
      type: 'final',
      is_playoff: true,
      bracket_game_id: 'po_1',
      team1_source: { type: 'seed', rank: 1 },
      team2_source: { type: 'seed', rank: 2 },
      playoff_round: 1,
    }),
  ],
});
const NOW = Date.parse('2026-09-28T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  fake.results = {
    events: { data: eventRow(), error: null },
    game_scores: { data: [], error: null },
    score_sources: { data: [], error: null },
  };
  fake.finals.mockResolvedValue([]);
});

describe('loadInbox (M-04 to M-09)', () => {
  it('says so when no division is linked, and never asks the mobile app', async () => {
    fake.results.events = { data: eventRow(false), error: null };
    const inbox = await loadInbox(EVENT, NOW);
    expect(inbox).toMatchObject({ notice: NOT_LINKED, items: [], divisions: [] });
    expect(fake.finals).not.toHaveBeenCalled();
  });

  it('offers nothing when the existing scores cannot be read (M-07)', async () => {
    fake.results.game_scores = { data: null, error: { message: 'boom' } };
    const inbox = await loadInbox(EVENT, NOW);
    expect(inbox).toMatchObject({ notice: SCORES_UNREADABLE, items: [] });
    expect(fake.finals).not.toHaveBeenCalled();
    fake.results.game_scores = { data: [], error: null };
    fake.results.score_sources = { data: null, error: { message: 'boom' } };
    expect((await loadInbox(EVENT, NOW))!.notice).toBe(SCORES_UNREADABLE);
  });

  it('returns null for an event it cannot read', async () => {
    fake.results.events = { data: null, error: null };
    expect(await loadInbox(EVENT, NOW)).toBeNull();
  });

  it('proposes the one unscored fixture, never a scored one, and only reads linked divisions', async () => {
    fake.results.game_scores = { data: [{ game_id: 'g2', s1: 0, s2: null }], error: null };
    fake.finals.mockResolvedValue([
      final({ game_id: 'a', home_team_id: 'm-owls', away_team_id: 'm-hawks' }),
      final({ game_id: 'b', home_team_id: 'm-owls', away_team_id: 'm-kea' }),
    ]);
    const inbox = (await loadInbox(EVENT, NOW))!;
    expect(fake.finals).toHaveBeenCalledTimes(1);
    expect(fake.finals).toHaveBeenCalledWith('L1');
    expect(inbox.divisions).toEqual([{ id: OPEN, name: 'Open', leagueName: 'Harbour League' }]);
    const [a, b] = inbox.items;
    expect(a!.result).toMatchObject({ state: 'proposed', pick: { gameId: 'g1' } });
    // g2 already holds a score (0 counts), so the Owls v Kea result has nothing left to match.
    expect(b!.result.state).toBe('unmatched');
    expect(inbox.scored).toEqual(['g2']);
    expect(inbox.teamNames[T.kea]).toBe('Kea');
  });

  it('matches a playoff game through its resolved teams once the group is complete (M-09)', async () => {
    // Hawks win both, Owls beat Kea: Hawks seed 1, Owls seed 2 -> the final is Hawks v Owls.
    fake.results.game_scores = {
      data: [
        { game_id: 'g1', s1: 60, s2: 50 },
        { game_id: 'g2', s1: 55, s2: 40 },
        { game_id: 'g3', s1: 70, s2: 30 },
      ],
      error: null,
    };
    fake.finals.mockResolvedValue([final({ game_id: 'f', finished_at: Date.parse('2026-09-28T08:00:00Z') })]);
    const inbox = (await loadInbox(EVENT, NOW))!;
    expect(inbox.items[0]!.result).toMatchObject({ state: 'proposed', pick: { gameId: 'gf', sameDay: true } });
    expect(inbox.games.find((g) => g.id === 'gf')).toMatchObject({ team1Id: T.hawks, team2Id: T.owls });
  });

  it('shows what was published beside a result that changed after approval', async () => {
    fake.results.game_scores = { data: [{ game_id: 'g1', s1: 58, s2: 51 }], error: null };
    fake.results.score_sources = {
      data: [
        {
          game_id: 'g1',
          mobile_game_id: 'fin-1',
          s1: 58,
          s2: 51,
          home_pts: 58,
          away_pts: 51,
          event_count: 48,
          last_event_at: '2026-09-27T07:05:00Z',
        },
        // A typed score with no mobile source is not a mobile approval.
        {
          game_id: 'g3',
          mobile_game_id: null,
          s1: 1,
          s2: 2,
          home_pts: null,
          away_pts: null,
          event_count: null,
          last_event_at: null,
        },
      ],
      error: null,
    };
    fake.finals.mockResolvedValue([final({ home_pts: 60, event_count: 50 })]);
    const [item] = (await loadInbox(EVENT, NOW))!.items;
    expect(item!.result).toMatchObject({ state: 'drifted', existing: { gameId: 'g1' } });
    expect(item!.published).toEqual({ s1: 58, s2: 51, eventCount: 48 });
  });

  it('reports a division the mobile app could not answer for, without the other divisions failing', async () => {
    fake.finals.mockRejectedValue(new Error('Mobile data unavailable'));
    const inbox = (await loadInbox(EVENT, NOW))!;
    expect(inbox.errors).toEqual(["Could not read Open's finished games from the mobile app. Refresh to try again."]);
    expect(inbox.items).toEqual([]);
    expect(inbox.notice).toBeNull();
  });
});
