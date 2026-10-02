import { describe, expect, it } from 'vitest';

import { buildReport, ReportInputError } from '@/features/reports/build';
import type { ReportDefinition, ReportSource } from '@/features/reports/model';

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
    expect(whole.tables).toHaveLength(2);
    expect(whole.tables[0]!.columns.map((column) => column.key)).toEqual(
      expect.arrayContaining(['gameId', 'teamId', 'playerId']),
    );
    expect(whole.tables[0]!.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gameId: 'g1', teamId: 'a', entry: 'Recorded team', points: 1 }),
        expect.objectContaining({ gameId: 'g1', teamId: 'a', entry: 'Recorded player', playerId: 'p', points: 5 }),
      ]),
    );
    expect(day.gameIds).toEqual(['g1']);
    expect(selected.gameIds).toEqual(['g2']);
    expect(selected.tables[0]!.rows).toEqual([
      expect.objectContaining({ team: 'Blues', entry: 'Connect score', points: 4 }),
      expect.objectContaining({ team: 'Aces', entry: 'Connect score', points: 0 }),
    ]);
    expect(() => report('box-score', { gameIds: ['foreign'] })).toThrow('Game unavailable');
  });

  it('uses scored Connect games, explains exclusions, and selects nonconsecutive dates', () => {
    const r = report('results', { dateMode: 'dates', dates: ['2026-10-01', '2026-10-03'] });
    expect(r.gameIds).toEqual(['g1']);
    expect(r.selectedCount).toBe(3);
    expect(r.exclusions).toEqual([
      { gameId: 'g2', reason: 'Outside selected dates' },
      { gameId: 'g3', reason: 'Game has no recorded score' },
    ]);
    expect(r.tables[0]!.rows[0]).toMatchObject({ homeScore: 6, awayScore: 2 });
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
    const one = report('leaders');
    const shot = one.tables.find((table) => table.title.startsWith('2PT shooting'))!;
    expect(shot.rows.find((row) => row.playerId === 'p')).toMatchObject({
      makes: 1,
      attempts: 1,
      percentage: 100,
      eligibleGames: 1,
    });
    expect(one.tables.some((table) => table.title.startsWith('Turnovers'))).toBe(false);
    expect(report('leaders', { minAttempts: 2 }).tables.some((table) => table.title.startsWith('2PT shooting'))).toBe(
      false,
    );

    const mixed: ReportSource = structuredClone(source);
    mixed.games[0]!.mobileEvents.push({ id: 'miss', teamId: 'a', playerId: 'p', type: 'fg2_miss' });
    mixed.games[0]!.mobileEvents.push({ id: 'tov', teamId: 'a', playerId: 'p', type: 'tov' });
    mixed.games[0]!.manifests[0]!.eventCount = 5;
    mixed.games[0]!.manifests[0]!.turnovers = 'complete';
    const measured = buildReport(mixed, definition('leaders'), '2026-10-02T01:00:00.000Z');
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
    const partial = buildReport(mixed, definition('leaders'), '2026-10-02T01:00:00.000Z');
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
      buildReport(tracked, definition(template, { gameIds: ['g1'], ...options }), '2026-10-02T01:00:00.000Z');
    const box = one('box-score');
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
});
