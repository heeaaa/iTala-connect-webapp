import { describe, expect, it } from 'vitest';

import { buildReport, ReportInputError } from '@/features/reports/build';
import type { ReportDefinition, ReportSource } from '@/features/reports/model';
import { reportDocumentSchema } from '@/features/reports/schema';

const source: ReportSource = {
  event: { id: 'event', name: 'October League', timezone: 'Pacific/Auckland' },
  divisions: [{ id: 'division', name: 'Senior' }],
  teams: [
    { id: 'a', divisionId: 'division', name: 'Aces' },
    { id: 'b', divisionId: 'division', name: 'Blues' },
  ],
  players: [
    { id: 'p', name: 'Ari' },
    { id: 'q', name: 'Quinn' },
  ],
  readAt: '2026-10-02T00:00:00.000Z',
  games: [
    {
      id: 'g1',
      divisionId: 'division',
      date: '2026-10-01',
      startTime: '10:00',
      type: 'group',
      homeTeamId: 'a',
      awayTeamId: 'b',
      homeScore: 6,
      awayScore: 2,
      mobileGameId: 'm1',
      mobileFinal: true,
      mobileEvents: [
        { id: 'e1', teamId: 'a', playerId: 'p', type: 'fg2_make' },
        { id: 'e2', teamId: 'a', playerId: 'p', type: 'fg3_make' },
        { id: 'e3', teamId: 'a', playerId: null, type: 'ft_make' },
        { id: 'e4', teamId: 'b', playerId: 'q', type: 'fg2_make' },
      ],
      manifests: [
        {
          teamId: 'a',
          scoring: 'complete',
          shots: { fg2: 'complete', fg3: 'complete', ft: 'complete' },
          turnovers: 'not-tracked',
          appearances: 'confirmed',
          playerIds: ['p'],
          eventCount: 3,
        },
        {
          teamId: 'b',
          scoring: 'complete',
          shots: { fg2: 'complete', fg3: 'complete', ft: 'complete' },
          turnovers: 'not-tracked',
          appearances: 'confirmed',
          playerIds: ['q'],
          eventCount: 1,
        },
      ],
    },
    {
      id: 'g2',
      divisionId: 'division',
      date: '2026-10-02',
      startTime: '10:00',
      type: 'group',
      homeTeamId: 'b',
      awayTeamId: 'a',
      homeScore: 4,
      awayScore: 0,
      mobileGameId: null,
      mobileFinal: false,
      mobileEvents: [],
      manifests: [],
    },
    {
      id: 'g3',
      divisionId: 'division',
      date: '2026-10-03',
      startTime: '10:00',
      type: 'group',
      homeTeamId: 'a',
      awayTeamId: 'b',
      homeScore: null,
      awayScore: null,
      mobileGameId: null,
      mobileFinal: false,
      mobileEvents: [],
      manifests: [],
    },
  ],
};

function definition(template: ReportDefinition['template'], options: Partial<ReportDefinition> = {}): ReportDefinition {
  return { eventId: 'event', template, dateMode: 'all', dates: [], ...options };
}
function report(template: ReportDefinition['template'], options: Partial<ReportDefinition> = {}) {
  return buildReport(source, definition(template, options), '2026-10-02T01:00:00.000Z');
}

describe('Connect Reports calculations', () => {
  it('offers a whole-league box book, one-day book, and one selected game box score', () => {
    const whole = report('box-score', { divisionId: 'division' });
    const day = report('box-score', { divisionId: 'division', dateMode: 'day', dates: ['2026-10-01'] });
    const selected = report('box-score', { divisionId: 'division', gameIds: ['g2'] });
    // Two games: the player totals come first, then one box score per game.
    expect(whole.tables.map((t) => t.title)).toEqual([
      'Player totals · 2 games',
      'Thu 01/10/2026 · 10:00 am · Senior: Aces 6 - 2 Blues',
      'Fri 02/10/2026 · 10:00 am · Senior: Blues 4 - 0 Aces',
    ]);
    expect(whole.tables[1]!.columns.map((column) => column.key)).toEqual(
      expect.arrayContaining(['gameId', 'teamId', 'playerId']),
    );
    expect(day.gameIds).toEqual(['g1']);
    expect(day.tables.map((t) => t.title)).toEqual(['Thu 01/10/2026 · 10:00 am · Senior: Aces 6 - 2 Blues']);
    expect(selected.gameIds).toEqual(['g2']);
    // A game with only a Connect score shows each side's final score.
    expect(selected.tables[0]!.rows).toEqual([
      expect.objectContaining({ team: 'Blues', entry: 'Final score', player: 'Final score', points: 4, fg2: null }),
      expect.objectContaining({ team: 'Aces', entry: 'Final score', player: 'Final score', points: 0, fg2: null }),
    ]);
    expect(() => report('box-score', { gameIds: ['foreign'] })).toThrow('Game unavailable');
  });

  it("lists each player's stat line with a team total in a game's box score", () => {
    const box = report('box-score', { gameIds: ['g1'] });
    expect(box.tables).toHaveLength(1);
    expect(box.tables[0]!.rows).toEqual([
      expect.objectContaining({
        gameId: 'g1',
        teamId: 'a',
        team: 'Aces',
        entry: 'Player',
        playerId: 'p',
        player: 'Ari',
        points: 5,
        fg2: 1,
        fg3: 1,
        ft: 0,
      }),
      expect.objectContaining({
        teamId: 'a',
        entry: 'Team (no player)',
        player: 'Team (no player)',
        points: 1,
        fg2: 0,
        fg3: 0,
        ft: 1,
      }),
      expect.objectContaining({
        teamId: 'a',
        entry: 'Team total',
        player: 'Team total',
        points: 6,
        fg2: 1,
        fg3: 1,
        ft: 1,
      }),
      expect.objectContaining({
        teamId: 'b',
        team: 'Blues',
        entry: 'Player',
        playerId: 'q',
        player: 'Quinn',
        points: 2,
        fg2: 1,
      }),
      expect.objectContaining({ teamId: 'b', entry: 'Team total', points: 2, fg2: 1, fg3: 0, ft: 0 }),
    ]);
    expect(box.notes).toContain(
      'Team total adds up the recorded stats. When it differs from the official score, the final score follows it.',
    );
  });

  it('orders players by points and shows the official score when the recorded total differs', () => {
    const busy: ReportSource = structuredClone(source);
    busy.players.push({ id: 'r', name: 'Rua' });
    busy.games[0]!.homeScore = 9;
    busy.games[0]!.mobileEvents.push(
      { id: 'e5', teamId: 'a', playerId: 'r', type: 'fg3_make' },
      { id: 'e6', teamId: 'a', playerId: 'r', type: 'fg3_make' },
    );
    busy.games[0]!.manifests[0]!.eventCount = 5;
    const box = buildReport(busy, definition('box-score', { gameIds: ['g1'] }), '2026-10-02T01:00:00.000Z');
    expect(box.tables[0]!.title).toBe('Thu 01/10/2026 · 10:00 am · Senior: Aces 9 - 2 Blues');
    expect(box.tables[0]!.rows.filter((r) => r.teamId === 'a').map((r) => [r.player, r.points])).toEqual([
      ['Rua', 6],
      ['Ari', 5],
      ['Team (no player)', 1],
      ['Team total', 12],
      ['Final score (3 more in player stats)', 9],
    ]);
    // The side whose recorded total matches its score has no extra line.
    expect(box.tables[0]!.rows.filter((r) => r.teamId === 'b').map((r) => r.player)).toEqual(['Quinn', 'Team total']);
  });

  it('adds up each player across the games of a box score book', () => {
    const twice: ReportSource = structuredClone(source);
    Object.assign(twice.games[1]!, {
      mobileGameId: 'm2',
      mobileFinal: true,
      homeScore: 4,
      awayScore: 3,
      mobileEvents: [
        { id: 'f1', teamId: 'a', playerId: 'p', type: 'fg3_make' },
        { id: 'f2', teamId: 'b', playerId: 'q', type: 'fg2_make' },
        { id: 'f3', teamId: 'b', playerId: 'q', type: 'fg2_make' },
      ],
    });
    const book = buildReport(twice, definition('box-score'), '2026-10-02T01:00:00.000Z');
    const totals = book.tables[0]!;
    expect(totals.title).toBe('Player totals · 2 games');
    expect(totals.rows).toEqual([
      expect.objectContaining({ player: 'Ari', team: 'Aces', games: 2, points: 8, fg2: 1, fg3: 2, ft: 0 }),
      expect.objectContaining({ player: 'Quinn', team: 'Blues', games: 2, points: 6, fg2: 3, fg3: 0, ft: 0 }),
    ]);
    // Score-only books have no player totals to add up.
    expect(report('box-score', { gameIds: ['g2'] }).tables.map((t) => t.title)).toEqual([
      'Fri 02/10/2026 · 10:00 am · Senior: Blues 4 - 0 Aces',
    ]);
  });

  it('uses scored Connect games, explains exclusions, and selects nonconsecutive dates', () => {
    const r = report('results', { dateMode: 'dates', dates: ['2026-10-01', '2026-10-03'] });
    expect(r.gameIds).toEqual(['g1']);
    // Games on other days are not part of the selection, so only a chosen game with a problem is left out.
    expect(r.selectedCount).toBe(2);
    expect(r.exclusions).toEqual([
      { gameId: 'g3', label: 'Sat 03/10/2026 · Aces vs Blues', reason: 'Game has no recorded score' },
    ]);
    expect(report('results', { relative: 'latest' }).exclusions.map((e) => e.gameId)).toEqual(['g3']);
    // Downloads keep the sortable date; the preview and PDF show it as DD/MM/YYYY.
    expect(r.tables[0]!.rows[0]).toMatchObject({ date: '2026-10-01', homeScore: 6, awayScore: 2 });
    expect(r.notes).toContain(
      'Standings include all scored group games through 01/10/2026 using wins, point difference and points for.',
    );
  });

  it('builds all six templates without replacing Connect scores with recorded player points', () => {
    const templates: ReportDefinition['template'][] = [
      'box-score',
      'league',
      'team',
      'results',
      'leaders',
      'player-log',
    ];
    for (const template of templates) {
      const r = report(template, {
        teamId: template === 'team' ? 'a' : undefined,
        playerId: template === 'player-log' ? 'p' : undefined,
      });
      expect(r.template).toBe(template);
      expect(r.tables.length).toBeGreaterThan(0);
      expect(r.gameIds).toEqual(['g1', 'g2']);
    }
    const league = report('league');
    expect(league.tables[0]!.rows.find((r) => r.teamId === 'a')).toMatchObject({ pointsFor: 6, pointsAgainst: 6 });
    expect(league.tables[0]!.rows.find((r) => r.teamId === 'a')).toMatchObject({
      pointsForPerGame: 3,
      pointsAgainstPerGame: 3,
    });
    expect(league.tables[1]!.rows.find((r) => r.playerId === 'p')).toMatchObject({
      points: 5,
      fg2: 1,
      fg3: 1,
      ppg: null,
    });
    expect(league.notes).toContain('Some games have no approved final mobile source; player tables are incomplete.');
  });

  it('counts a confirmed scoreless appearance but does not infer an average from an unknown game', () => {
    const one = report('league', { gameIds: ['g1'] });
    expect(one.tables[1]!.rows.find((r) => r.playerId === 'p')).toMatchObject({ appearances: 1, ppg: 5 });
    const leaders = report('leaders', { gameIds: ['g1'] });
    expect(leaders.tables.find((table) => table.title.startsWith('Points per game leaders'))!.rows[0]).toMatchObject({
      playerId: 'p',
      ppg: 5,
    });
    const log = report('player-log', { gameIds: ['g1'], playerId: 'p' });
    expect(log.tables[0]!.rows[0]).toMatchObject({ result: 'Win', points: 5 });
    expect(log.tables[1]!.rows[0]).toMatchObject({ playerId: 'p', points: 5, ppg: 5 });
    const altered: ReportSource = structuredClone(source);
    altered.games[0]!.manifests[0]!.playerIds.push('q');
    altered.games[0]!.manifests[0]!.appearances = 'confirmed';
    const single = buildReport(altered, definition('league', { gameIds: ['g1'] }), '2026-10-02T01:00:00.000Z');
    expect(single.tables[1]!.rows.find((r) => r.playerId === 'q' && r.teamId === 'a')).toMatchObject({
      points: 0,
      appearances: 1,
      ppg: 0,
    });
  });

  it('uses only explicitly complete games for shooting percentages and turnover totals', () => {
    // Shooting and turnovers are part of "Show all player stats"; without it they are left out.
    expect(report('leaders').tables.some((table) => table.title.startsWith('2PT shooting'))).toBe(false);
    const one = report('leaders', { allStats: true });
    const shot = one.tables.find((table) => table.title.startsWith('2PT shooting'))!;
    expect(shot.rows.find((row) => row.playerId === 'p')).toMatchObject({
      makes: 1,
      attempts: 1,
      percentage: 100,
      eligibleGames: 1,
    });
    expect(one.tables.some((table) => table.title.startsWith('Turnovers'))).toBe(false);
    expect(
      report('leaders', { minAttempts: 2, allStats: true }).tables.some((table) =>
        table.title.startsWith('2PT shooting'),
      ),
    ).toBe(false);

    const mixed: ReportSource = structuredClone(source);
    mixed.games[0]!.mobileEvents.push({ id: 'miss', teamId: 'a', playerId: 'p', type: 'fg2_miss' });
    mixed.games[0]!.mobileEvents.push({ id: 'tov', teamId: 'a', playerId: 'p', type: 'tov' });
    mixed.games[0]!.manifests[0]!.eventCount = 5;
    mixed.games[0]!.manifests[0]!.turnovers = 'complete';
    const measured = buildReport(mixed, definition('leaders', { allStats: true }), '2026-10-02T01:00:00.000Z');
    expect(
      buildReport(mixed, definition('leaders'), '2026-10-02T01:00:00.000Z').tables.some((t) =>
        t.title.startsWith('Turnovers'),
      ),
    ).toBe(false);
    expect(
      measured.tables.find((table) => table.title.startsWith('2PT shooting'))!.rows.find((row) => row.playerId === 'p'),
    ).toMatchObject({
      makes: 1,
      attempts: 2,
      percentage: 50,
      eligibleGames: 1,
    });
    expect(measured.tables.find((table) => table.title.startsWith('Turnovers'))!.rows[0]).toMatchObject({
      playerId: 'p',
      turnovers: 1,
      eligibleGames: 1,
    });

    mixed.games[0]!.manifests[0]!.shots.fg2 = 'partial';
    const partial = buildReport(mixed, definition('leaders', { allStats: true }), '2026-10-02T01:00:00.000Z');
    expect(
      partial.tables.find((table) => table.title.startsWith('2PT shooting'))!.rows.some((row) => row.playerId === 'p'),
    ).toBe(false);
  });

  it('reports other tracked categories only for sides with explicit complete evidence', () => {
    const tracked: ReportSource = structuredClone(source);
    tracked.games[0]!.mobileEvents.push(
      { id: 'reb1', teamId: 'a', playerId: 'p', type: 'reb' },
      { id: 'reb2', teamId: 'a', playerId: 'p', type: 'oreb' },
      { id: 'ast1', teamId: 'a', playerId: 'p', type: 'ast' },
    );
    tracked.games[0]!.manifests[0]!.eventCount = 6;
    tracked.games[0]!.manifests[0]!.other = { rebounds: 'complete', assists: 'complete' };
    const one = (template: ReportDefinition['template'], options: Partial<ReportDefinition> = {}) =>
      buildReport(
        tracked,
        definition(template, { gameIds: ['g1'], allStats: true, ...options }),
        '2026-10-02T01:00:00.000Z',
      );
    // Not ticked: the same game shows points and made shots only.
    const plain = one('box-score', { allStats: false });
    expect(plain.tables[0]!.columns.map((c) => c.key)).not.toContain('rebounds');
    expect(plain.notes.some((note) => note.startsWith('All player stats'))).toBe(false);
    expect(one('league', { allStats: false }).tables.some((t) => t.title.startsWith('Rebounds'))).toBe(false);
    const box = one('box-score');
    expect(box.notes.some((note) => note.startsWith('All player stats'))).toBe(true);
    expect(box.tables[0]!.rows.find((row) => row.playerId === 'p')).toMatchObject({ rebounds: 2, assists: 1 });
    expect(box.tables[0]!.rows.find((row) => row.playerId === 'q')).toMatchObject({ rebounds: null, assists: null });
    const league = one('league');
    expect(league.tables.find((table) => table.title.startsWith('Rebounds'))!.rows[0]).toMatchObject({
      playerId: 'p',
      total: 2,
      appearances: 1,
      perGame: 2,
    });
    expect(one('leaders').tables.some((table) => table.title.startsWith('Rebounds leaders'))).toBe(true);
    expect(one('player-log', { playerId: 'p' }).tables[0]!.rows[0]).toMatchObject({ rebounds: 2, assists: 1 });
  });

  it('keeps cumulative standings separate from a selected day and preserves score-only results', () => {
    const cumulative = report('results', { dateMode: 'day', dates: ['2026-10-02'] });
    const selected = report('results', { dateMode: 'day', dates: ['2026-10-02'], standingsScope: 'selected-games' });
    expect(cumulative.tables[0]!.rows).toHaveLength(1);
    expect(cumulative.tables[1]!.rows.find((r) => r.teamId === 'a')).toMatchObject({ gp: 2, wins: 1, losses: 1 });
    expect(selected.tables[1]!.rows.find((r) => r.teamId === 'a')).toMatchObject({ gp: 1, wins: 0, losses: 1 });
  });

  it('rejects foreign IDs, bad dates and oversized selections', () => {
    expect(() => report('team')).toThrow('Choose a team');
    expect(() => report('league', { eventId: 'foreign' })).toThrow('Event unavailable');
    expect(() => report('league', { dateMode: 'day', dates: ['2026-02-30'] })).toThrow(ReportInputError);
    const duplicateMobile: ReportSource = structuredClone(source);
    duplicateMobile.games[0]!.mobileEvents.push(duplicateMobile.games[0]!.mobileEvents[0]!);
    expect(() => buildReport(duplicateMobile, definition('league'), '2026-10-02T01:00:00.000Z')).toThrow(
      'Invalid mobile report evidence',
    );
    const large: ReportSource = {
      ...source,
      games: Array.from({ length: 101 }, (_, i) => ({
        ...source.games[0]!,
        id: `extra-${i}`,
        mobileEvents: [],
        manifests: [],
        mobileGameId: null,
      })),
    };
    expect(() => buildReport(large, definition('results'), '2026-10-02T01:00:00.000Z')).toThrow(
      'Select at most 100 games',
    );
  });

  it('saves a one-day report from an event with more than 100 games', () => {
    // 150 games over 30 days, five a day, and 20 still unscored: a fixed report of one day must still validate.
    // Saved reports hold Connect IDs, which are UUIDs.
    const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const season: ReportSource = {
      event: { ...source.event, id: uuid(1) },
      divisions: [{ id: uuid(2), name: 'Senior' }],
      teams: [
        { id: uuid(3), divisionId: uuid(2), name: 'Aces' },
        { id: uuid(4), divisionId: uuid(2), name: 'Blues' },
      ],
      players: [],
      readAt: source.readAt,
      games: Array.from({ length: 150 }, (_, i) => ({
        ...source.games[0]!,
        id: uuid(1000 + i),
        divisionId: uuid(2),
        homeTeamId: uuid(3),
        awayTeamId: uuid(4),
        date: `2026-09-${String(Math.floor(i / 5) + 1).padStart(2, '0')}`,
        homeScore: i < 130 ? 50 : null,
        awayScore: i < 130 ? 40 : null,
        mobileEvents: [],
        manifests: [],
        mobileGameId: null,
        mobileFinal: false,
      })),
    };
    const build = (options: Partial<ReportDefinition>) =>
      buildReport(
        season,
        { eventId: uuid(1), template: 'box-score', dateMode: 'all', dates: [], ...options },
        '2026-10-02T01:00:00.000Z',
      );
    for (const options of [{ dateMode: 'day' as const, dates: ['2026-09-03'] }, { relative: 'last-five' as const }]) {
      const doc = build(options);
      expect(doc.includedCount).toBe(5);
      expect(reportDocumentSchema.safeParse(doc).error?.issues).toBeUndefined();
    }
    // The last five scored games come before the 20 unscored ones, which are listed as left out.
    expect(build({ relative: 'last-five' }).exclusions).toHaveLength(20);
    // All dates: 130 scored games is over the 100-game limit, so it is refused before saving.
    expect(() => build({ template: 'results' })).toThrow('Select at most 100 games');
  });
});
