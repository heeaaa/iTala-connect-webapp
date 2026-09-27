import { z } from 'zod';

const mobileId = z.string().min(1).max(200);
const name = z.string().trim().min(1).max(120);
export const mobileLeagueSchema = z.object({
  id: mobileId,
  name: z.string().trim().min(1).max(200),
  season: z
    .string()
    .nullish()
    .transform((v) => v ?? ''),
  kind: z.enum(['league', 'recreational']).default('league'),
  is_closed: z.boolean().nullish().transform(Boolean),
  is_archived: z.boolean().nullish().transform(Boolean),
});
export const mobileTeamSchema = z.object({
  id: mobileId,
  league_id: mobileId,
  name,
  coach: z
    .string()
    .max(120)
    .nullish()
    .transform((v) => v ?? ''),
  team_only: z.boolean().nullish().transform(Boolean),
  player_ids: z
    .array(mobileId)
    .nullish()
    .transform((v) => v ?? []),
});
export const mobilePlayerSchema = z.object({
  id: mobileId,
  league_id: mobileId,
  name,
  number: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => String(v ?? ''))
    .pipe(z.string().max(10)),
});
export type MobileLeague = z.infer<typeof mobileLeagueSchema>;
export type MobileTeam = z.infer<typeof mobileTeamSchema>;
export type MobilePlayer = z.infer<typeof mobilePlayerSchema>;
export interface LeaguePreview {
  league: MobileLeague;
  teams: (Omit<MobileTeam, 'player_ids'> & { players: MobilePlayer[] })[];
}

export function buildLeaguePreview(league: MobileLeague, teams: MobileTeam[], players: MobilePlayer[]): LeaguePreview {
  const byId = new Map(players.filter((p) => p.league_id === league.id).map((p) => [p.id, p]));
  const teamIds = new Set<string>();
  return {
    league,
    teams: teams
      .filter((t) => t.league_id === league.id)
      .map(({ player_ids, ...team }) => {
        if (teamIds.has(team.id)) throw new Error('Duplicate mobile team');
        teamIds.add(team.id);
        const seen = new Set<string>();
        const roster = team.team_only
          ? []
          : player_ids.map((id) => {
              const player = byId.get(id);
              if (!player || seen.has(id))
                throw new Error('The mobile roster is incomplete or contains duplicate players');
              seen.add(id);
              return player;
            });
        return { ...team, players: roster };
      }),
  };
}

export const importChoiceSchema = z.object({
  leagueId: mobileId,
  eventName: z.string().trim().min(1, 'Enter an event name.').max(200),
  divisionName: name,
  allowDuplicate: z.boolean(),
});
export type ImportChoice = z.infer<typeof importChoiceSchema>;
