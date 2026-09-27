import { maxRoundsFor } from '@/domain/scheduler';

/**
 * Text and checks for the "+ Round robin" and "+ Playoff" dialogs (PRD E-63,
 * E-64), shared by the dialogs and their Server Actions so both say the same
 * thing. Messages are the old editor's, with "-" for its long dashes and
 * plurals written out.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The stored limit on custom games per team (divisions.games_per_team, E-21). */
export const MAX_GAMES_PER_TEAM = 20;

/** The largest custom number the dialog offers: a full round robin's games per team, at most 20. */
export const maxCustomGames = (teams: number) => Math.min(maxRoundsFor(teams), MAX_GAMES_PER_TEAM);

export const ENTER_GAMES =
  'Enter how many games each team should play, or untick Custom games/team for a full round robin.';

/** "{n} teams. A full round robin is {games} games ({max} per team). ..." */
export function roundRobinSummary(teams: number): string {
  const full = (teams * (teams - 1)) / 2;
  return `${teams} teams. A full round robin is ${plural(full, 'game')} (${maxRoundsFor(teams)} per team). Matchups already on the schedule are skipped, and new games take whatever slots are still free.`;
}

/** The dialog's starting "Games per team": the division's saved number, else min(3, max). */
export function defaultGamesPerTeam(teams: number, saved: { custom: boolean; gamesPerTeam: number }): number {
  return saved.custom && saved.gamesPerTeam > 0 ? saved.gamesPerTeam : Math.min(3, maxRoundsFor(teams));
}

/** Why a round robin cannot be added, in the old editor's order, or null. */
export function roundRobinProblem(input: {
  teams: number;
  days: number;
  custom: boolean;
  gamesPerTeam: number;
}): string | null {
  const { teams, days, custom, gamesPerTeam } = input;
  if (teams < 2) return 'This division needs at least 2 teams.';
  if (days < 1) return 'Select at least one event date first.';
  if (!custom) return null;
  if (!Number.isInteger(gamesPerTeam) || gamesPerTeam < 1) return ENTER_GAMES;
  const max = maxRoundsFor(teams);
  if (gamesPerTeam > max)
    return `With ${teams} teams each team can play at most ${plural(max, 'game')} without a repeat matchup.`;
  if (gamesPerTeam > MAX_GAMES_PER_TEAM)
    return `Custom games per team can be at most ${MAX_GAMES_PER_TEAM}. Leave the box unticked for a full round robin.`;
  return null;
}

/** The dialog's starting "How many teams advance?": min(N, 4). */
export const defaultPlayoffTeams = (teams: number) => Math.min(teams, 4);

/** Why a playoff cannot be added, or null. */
export function playoffProblem(teams: number, advancing: number): string | null {
  if (teams < 2) return 'Need at least 2 teams.';
  if (!Number.isInteger(advancing) || advancing < 2 || advancing > teams) return `Choose between 2 and ${teams} teams.`;
  return null;
}

/**
 * The result: "{n} games added." or "{n} playoff games added!", then any new
 * games sent to Unscheduled, then any existing games the event's days, hours
 * or courts no longer fit (moved to Unscheduled first, as the old editor did,
 * and now said, as E-14 says it on Save).
 */
export function additionMessage(
  kind: 'round-robin' | 'playoff',
  { added, unscheduled, moved }: { added: number; unscheduled: number; moved: number },
): string {
  const lines = [
    kind === 'round-robin' && added === 0
      ? 'No new games to add. Every matchup for this division is already on the schedule.'
      : kind === 'playoff'
        ? `${plural(added, 'playoff game')} added!`
        : `${plural(added, 'game')} added.`,
  ];
  if (unscheduled)
    lines.push(`${unscheduled} could not fit and ${unscheduled === 1 ? 'is' : 'are'} in the Unscheduled row.`);
  if (moved)
    lines.push(
      `${plural(moved, 'game')} moved to Unscheduled because ${moved === 1 ? 'it no longer fits' : 'they no longer fit'} the event's days, hours or courts.`,
    );
  return lines.join(' ');
}
