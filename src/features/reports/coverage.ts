import type { MobileReportRead } from './mobile-reader';
import type { Coverage, ReportEvent, SideManifest } from './model';

type MobileGame = MobileReportRead['games'][number];
type MobileTeam = MobileReportRead['teams'][number];

/**
 * What a finished mobile game tracked, for each Connect side, from what the game itself stored
 * (decided 07/10/2026, "safe set"):
 * - Points and made shots are always recorded, so scoring is complete.
 * - Rebounds, assists, steals, blocks and fouls are always on the mobile tracker's pad
 *   (LiveGameScreen), so they are complete too, unless the side was scored as a team only.
 * - Misses and turnovers are optional. They count only when the game stored its own setting
 *   (drop-in games do); a game that followed its league is unknown, because the league's
 *   setting may have changed since it was played.
 * - Appearances are confirmed from the game's attendance (the team's roster members present),
 *   plus anyone with an event for that side; without attendance they are unknown.
 * Returns no manifests when the reply does not describe both teams (an older reader), so
 * coverage stays unknown, as before.
 */
export function sideManifests(
  game: MobileGame,
  teams: readonly MobileTeam[],
  sides: readonly { teamId: string; mobileTeamId: string }[],
  events: readonly ReportEvent[],
): SideManifest[] {
  const byId = new Map(teams.map((team) => [team.id, team]));
  if (!sides.every((side) => byId.has(side.mobileTeamId))) return [];
  const setting = (value: boolean | null | undefined): Coverage =>
    value === true ? 'complete' : value === false ? 'not-tracked' : 'unknown';
  const misses = setting(game.track_misses);
  const turnovers = setting(game.track_turnovers);
  return sides.map(({ teamId, mobileTeamId }) => {
    const team = byId.get(mobileTeamId)!;
    const own = events.filter((event) => event.teamId === teamId);
    const scorers = own.flatMap((event) => (event.playerId ? [event.playerId] : []));
    if (team.team_only)
      return {
        teamId,
        scoring: 'complete',
        shots: { fg2: 'unknown', fg3: 'unknown', ft: 'unknown' },
        turnovers: 'unknown',
        appearances: 'unknown',
        playerIds: [],
        eventCount: own.length,
      };
    const roster = new Set(team.player_ids);
    const present = game.attendance ? game.attendance.filter((playerId) => roster.has(playerId)) : null;
    return {
      teamId,
      scoring: 'complete',
      shots: { fg2: misses, fg3: misses, ft: misses },
      turnovers,
      other: { rebounds: 'complete', assists: 'complete', steals: 'complete', blocks: 'complete', fouls: 'complete' },
      appearances: present ? 'confirmed' : 'unknown',
      playerIds: [...new Set([...(present ?? []), ...scorers])],
      eventCount: own.length,
    };
  });
}

/**
 * The report without the optional categories, for when "Show all player stats" is not ticked:
 * points, made shots and appearances stay; shooting, turnovers and the other categories go.
 */
export function withoutOptionalStats(manifests: readonly SideManifest[]): SideManifest[] {
  return manifests.map((manifest) => {
    const kept: SideManifest = {
      ...manifest,
      shots: { fg2: 'unknown', fg3: 'unknown', ft: 'unknown' },
      turnovers: 'unknown',
    };
    delete kept.other;
    return kept;
  });
}
