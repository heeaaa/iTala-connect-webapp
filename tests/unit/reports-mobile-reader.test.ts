import { describe, expect, it, vi } from 'vitest';

import { createReportsMobileReader } from '@/features/reports/mobile-reader';

const gameId = 'cg_30000000-0000-4000-8000-000000000191';
const response = {
  leagueId: 'league-1',
  games: [{ id: gameId, league_id: 'league-1', home_team_id: 'home', away_team_id: 'away', status: 'final' }],
  events: [
    { id: 'event-1', league_id: 'league-1', game_id: gameId, team_id: 'home', player_id: 'player-1', type: 'fg2_make' },
  ],
  players: [{ id: 'player-1', league_id: 'league-1', name: 'Ari' }],
  readAt: '2026-10-02T00:00:00.000Z',
};

describe('read-only Mobile report client', () => {
  it('uses one bounded GET without Auth signup or data writes', async () => {
    const fetcher = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      expect(init?.cache).toBe('no-store');
      expect(String(_url)).toContain(`/functions/v1/connect-reports?leagueId=league-1&gameIds=${gameId}`);
      return Response.json(response);
    });
    const read = createReportsMobileReader('https://mobile.example', 'secret', fetcher as typeof fetch);
    expect((await read('league-1', [gameId])).events[0]?.type).toBe('fg2_make');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refuses invalid selections and mismatched Mobile data', async () => {
    const fetcher = vi.fn(async () => Response.json({ ...response, leagueId: 'foreign' }));
    const read = createReportsMobileReader('https://mobile.example', 'secret', fetcher as typeof fetch);
    await expect(read('league-1', [gameId, gameId])).rejects.toThrow('Invalid mobile report selection');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(read('league-1', [gameId])).rejects.toThrow('Invalid mobile report source');
  });

  it('reads what each game tracked when the function sends it, and still reads an older reply', async () => {
    const newer = {
      ...response,
      games: [{ ...response.games[0], track_misses: true, track_turnovers: null, attendance: ['player-1'] }],
      teams: [{ id: 'home', league_id: 'league-1', team_only: false, player_ids: ['player-1'] }],
    };
    const read = (body: unknown) =>
      createReportsMobileReader('https://mobile.example', 'secret', (async () => Response.json(body)) as typeof fetch)(
        'league-1',
        [gameId],
      );
    const got = await read(newer);
    expect(got.games[0]).toMatchObject({ track_misses: true, track_turnovers: null, attendance: ['player-1'] });
    expect(got.teams).toEqual(newer.teams);
    expect((await read(response)).teams).toEqual([]);
    await expect(read({ ...newer, teams: [{ ...newer.teams[0], league_id: 'foreign' }] })).rejects.toThrow(
      'Invalid mobile report source',
    );
    await expect(read({ ...newer, games: [{ ...newer.games[0], attendance: ['bad id'] }] })).rejects.toThrow();
  });
});
