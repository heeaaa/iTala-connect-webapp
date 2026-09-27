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
  // A chainable query recorder: every call is logged; awaiting a terminal
  // (single, maybeSingle) returns the result set for "<table>.<first op>".
  // Awaiting the chain itself (a list query) works the same way; rpc calls
  // are logged under table "rpc" with the function name as the op.
  createClient: async () => ({
    from: (table: string) => {
      let first = '';
      const chain: Record<string, unknown> = {};
      for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'limit'])
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
    rpc: async (fn: string, args: unknown) => {
      fake.calls.push({ table: 'rpc', op: fn, args: [args] });
      return fake.results[`rpc.${fn}`] ?? { data: null, error: null };
    },
  }),
}));
import { deleteGame, dropGame, saveGame, type DropInput, type GameInput } from '@/server/actions/games';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = (extra: Partial<GameInput> = {}): GameInput => ({
  eventId: uuid(1),
  day: '2026-10-03',
  time: '09:00',
  court: 2,
  divisionId: uuid(10),
  label: 'Open',
  team1Id: uuid(101),
  team2Id: uuid(102),
  type: 'group',
  ...extra,
});
const calls = (table: string, op: string) =>
  fake.calls.filter((c: Call) => c.table === table && c.op === op).map((c: Call) => c.args);

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
  fake.results = {
    'events.select': { data: { courts: 2, court_names: ['Court 1', 'West court'] }, error: null },
    'games.select': { data: { position: 7 }, error: null },
    'games.insert': { data: { id: uuid(300) }, error: null },
    'games.update': { data: { id: uuid(200) }, error: null },
    'games.delete': { data: { id: uuid(200) }, error: null },
  };
  fake.authorize.mockResolvedValue({ ok: true });
  fake.canEdit.mockResolvedValue(true);
});

describe('saveGame (E-46 to E-50)', () => {
  it('adds a game after the last position without touching scores', async () => {
    expect(await saveGame(input())).toEqual({ ok: true, data: { id: uuid(300) } });
    expect(calls('games', 'insert')[0]![0]).toEqual({
      day: '2026-10-03',
      start_time: '09:00',
      court: 2,
      division_id: uuid(10),
      label: 'Open',
      team1_id: uuid(101),
      team2_id: uuid(102),
      type: 'group',
      event_id: uuid(1),
      position: 8,
    });
    expect(fake.calls.some((c: Call) => c.table === 'game_scores')).toBe(false);
    expect(fake.revalidate).toHaveBeenCalledWith(`/events/${uuid(1)}`);
  });
  it('keeps a game with a blank day or time Unscheduled', async () => {
    await saveGame(input({ id: uuid(200), time: null }));
    expect(calls('games', 'update')[0]![0]).toMatchObject({ day: null, start_time: null, court: null });
    expect(calls('games', 'eq')).toContainEqual(['event_id', uuid(1)]);
  });
  it('keeps bracket links unless the game is detached', async () => {
    await saveGame(input({ id: uuid(200) }));
    expect(calls('games', 'update')[0]![0]).not.toHaveProperty('is_playoff');
    await saveGame(input({ id: uuid(200), detach: true }));
    expect(calls('games', 'update')[1]![0]).toMatchObject({
      is_playoff: false,
      bracket_game_id: null,
      team1_source: null,
      team2_source: null,
      playoff_round: null,
    });
  });
  it('refuses a team playing itself, an unknown court and bad input before writing', async () => {
    expect(await saveGame(input({ team2Id: uuid(101) }))).toEqual({
      ok: false,
      error: "A team can't play itself. Pick two different teams.",
    });
    expect(await saveGame(input({ court: 3 }))).toEqual({ ok: false, error: 'Choose a court from 1 to 2.' });
    expect((await saveGame(input({ time: '9am' }))).ok).toBe(false);
    expect(calls('games', 'insert')).toEqual([]);
  });
  it('names the taken slot when the slot index refuses the write', async () => {
    fake.results['games.insert'] = { data: null, error: { code: '23505', message: 'games_slot_unique' } };
    expect(await saveGame(input())).toEqual({
      ok: false,
      error: 'That slot (03/10/2026 9:00 am West court) is already taken.',
    });
    fake.results['games.insert'] = { data: null, error: { code: '42501', message: 'secret' } };
    expect(await saveGame(input())).toEqual({ ok: false, error: 'Could not save the game. Refresh and try again.' });
    expect(fake.revalidate).not.toHaveBeenCalled();
  });
  it('refuses unauthorised callers and other owners', async () => {
    fake.canEdit.mockResolvedValue(false);
    expect((await saveGame(input())).ok).toBe(false);
    fake.authorize.mockResolvedValue({ ok: false, error: 'Sign in' });
    expect(await saveGame(input())).toEqual({ ok: false, error: 'Sign in' });
    expect(fake.calls).toEqual([]);
  });
});

describe('deleteGame (E-49)', () => {
  it('deletes one game of this event', async () => {
    expect(await deleteGame(uuid(1), uuid(200))).toEqual({ ok: true, data: undefined });
    expect(calls('games', 'eq')).toEqual([
      ['id', uuid(200)],
      ['event_id', uuid(1)],
    ]);
  });
  it('refuses bad ids, other owners and failed deletes', async () => {
    expect((await deleteGame('x', uuid(200))).ok).toBe(false);
    fake.canEdit.mockResolvedValueOnce(false);
    expect((await deleteGame(uuid(1), uuid(200))).ok).toBe(false);
    fake.results['games.delete'] = { data: null, error: null };
    expect(await deleteGame(uuid(1), uuid(200))).toEqual({
      ok: false,
      error: 'Could not delete the game. Refresh and try again.',
    });
  });
});

describe('dropGame (E-45)', () => {
  // Stored rows: game 200 at Sat 9:00 on court 1, game 201 at Sat 10:00 on court 2, others unscheduled.
  const stored: Record<number, { day: string | null; start_time: string | null; court: number | null }> = {
    200: { day: '2026-10-03', start_time: '09:00:00', court: 1 },
    201: { day: '2026-10-03', start_time: '10:00:00', court: 2 },
  };
  const found = (...ids: number[]) => ({
    data: ids.map((n) => ({ id: uuid(n), ...(stored[n] ?? { day: null, start_time: null, court: null }) })),
    error: null,
  });
  const seen = {
    200: { day: '2026-10-03', time: '09:00', court: 1 },
    201: { day: '2026-10-03', time: '10:00', court: 2 },
  };
  const swap = (other = 201, extra: Partial<DropInput> = {}): DropInput =>
    ({
      kind: 'swap',
      eventId: uuid(1),
      gameId: uuid(200),
      otherId: uuid(other),
      gameSlot: seen[200],
      otherSlot: seen[201],
      ...extra,
    }) as DropInput;
  const move = (extra: Partial<DropInput> = {}): DropInput =>
    ({
      kind: 'move',
      eventId: uuid(1),
      gameId: uuid(200),
      day: '2026-10-03',
      time: '10:00',
      court: 2,
      ...extra,
    }) as DropInput;
  const rpcs = () => fake.calls.filter((c: Call) => c.table === 'rpc').map((c: Call) => [c.op, c.args[0]]);

  it('moves a game of this event to a free slot through move_game', async () => {
    fake.results['games.select'] = found(200);
    expect(await dropGame(move())).toEqual({ ok: true, data: undefined });
    expect(calls('games', 'eq')).toContainEqual(['event_id', uuid(1)]);
    expect(calls('games', 'in')).toEqual([['id', [uuid(200)]]]);
    expect(rpcs()).toEqual([
      ['move_game', { p_game_id: uuid(200), p_day: '2026-10-03', p_start_time: '10:00', p_court: 2 }],
    ]);
    expect(fake.revalidate).toHaveBeenCalledWith(`/admin/events/${uuid(1)}`);
    expect(fake.calls.some((c: Call) => c.table === 'game_scores')).toBe(false);
  });

  it('swaps two games and unschedules one through their database functions', async () => {
    fake.results['games.select'] = found(200, 201);
    expect(await dropGame(swap())).toEqual({
      ok: true,
      data: undefined,
    });
    fake.results['games.select'] = found(200);
    expect(await dropGame({ kind: 'unschedule', eventId: uuid(1), gameId: uuid(200) })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(rpcs()).toEqual([
      ['swap_games', { p_a: uuid(200), p_b: uuid(201) }],
      ['unschedule_game', { p_game_id: uuid(200) }],
    ]);
  });

  it('refuses a swap when either game has moved since the organiser saw it', async () => {
    // Another window unscheduled game 201 after this grid was drawn.
    stored[201] = { day: null, start_time: null, court: null };
    fake.results['games.select'] = found(200, 201);
    try {
      expect(await dropGame(swap())).toEqual({
        ok: false,
        error: 'The schedule changed in another window. It has been refreshed; try again.',
      });
      fake.results['games.select'] = found(200, 201);
      expect(await dropGame(swap(201, { otherSlot: { day: null, time: null, court: null } }))).toEqual({
        ok: true,
        data: undefined,
      });
    } finally {
      stored[201] = { day: '2026-10-03', start_time: '10:00:00', court: 2 };
    }
    expect(rpcs()).toEqual([['swap_games', { p_a: uuid(200), p_b: uuid(201) }]]);
    expect(fake.revalidate).toHaveBeenCalledWith(`/admin/events/${uuid(1)}`);
  });

  it('names the taken slot and refreshes when another change got there first', async () => {
    fake.results['games.select'] = found(200);
    fake.results['rpc.move_game'] = { data: null, error: { code: '23505', message: 'games_slot_unique' } };
    expect(await dropGame(move())).toEqual({
      ok: false,
      error: 'That slot (03/10/2026 10:00 am West court) is already taken. The schedule has been refreshed.',
    });
    expect(fake.revalidate).toHaveBeenCalledWith(`/admin/events/${uuid(1)}`);
    fake.results['rpc.move_game'] = { data: null, error: { code: '42501', message: 'secret detail' } };
    expect(await dropGame(move())).toEqual({
      ok: false,
      error: 'Could not move the game. The schedule has been refreshed; try again.',
    });
  });

  it('refuses games from another event, a court the event lacks and bad input before any write', async () => {
    fake.results['games.select'] = found(200);
    expect(await dropGame(swap(999))).toEqual({
      ok: false,
      error: 'The schedule changed in another window. It has been refreshed; try again.',
    });
    expect(await dropGame(move({ court: 3 } as Partial<DropInput>))).toEqual({
      ok: false,
      error: 'Choose a court from 1 to 2.',
    });
    fake.results['events.select'] = { data: null, error: null };
    expect((await dropGame(move())).ok).toBe(false);
    expect((await dropGame(move({ time: '25:00' } as Partial<DropInput>))).ok).toBe(false);
    expect((await dropGame(swap(200))).ok).toBe(false);
    expect((await dropGame({ kind: 'teleport' } as unknown as DropInput)).ok).toBe(false);
    expect(rpcs()).toEqual([]);
  });

  it('refuses unauthorised callers and other owners', async () => {
    fake.canEdit.mockResolvedValue(false);
    expect(await dropGame(move())).toEqual({ ok: false, error: 'You can only edit your own events.' });
    fake.authorize.mockResolvedValue({ ok: false, error: 'Sign in' });
    expect(await dropGame(move())).toEqual({ ok: false, error: 'Sign in' });
    expect(fake.calls).toEqual([]);
  });
});
