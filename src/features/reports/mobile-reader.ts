import { z } from 'zod';

const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);
const mobileGame = z.object({
  id,
  league_id: id,
  home_team_id: id,
  away_team_id: id,
  status: z.literal('final'),
  default_winner_team_id: id.nullable().optional(),
  // What the game itself stored (null: it followed its league). Older readers omit these.
  track_misses: z.boolean().nullable().optional(),
  track_turnovers: z.boolean().nullable().optional(),
  attendance: z.array(id).max(200).nullable().optional(),
});
const mobileTeam = z.object({
  id,
  league_id: id,
  team_only: z.boolean(),
  player_ids: z.array(id).max(200),
});
const mobileEvent = z.object({
  id,
  league_id: id,
  game_id: id,
  team_id: id,
  player_id: id.nullable(),
  type: z.string().min(1).max(80),
});
const mobilePlayer = z.object({ id, league_id: id, name: z.string().max(200) });
const responseSchema = z.object({
  leagueId: id,
  games: z.array(mobileGame).max(100),
  events: z.array(mobileEvent).max(20000),
  players: z.array(mobilePlayer).max(20000),
  teams: z.array(mobileTeam).max(200).default([]),
  readAt: z.iso.datetime(),
});

export type MobileReportRead = z.infer<typeof responseSchema>;

/** Dedicated GET-only bridge; it never touches Mobile Auth or the write API. */
export function createReportsMobileReader(baseUrl: string, secret: string, request: typeof fetch = fetch) {
  return async (leagueId: string, gameIds: string[]): Promise<MobileReportRead> => {
    if (
      !id.safeParse(leagueId).success ||
      gameIds.length < 1 ||
      gameIds.length > 100 ||
      gameIds.some((gameId) => !id.safeParse(gameId).success) ||
      new Set(gameIds).size !== gameIds.length
    )
      throw new Error('Invalid mobile report selection');
    const target = new URL('/functions/v1/connect-reports', baseUrl);
    target.searchParams.set('leagueId', leagueId);
    target.searchParams.set('gameIds', gameIds.join(','));
    const response = await request(target, {
      method: 'GET',
      headers: { 'x-connect-reports-secret': secret },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Mobile report source unavailable');
    const parsed = responseSchema.parse(await response.json());
    const returned = new Set(parsed.games.map((game) => game.id));
    if (
      parsed.leagueId !== leagueId ||
      parsed.games.some((game) => game.league_id !== leagueId || !gameIds.includes(game.id)) ||
      parsed.events.some((event) => event.league_id !== leagueId || !returned.has(event.game_id)) ||
      parsed.players.some((player) => player.league_id !== leagueId) ||
      parsed.teams.some((team) => team.league_id !== leagueId) ||
      returned.size !== parsed.games.length ||
      new Set(parsed.events.map((event) => event.id)).size !== parsed.events.length
    )
      throw new Error('Invalid mobile report source');
    return parsed;
  };
}
