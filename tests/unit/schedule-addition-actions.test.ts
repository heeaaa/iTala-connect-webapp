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
vi.mock('@/server/auth', () => ({ authorizeAdmin: fake.authorize, canEditEvent: fake.canEdit }));
vi.mock('@/lib/supabase/server', () => ({
  // Records every call; a terminal (single) returns the result set for "<table>.<first op>",
  // and rpc calls are logged under table "rpc" with the function name as the op.
  createClient: async () => ({
    from: (table: string) => {
      let first = '';
      const chain: Record<string, unknown> = {};
      for (const op of ['select', 'eq'])
        chain[op] = (...args: unknown[]) => {
          if (!first) first = op;
          fake.calls.push({ table, op, args });
          return chain;
        };
      chain.single = async () => fake.results[`${table}.${first}`] ?? { data: null, error: null };
      return chain;
    },
    rpc: async (fn: string, args: unknown) => {
      fake.calls.push({ table: 'rpc', op: fn, args: [args] });
      return fake.results[`rpc.${fn}`] ?? { data: 0, error: null };
    },
  }),
}));
import { addPlayoff, addRoundRobin } from '@/server/actions/schedule-additions';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EVENT = uuid(1);
const OPEN = uuid(10);
const [HAWKS, OWLS, KEA, TUI] = [uuid(101), uuid(102), uuid(103), uuid(104)];

type Row = Record<string, unknown>;
const gameRow = (n: number, extra: Row = {}): Row => ({
  id: uuid(200 + n),
  division_id: OPEN,
  day: null,
  start_time: null,
  court: null,
  group_id: null,
  team1_id: null,
  team2_id: null,
  label: 'Open',
  type: 'group',
  is_playoff: false,
  bracket_game_id: null,
  team1_source: null,
  team2_source: null,
  playoff_round: null,
  position: n,
  ...extra,
});
const stored = (games: Row[], division: Row = {}, event: Row = {}) => ({
  data: {
    schedule_days: ['2026-10-03'],
    time_start: '09:00:00',
    time_end: '20:00:00',
    courts: 1,
    divisions: [
      {
        id: OPEN,
        name: 'Open',
        bracket_count: 1,
        custom_games_per_team: false,
        games_per_team: null,
        sort_order: 0,
        teams: [HAWKS, OWLS, KEA].map((id, i) => ({ id, sort_order: i })),
        ...division,
      },
    ],
    games,
    ...event,
  },
  error: null,
});
const rpc = (fn: string) =>
  fake.calls.filter((c: Call) => c.table === 'rpc' && c.op === fn).map((c: Call) => c.args[0] as Row);
const pairs = (rows: Row[]) => rows.map((g) => [g.team1_id, g.team2_id].sort().join('|')).sort();
const pair = (a: string, b: string) => [a, b].sort().join('|');

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
  fake.results = {};
  fake.authorize.mockResolvedValue({ ok: true });
  fake.canEdit.mockResolvedValue(true);
});

describe('addRoundRobin (E-63)', () => {
  // Hawks v Owls is already on at 9:00, stored at position 4.
  const hawksOwls = gameRow(4, {
    day: '2026-10-03',
    start_time: '09:00:00',
    court: 1,
    team1_id: HAWKS,
    team2_id: OWLS,
  });

  it('adds the missing matchups after the last position and keeps the choice on the division', async () => {
    fake.results['events.select'] = stored([hawksOwls]);
    const result = await addRoundRobin({ eventId: EVENT, divisionId: OPEN, custom: false, gamesPerTeam: 0 });
    const [call] = rpc('add_round_robin');
    expect(call).toMatchObject({
      p_event_id: EVENT,
      p_division_id: OPEN,
      p_custom: false,
      p_games_per_team: 0,
      p_unschedule: [],
    });
    const games = call!.p_games as Row[];
    expect(pairs(games)).toEqual([pair(HAWKS, KEA), pair(OWLS, KEA)].sort());
    expect(games.map((g) => g.position)).toEqual([5, 6]);
    // Fills free slots only, never 9:00, and keeps the 2-hour rest after it.
    expect(games.every((g) => g.start_time === null || String(g.start_time) >= '11:00')).toBe(true);
    expect(result).toEqual({
      ok: true,
      data: { added: 2, unscheduled: games.filter((g) => !g.day).length, moved: 0 },
    });
    expect(fake.revalidate).toHaveBeenCalledWith(`/admin/events/${EVENT}`);
    expect(fake.revalidate).toHaveBeenCalledWith(`/events/${EVENT}`);
    expect(fake.calls.some((c: Call) => c.table === 'game_scores')).toBe(false);
  });

  it('makes a full round robin whatever custom number was saved before, as the old editor did', async () => {
    // Saved: 1 game per team. Unticking Custom must not fall back to it.
    fake.results['events.select'] = stored([], { custom_games_per_team: true, games_per_team: 1 });
    await addRoundRobin({ eventId: EVENT, divisionId: OPEN, custom: false, gamesPerTeam: 0 });
    expect(pairs(rpc('add_round_robin')[0]!.p_games as Row[])).toHaveLength(3);
    fake.calls.length = 0;
    await addRoundRobin({ eventId: EVENT, divisionId: OPEN, custom: true, gamesPerTeam: 1 });
    const [call] = rpc('add_round_robin');
    expect(call).toMatchObject({ p_custom: true, p_games_per_team: 1 });
    expect((call!.p_games as Row[]).length).toBeLessThan(3);
  });

  it('counts a playoff game with its stored teams, not the teams its bracket would resolve to', async () => {
    const playoff = {
      day: '2026-10-03',
      start_time: '19:00:00',
      court: 1,
      type: 'final',
      is_playoff: true,
      bracket_game_id: `po_${OPEN}_1`,
      team1_source: { type: 'seed', rank: 1 },
      team2_source: { type: 'seed', rank: 2 },
      playoff_round: 1,
    };
    // Stored as TBD (what the new app writes): every matchup is still missing.
    fake.results['events.select'] = stored([gameRow(0, playoff)]);
    await addRoundRobin({ eventId: EVENT, divisionId: OPEN, custom: false, gamesPerTeam: 0 });
    expect(pairs(rpc('add_round_robin')[0]!.p_games as Row[])).toHaveLength(3);
    // Stored with real teams (hand-picked, or resolved and saved by the old app): that matchup counts.
    fake.calls.length = 0;
    fake.results['events.select'] = stored([gameRow(0, { ...playoff, team1_id: HAWKS, team2_id: OWLS })]);
    await addRoundRobin({ eventId: EVENT, divisionId: OPEN, custom: false, gamesPerTeam: 0 });
    expect(pairs(rpc('add_round_robin')[0]!.p_games as Row[])).not.toContain(pair(HAWKS, OWLS));
  });

  it('first moves games the event no longer fits to Unscheduled, so their slots and rest count no more', async () => {
    // On a day the event no longer has: it goes to Unscheduled, and its matchup is still counted.
    const gone = gameRow(5, { day: '2026-12-25', start_time: '09:00:00', court: 1, team1_id: HAWKS, team2_id: KEA });
    fake.results['events.select'] = stored([hawksOwls, gone]);
    const result = await addRoundRobin({ eventId: EVENT, divisionId: OPEN, custom: false, gamesPerTeam: 0 });
    const [call] = rpc('add_round_robin');
    expect(call!.p_unschedule).toEqual([uuid(205)]);
    expect(pairs(call!.p_games as Row[])).toEqual([pair(OWLS, KEA)]);
    expect(result).toMatchObject({ ok: true, data: { added: 1, moved: 1 } });
  });

  it('still saves the choice when every matchup is already on', async () => {
    fake.results['events.select'] = stored([
      hawksOwls,
      gameRow(5, { team1_id: HAWKS, team2_id: KEA }),
      gameRow(6, { team1_id: OWLS, team2_id: KEA }),
    ]);
    expect(await addRoundRobin({ eventId: EVENT, divisionId: OPEN, custom: false, gamesPerTeam: 0 })).toEqual({
      ok: true,
      data: { added: 0, unscheduled: 0, moved: 0 },
    });
    expect(rpc('add_round_robin')[0]!.p_games).toEqual([]);
  });

  it('refuses with the old messages before writing anything', async () => {
    const run = (extra: Partial<Parameters<typeof addRoundRobin>[0]> = {}) =>
      addRoundRobin({ eventId: EVENT, divisionId: OPEN, custom: false, gamesPerTeam: 0, ...extra });
    fake.results['events.select'] = stored([]);
    expect(await run({ custom: true, gamesPerTeam: 4 })).toEqual({
      ok: false,
      error: 'With 3 teams each team can play at most 3 games without a repeat matchup.',
    });
    expect((await run({ custom: true, gamesPerTeam: 0 })).ok).toBe(false);
    expect((await run({ gamesPerTeam: 1.5 })).ok).toBe(false);
    expect(await run({ divisionId: uuid(99) })).toEqual({
      ok: false,
      error: 'That division is not in this event. Refresh and try again.',
    });
    fake.results['events.select'] = stored([], { teams: [{ id: HAWKS, sort_order: 0 }] });
    expect(await run()).toEqual({ ok: false, error: 'This division needs at least 2 teams.' });
    fake.results['events.select'] = stored([], {}, { schedule_days: [] });
    expect(await run()).toEqual({ ok: false, error: 'Select at least one event date first.' });
    fake.results['events.select'] = { data: null, error: { message: 'boom' } };
    expect(await run()).toEqual({ ok: false, error: 'Could not load the event. Please try again.' });
    expect(rpc('add_round_robin')).toEqual([]);
    expect(fake.revalidate).not.toHaveBeenCalled();
  });

  it('reports a failed write without detail, and refuses other owners and signed-out callers', async () => {
    fake.results['events.select'] = stored([]);
    fake.results['rpc.add_round_robin'] = { data: null, error: { code: '42501', message: 'secret detail' } };
    expect(await addRoundRobin({ eventId: EVENT, divisionId: OPEN, custom: false, gamesPerTeam: 0 })).toEqual({
      ok: false,
      error: 'Could not add the round robin. Nothing was changed. Please try again.',
    });
    fake.calls.length = 0;
    fake.canEdit.mockResolvedValue(false);
    expect(await addRoundRobin({ eventId: EVENT, divisionId: OPEN, custom: false, gamesPerTeam: 0 })).toEqual({
      ok: false,
      error: 'You can only edit your own events.',
    });
    fake.authorize.mockResolvedValue({ ok: false, error: 'Please sign in again.' });
    expect(await addRoundRobin({ eventId: EVENT, divisionId: OPEN, custom: false, gamesPerTeam: 0 })).toEqual({
      ok: false,
      error: 'Please sign in again.',
    });
    expect(fake.calls).toEqual([]);
  });
});

describe('addPlayoff (E-64)', () => {
  const four = { teams: [HAWKS, OWLS, KEA, TUI].map((id, i) => ({ id, sort_order: i })) };
  const last = gameRow(3, { day: '2026-10-03', start_time: '12:00:00', court: 1, team1_id: HAWKS, team2_id: OWLS });

  it('adds a seeded bracket an hour after the latest game, on court 1, after the last position', async () => {
    fake.results['events.select'] = stored([last], four);
    const result = await addPlayoff({ eventId: EVENT, divisionId: OPEN, teams: 4 });
    const [call] = rpc('add_playoff');
    expect(call!.p_event_id).toBe(EVENT);
    const games = call!.p_games as Row[];
    expect(games.map((g) => [g.label, g.start_time, g.court, g.position])).toEqual([
      ['Open - Semi 1', '13:00', 1, 4],
      ['Open - Semi 2', '14:00', 1, 5],
      ['Open - Finals', '15:00', 1, 6],
    ]);
    expect(games[0]).toMatchObject({
      is_playoff: true,
      type: 'semi',
      bracket_game_id: `po_${OPEN}_1`,
      team1_id: null,
      team2_id: null,
      team1_source: { type: 'seed', rank: 1 },
      team2_source: { type: 'seed', rank: 4 },
      playoff_round: 1,
    });
    expect(games[2]).toMatchObject({ type: 'final', team1_source: { type: 'winner', bracketGameId: `po_${OPEN}_1` } });
    expect(result).toEqual({ ok: true, data: { added: 3, unscheduled: 0, moved: 0 } });
    expect(call!.p_unschedule).toEqual([]);
    expect(fake.revalidate).toHaveBeenCalledWith(`/admin/events/${EVENT}`);
  });

  it('sends games that cannot fit to Unscheduled rather than an invalid time', async () => {
    fake.results['events.select'] = stored([last], four, { time_end: '14:00:00' });
    const result = await addPlayoff({ eventId: EVENT, divisionId: OPEN, teams: 4 });
    const games = rpc('add_playoff')[0]!.p_games as Row[];
    expect(games.map((g) => g.start_time)).toEqual(['13:00', null, null]);
    expect(result).toEqual({ ok: true, data: { added: 3, unscheduled: 2, moved: 0 } });
  });

  it('first moves games the event no longer fits to Unscheduled, as the old editor did', async () => {
    // Added at 20:30 through the game dialog, after the event's 20:00 end.
    const late = gameRow(4, { day: '2026-10-03', start_time: '20:30:00', court: 1, team1_id: KEA, team2_id: TUI });
    fake.results['events.select'] = stored([last, late], four);
    const result = await addPlayoff({ eventId: EVENT, divisionId: OPEN, teams: 2 });
    const [call] = rpc('add_playoff');
    expect(call!.p_unschedule).toEqual([uuid(204)]);
    // The bracket starts an hour after the last game that still fits, not after 20:30.
    expect((call!.p_games as Row[]).map((g) => g.start_time)).toEqual(['13:00']);
    expect(result).toEqual({ ok: true, data: { added: 1, unscheduled: 0, moved: 1 } });
  });

  it('refuses too few teams, an out-of-range count, other divisions and failed writes', async () => {
    fake.results['events.select'] = stored([], four);
    expect(await addPlayoff({ eventId: EVENT, divisionId: OPEN, teams: 5 })).toEqual({
      ok: false,
      error: 'Choose between 2 and 4 teams.',
    });
    expect((await addPlayoff({ eventId: EVENT, divisionId: OPEN, teams: 2.5 })).ok).toBe(false);
    expect((await addPlayoff({ eventId: EVENT, divisionId: uuid(99), teams: 2 })).ok).toBe(false);
    fake.results['events.select'] = stored([], { teams: [{ id: HAWKS, sort_order: 0 }] });
    expect(await addPlayoff({ eventId: EVENT, divisionId: OPEN, teams: 2 })).toEqual({
      ok: false,
      error: 'Need at least 2 teams.',
    });
    expect(rpc('add_playoff')).toEqual([]);
    fake.results['events.select'] = stored([], four);
    fake.results['rpc.add_playoff'] = { data: null, error: { message: 'nope' } };
    expect(await addPlayoff({ eventId: EVENT, divisionId: OPEN, teams: 2 })).toEqual({
      ok: false,
      error: 'Could not add the playoff. Nothing was changed. Please try again.',
    });
    fake.canEdit.mockResolvedValue(false);
    expect((await addPlayoff({ eventId: EVENT, divisionId: OPEN, teams: 2 })).ok).toBe(false);
    fake.results['events.select'] = { data: null, error: null };
    fake.canEdit.mockResolvedValue(true);
    expect((await addPlayoff({ eventId: EVENT, divisionId: OPEN, teams: 2 })).ok).toBe(false);
  });
});
