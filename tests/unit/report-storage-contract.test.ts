import { describe, expect, it } from 'vitest';

import { buildReport } from '@/features/reports/build';
import type { ReportDefinition, ReportSource } from '@/features/reports/model';
import { presetUrl } from '@/features/reports/presets';
import { reportDefinitionSchema, reportDocumentSchema } from '@/features/reports/schema';

const eventId = '10000000-0000-4000-8000-000000000191';
const divisionId = '20000000-0000-4000-8000-000000000191';
const gameId = '30000000-0000-4000-8000-000000000191';
const homeId = '40000000-0000-4000-8000-000000000191';
const awayId = '40000000-0000-4000-8000-000000000192';
const playerId = 'mobile-player-191';

const source: ReportSource = {
  event: { id: eventId, name: 'October League', timezone: 'Pacific/Auckland' },
  divisions: [{ id: divisionId, name: 'Open' }],
  teams: [
    { id: homeId, divisionId, name: 'Aces' },
    { id: awayId, divisionId, name: 'Blues' },
  ],
  players: [],
  readAt: '2026-10-02T00:00:00.000Z',
  games: [
    {
      id: gameId,
      divisionId,
      date: '2026-10-02',
      startTime: '19:00',
      type: 'group',
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeScore: 60,
      awayScore: 55,
      mobileGameId: null,
      mobileFinal: false,
      mobileEvents: [],
      manifests: [],
    },
  ],
};

describe('report storage contract', () => {
  it('accepts real score-only report output for a league day and selected game', () => {
    for (const definition of [
      { eventId, template: 'results', dateMode: 'day', dates: ['2026-10-02'], divisionId },
      { eventId, template: 'box-score', dateMode: 'all', dates: [], divisionId, gameIds: [gameId] },
    ] as ReportDefinition[]) {
      expect(reportDefinitionSchema.safeParse(definition).success).toBe(true);
      const document = buildReport(source, definition, '2026-10-02T01:00:00.000Z');
      expect(reportDocumentSchema.safeParse(document).success).toBe(true);
    }
  });

  it('stores the actual builder shape for all six templates', () => {
    const withMobile: ReportSource = {
      ...source,
      players: [{ id: playerId, name: 'Ari' }],
      games: [
        {
          ...source.games[0]!,
          mobileGameId: `cg_${gameId}`,
          mobileFinal: true,
          mobileEvents: [{ id: 'event-1', teamId: homeId, playerId, type: 'fg2_make' }],
        },
      ],
    };
    for (const template of ['box-score', 'league', 'team', 'results', 'leaders', 'player-log'] as const) {
      const definition: ReportDefinition = {
        eventId,
        template,
        dateMode: 'all',
        dates: [],
        teamId: template === 'team' ? homeId : undefined,
        playerId: template === 'player-log' ? playerId : undefined,
      };
      expect(reportDefinitionSchema.safeParse(definition).success, template).toBe(true);
      const report = buildReport(withMobile, definition, '2026-10-02T01:00:00.000Z');
      expect(reportDocumentSchema.safeParse(report).success, template).toBe(true);
    }
  });

  it('round-trips saved filters without copying a source report', () => {
    const definition: ReportDefinition = {
      eventId,
      template: 'box-score',
      divisionId,
      gameIds: [gameId],
      dateMode: 'day',
      dates: ['2026-10-02'],
      minAttempts: 5,
    };
    const url = new URL(presetUrl(definition), 'https://connect.itala.fyi');
    expect(url.pathname).toBe('/admin/reports');
    expect(url.searchParams.get('event')).toBe(eventId);
    expect(url.searchParams.get('game')).toBe(gameId);
    expect(url.searchParams.get('dates')).toBe('2026-10-02');
    expect(url.searchParams.get('minAttempts')).toBe('5');
    expect(url.searchParams.get('preview')).toBe('1');
  });

  it('rejects malformed selections before writing a report-owned row', () => {
    expect(
      reportDefinitionSchema.safeParse({ eventId: 'foreign', template: 'results', dateMode: 'all', dates: [] }).success,
    ).toBe(false);
    expect(
      reportDefinitionSchema.safeParse({ eventId, template: 'results', dateMode: 'all', dates: [], minAttempts: -1 })
        .success,
    ).toBe(false);
  });
});
