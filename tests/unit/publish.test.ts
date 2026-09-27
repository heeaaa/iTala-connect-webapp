import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_GAMES_MESSAGE, publishProblem, republishWarning } from '@/domain/publish';
import { generateSchedule } from '@/domain/scheduler';
import { eventSetupFromRows, gameRows, type SetupDivisionRow } from '@/lib/schedule-rows';

const fake = vi.hoisted(() => ({
  authorize: vi.fn(),
  canEdit: vi.fn(),
  single: vi.fn(),
  count: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: fake.revalidate }));
vi.mock('@/server/auth', () => ({ authorizeAdmin: fake.authorize, canEditEvent: fake.canEdit }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: fake.rpc,
    from: (table: string) =>
      table === 'events'
        ? { select: () => ({ eq: () => ({ single: fake.single }) }) }
        : { select: () => ({ eq: () => ({ or: fake.count }) }) },
  }),
}));
import { publishEvent } from '@/server/actions/publish';

const id = '10000000-0000-4000-8000-000000000001';
const division = (n: number, teams: number, extra: Partial<SetupDivisionRow> = {}): SetupDivisionRow => ({
  id: `d${n}`,
  name: `Div ${n}`,
  bracket_count: 1,
  custom_games_per_team: false,
  games_per_team: null,
  sort_order: n,
  teams: Array.from({ length: teams }, (_, i) => ({ id: `d${n}t${i}`, sort_order: i })),
  ...extra,
});
const event = (divisions: SetupDivisionRow[], extra = {}) => ({
  schedule_days: ['2026-10-03'],
  time_start: '09:00:00',
  time_end: '20:00:00',
  courts: 2,
  divisions,
  ...extra,
});

describe('publishProblem (E-60)', () => {
  const ok = { name: 'Open', teamCount: 2, customGamesPerTeam: false, gamesPerTeam: 0 };
  it('uses the old messages in the old order', () => {
    expect(publishProblem({ days: [], divisions: [] })).toBe('Please select at least one event date on the calendar.');
    expect(publishProblem({ days: ['2026-10-03'], divisions: [] })).toBe('Please add at least one division.');
    expect(
      publishProblem({ days: ['2026-10-03'], divisions: [ok, { ...ok, customGamesPerTeam: true, gamesPerTeam: 0 }] }),
    ).toBe('Custom games per team is enabled but set to 0. Please enter a value or uncheck it.');
    expect(publishProblem({ days: ['2026-10-03'], divisions: [ok] })).toBeNull();
  });
  it('names every division with fewer than 2 teams, not just when all are short (Fix)', () => {
    expect(
      publishProblem({
        days: ['2026-10-03'],
        divisions: [ok, { ...ok, name: 'U12', teamCount: 1 }, { ...ok, name: '  ', teamCount: 0 }],
      }),
    ).toBe('Each division needs at least 2 teams. Add teams to: U12, Untitled division.');
  });
  it('checks team counts before the custom games value, as the old code did', () => {
    expect(publishProblem({ days: ['x'], divisions: [{ ...ok, teamCount: 1, customGamesPerTeam: true }] })).toMatch(
      /^Each division needs at least 2 teams/,
    );
  });
  it('words the re-publish warning for one, many and unknown scores (E-62)', () => {
    expect(republishWarning(1)).toContain('1 recorded score will be cleared');
    expect(republishWarning(3)).toContain('3 recorded scores will be cleared');
    expect(republishWarning(null)).toMatch(/^Could not check whether this event has recorded scores/);
    expect(NO_GAMES_MESSAGE).toMatch(/^Could not generate any games/);
  });
});

describe('schedule rows mapping', () => {
  it('orders divisions and teams by sort order and applies games per team only when ticked', () => {
    const setup = eventSetupFromRows({ ...event([]), schedule_days: ['2026-10-10', '2026-10-03', '2026-10-10'] }, [
      division(2, 2, { custom_games_per_team: true, games_per_team: 2 }),
      {
        ...division(1, 3, { games_per_team: 5 }),
        teams: [
          { id: 'b', sort_order: 1 },
          { id: 'a', sort_order: 0 },
        ],
      },
      division(3, 2, { custom_games_per_team: true, games_per_team: 0, bracket_count: 0 }),
    ]);
    expect(setup.days).toEqual(['2026-10-03', '2026-10-10']);
    expect(setup.timeStart).toBe('09:00');
    expect(setup.timeEnd).toBe('20:00');
    expect(setup.divisions.map((d) => [d.id, d.teamIds, d.gamesPerTeam, d.bracketCount])).toEqual([
      ['d1', ['a', 'b'], null, 1],
      ['d2', ['d2t0', 'd2t1'], 2, 1],
      ['d3', ['d3t0', 'd3t1'], null, 1],
    ]);
    expect(eventSetupFromRows({ ...event([]), courts: 0 }, []).courts).toBe(1);
  });
  it('turns games into insert rows with positions, unscheduled slots and playoff sources', () => {
    const rows = gameRows(
      [
        {
          day: '2026-10-03',
          time: '09:00',
          court: 1,
          divisionId: 'd1',
          groupId: 'A',
          team1Id: 'a',
          team2Id: 'b',
          label: 'Div - Group A',
          type: 'group',
          score1: null,
          score2: null,
        },
        {
          day: null,
          time: null,
          court: 2,
          divisionId: 'd1',
          groupId: null,
          team1Id: null,
          team2Id: null,
          label: 'Div - Finals',
          type: 'final',
          score1: null,
          score2: null,
          playoff: {
            bracketGameId: 'po_d1_3',
            round: 2,
            team1Source: { type: 'winner', bracketGameId: 'po_d1_1' },
            team2Source: { type: 'seed', rank: 1 },
          },
        },
      ],
      5,
    );
    expect(rows[0]).toMatchObject({ position: 5, day: '2026-10-03', start_time: '09:00', court: 1, is_playoff: false });
    expect(rows[0]).toMatchObject({ bracket_game_id: null, team1_source: null, playoff_round: null });
    expect(rows[1]).toEqual(
      expect.objectContaining({
        position: 6,
        day: null,
        start_time: null,
        court: null,
        is_playoff: true,
        bracket_game_id: 'po_d1_3',
        team1_source: { type: 'winner', bracketGameId: 'po_d1_1' },
        team2_source: { type: 'seed', rank: 1 },
        playoff_round: 2,
      }),
    );
  });
});

describe('publishEvent action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.authorize.mockResolvedValue({ ok: true });
    fake.canEdit.mockResolvedValue(true);
    // The same row serves the load and the version read after publishing.
    fake.single.mockResolvedValue({ data: { ...event([division(1, 4)]), updated_at: 'v9' }, error: null });
    fake.count.mockResolvedValue({ count: 0, error: null });
    fake.rpc.mockResolvedValue({ data: 6, error: null });
  });
  it('refuses before reading when unauthorised, not the owner, or given a bad id', async () => {
    fake.authorize.mockResolvedValue({ ok: false, error: 'Sign in' });
    expect(await publishEvent(id)).toEqual({ ok: false, error: 'Sign in' });
    fake.authorize.mockResolvedValue({ ok: true });
    expect((await publishEvent('not-a-uuid')).ok).toBe(false);
    fake.canEdit.mockResolvedValue(false);
    expect((await publishEvent(id)).ok).toBe(false);
    expect(fake.single).not.toHaveBeenCalled();
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it('publishes the schedule the ported scheduler generates from the saved event', async () => {
    const result = await publishEvent(id);
    expect(result).toEqual({ ok: true, data: { status: 'published', games: 6, version: 'v9' } });
    const expected = gameRows(generateSchedule(eventSetupFromRows(event([]), [division(1, 4)])));
    expect(fake.rpc).toHaveBeenCalledWith('publish_event', {
      p_event_id: id,
      p_games: expected,
      p_clear_scores: false,
    });
    expect(expected).toHaveLength(6);
    expect(fake.revalidate).toHaveBeenCalledWith(`/events/${id}`);
  });
  it('returns validation and generation problems without publishing', async () => {
    fake.single.mockResolvedValue({ data: event([division(1, 1)]), error: null });
    expect(await publishEvent(id)).toEqual({ ok: false, error: expect.stringContaining('Add teams to: Div 1') });
    fake.single.mockResolvedValue({ data: event([division(1, 2)], { time_end: '09:00:00' }), error: null });
    const none = await publishEvent(id);
    // No readable version: the editor then asks for a reload on its next save.
    expect(none).toEqual({ ok: true, data: { status: 'published', games: 6, version: '' } });
    expect(fake.rpc).toHaveBeenLastCalledWith(
      'publish_event',
      expect.objectContaining({ p_games: [expect.objectContaining({ day: null, start_time: null })] }),
    );
    // Two brackets of one team each give no games at all.
    fake.rpc.mockClear();
    fake.single.mockResolvedValue({ data: event([division(1, 2, { bracket_count: 2 })]), error: null });
    expect(await publishEvent(id)).toEqual({ ok: false, error: NO_GAMES_MESSAGE });
    expect(fake.rpc).not.toHaveBeenCalled();
    fake.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    expect((await publishEvent(id)).ok).toBe(false);
  });
  it('asks before clearing recorded scores, and says so when it cannot count them', async () => {
    fake.count.mockResolvedValue({ count: 3, error: null });
    expect(await publishEvent(id)).toEqual({ ok: true, data: { status: 'confirm', scores: 3 } });
    fake.count.mockResolvedValue({ count: null, error: { message: 'down' } });
    expect(await publishEvent(id)).toEqual({ ok: true, data: { status: 'confirm', scores: null } });
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(await publishEvent(id, true)).toEqual({ ok: true, data: { status: 'published', games: 6, version: 'v9' } });
    expect(fake.rpc).toHaveBeenCalledWith('publish_event', expect.objectContaining({ p_clear_scores: true }));
  });
  it('asks again when a score lands between the count and the publish', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { hint: 'scores_exist', message: 'x' } });
    fake.count.mockResolvedValueOnce({ count: 0, error: null }).mockResolvedValueOnce({ count: 1, error: null });
    expect(await publishEvent(id)).toEqual({ ok: true, data: { status: 'confirm', scores: 1 } });
    fake.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'secret detail' } });
    expect(await publishEvent(id)).toEqual({
      ok: false,
      error: 'Could not publish the event. Nothing was changed. Please try again.',
    });
    expect(fake.revalidate).not.toHaveBeenCalled();
  });
});
