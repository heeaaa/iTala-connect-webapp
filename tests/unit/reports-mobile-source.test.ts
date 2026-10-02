import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReportDefinition, ReportSource } from '@/features/reports/model';

const mocks = vi.hoisted(() => ({ serverEnv: vi.fn(), createClient: vi.fn() }));
vi.mock('@/env', () => ({ serverEnv: mocks.serverEnv }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));

const { enrichReportSourceWithMobile } = await import('@/features/reports/mobile-source');

const eventId = '10000000-0000-4000-8000-000000000191';
const divisionId = '20000000-0000-4000-8000-000000000191';
const gameId = '30000000-0000-4000-8000-000000000191';
const mobileGameId = `cg_${gameId}`;
const source: ReportSource = {
  event: { id: eventId, name: 'October League', timezone: 'Pacific/Auckland' },
  divisions: [{ id: divisionId, name: 'Open' }],
  teams: [
    { id: 'home-connect', divisionId, name: 'Aces' },
    { id: 'away-connect', divisionId, name: 'Blues' },
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
      homeTeamId: 'home-connect',
      awayTeamId: 'away-connect',
      homeScore: 60,
      awayScore: 55,
      mobileGameId,
      mobileFinal: false,
      mobileEvents: [],
      manifests: [],
    },
  ],
};
const definition: ReportDefinition = { eventId, template: 'box-score', dateMode: 'all', dates: [] };

describe('verified Mobile report enrichment', () => {
  let mobileHome = 'home-mobile';
  const rows: Record<string, object[]> = {
    division_mobile_links: [{ division_id: divisionId, league_id: 'league-1' }],
    division_mobile_team_links: [
      { division_id: divisionId, team_id: 'home-connect', mobile_team_id: 'home-mobile' },
      { division_id: divisionId, team_id: 'away-connect', mobile_team_id: 'away-mobile' },
    ],
    score_sources: [{ game_id: gameId, mobile_game_id: mobileGameId, league_id: 'league-1' }],
  };

  beforeEach(() => {
    mobileHome = 'home-mobile';
    mocks.serverEnv.mockReturnValue({
      MOBILE_SUPABASE_URL: 'https://mobile.example',
      MOBILE_REPORTS_READ_SECRET: 's'.repeat(32),
    });
    mocks.createClient.mockResolvedValue({
      from: (table: string) => ({
        select: () => ({ in: async () => ({ data: rows[table], error: null }) }),
      }),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          leagueId: 'league-1',
          games: [
            {
              id: mobileGameId,
              league_id: 'league-1',
              home_team_id: mobileHome,
              away_team_id: 'away-mobile',
              status: 'final',
              default_winner_team_id: null,
            },
          ],
          events: [
            {
              id: 'event-1',
              league_id: 'league-1',
              game_id: mobileGameId,
              team_id: 'home-mobile',
              player_id: 'player-1',
              type: 'fg2_make',
            },
          ],
          players: [{ id: 'player-1', league_id: 'league-1', name: 'Ari' }],
          readAt: '2026-10-02T00:00:01.000Z',
        }),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('maps only the approved league, game and side IDs to Connect', async () => {
    const enriched = await enrichReportSourceWithMobile(source, definition);
    expect(enriched.games[0]).toMatchObject({
      mobileFinal: true,
      mobileEvents: [{ id: 'event-1', teamId: 'home-connect', playerId: 'player-1', type: 'fg2_make' }],
      manifests: [],
    });
    expect(enriched.players).toEqual([{ id: 'player-1', name: 'Ari' }]);
  });

  it('rejects a Mobile game whose sides differ from the approved Connect mapping', async () => {
    mobileHome = 'foreign-team';
    const enriched = await enrichReportSourceWithMobile(source, definition);
    expect(enriched.games[0]?.mobileFinal).toBe(false);
    expect(enriched.players).toEqual([]);
  });

  it('keeps Connect scores available when the Mobile bridge is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const enriched = await enrichReportSourceWithMobile(source, definition);
    expect(enriched.games[0]?.homeScore).toBe(60);
    expect(enriched.games[0]?.mobileFinal).toBe(false);
    expect(enriched.warnings).toContain(
      'Mobile player statistics could not be verified. Connect scores remain available.',
    );
  });

  it('reads the latest scored game when a newer game has no score', async () => {
    const recent: ReportSource = {
      ...source,
      games: [
        ...source.games,
        { ...source.games[0]!, id: '30000000-0000-4000-8000-000000000192', date: '2026-10-03', homeScore: null },
      ],
    };
    const enriched = await enrichReportSourceWithMobile(recent, { ...definition, relative: 'latest' });
    expect(enriched.games[0]?.mobileFinal).toBe(true);
    expect(enriched.games[1]?.mobileFinal).toBe(false);
  });
});
