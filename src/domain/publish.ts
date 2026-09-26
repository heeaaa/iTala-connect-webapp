/**
 * Publish checks (PRD E-60), ported from iTala-platform/src/app.js 1091-1117
 * with the same messages. Fix: the old code only needed one division with
 * 2 teams; every division now needs 2, and the short ones are named.
 */

export interface PublishDivision {
  name: string;
  teamCount: number;
  customGamesPerTeam: boolean;
  gamesPerTeam: number;
}

export function publishProblem(event: {
  days: readonly string[];
  divisions: readonly PublishDivision[];
}): string | null {
  if (event.days.length === 0) return 'Please select at least one event date on the calendar.';
  if (event.divisions.length === 0) return 'Please add at least one division.';
  const short = event.divisions.filter((d) => d.teamCount < 2).map((d) => d.name.trim() || 'Untitled division');
  if (short.length) return `Each division needs at least 2 teams. Add teams to: ${short.join(', ')}.`;
  if (event.divisions.some((d) => d.customGamesPerTeam && !(d.gamesPerTeam >= 1)))
    return 'Custom games per team is enabled but set to 0. Please enter a value or uncheck it.';
  return null;
}

export const NO_GAMES_MESSAGE =
  'Could not generate any games. Check that you have enough time slots for all matchups (days × hours × courts).';

/** E-62 confirmation copy. `count` null means the scores could not be read. */
export function republishWarning(count: number | null): string {
  if (count === null)
    return 'Could not check whether this event has recorded scores. Re-publishing rebuilds the schedule and clears any that exist. Continue?';
  return `Re-publishing rebuilds the whole schedule from scratch. ${count} recorded score${count === 1 ? '' : 's'} will be cleared. Continue?`;
}
