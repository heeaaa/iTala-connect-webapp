import { toMinutes } from './game-day';
import { MIN_GAP } from './scheduler';
import { isGroupGame } from './standings';
import { type EventSetup, type Game } from './types';

/**
 * Editor rules ported from iTala-platform/src/app.js 206-237 and 360-374.
 */

/**
 * E-14: games that no longer fit the event's days, hours or courts move to
 * Unscheduled. Returns new games and how many moved (the old code
 * returned the count but never showed it; the editor now does).
 */
export function reconcileSchedule<G extends Game>(
  setup: Pick<EventSetup, 'days' | 'timeStart' | 'timeEnd' | 'courts'>,
  games: readonly G[],
): { games: G[]; moved: number } {
  const days = new Set(setup.days);
  const start = toMinutes(setup.timeStart);
  const end = toMinutes(setup.timeEnd);
  const courts = setup.courts || 1;
  let moved = 0;
  const out = games.map((g) => {
    if (!g.day || !g.time) return g;
    const m = toMinutes(g.time);
    const fits = days.has(g.day) && m >= start && m < end && (g.court ?? 1) <= courts;
    if (fits) return g;
    moved++;
    return { ...g, day: null, time: null, court: null };
  });
  return { games: out, moved };
}

/**
 * E-30: how many group games each pair of teams plays in a division
 * (unscheduled included, playoffs and TBD excluded). Keys are the two
 * team ids sorted and joined with "|".
 */
export function matchupCounts(games: readonly Game[], divisionId: string, teamIds: readonly string[]) {
  const inDivision = new Set(teamIds);
  const counts = new Map<string, number>();
  let totalGames = 0;
  for (const g of games) {
    if (!isGroupGame(g, divisionId)) continue;
    if (!inDivision.has(g.team1Id!) || !inDivision.has(g.team2Id!)) continue;
    if (g.team1Id === g.team2Id) continue;
    const key = [g.team1Id!, g.team2Id!].sort().join('|');
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totalGames++;
  }
  return { counts, totalGames };
}

export interface RestBreak {
  teamId: string;
  day: string;
  /** The two start times, earlier first ("HH:MM"). */
  times: [string, string];
}

type IdGame = Pick<Game, 'day' | 'time' | 'team1Id' | 'team2Id'> & { id: string };

/** Same-day pairs of games closer than MIN_GAP that share a team, keyed "team|idA|idB". */
function closePairs(games: readonly IdGame[], moved: ReadonlySet<string>) {
  const pairs = new Map<string, RestBreak>();
  const scheduled = games.filter((g) => g.day && g.time);
  for (const a of scheduled) {
    if (!moved.has(a.id)) continue;
    for (const b of scheduled) {
      if (b.id === a.id || b.day !== a.day) continue;
      const gap = toMinutes(b.time!) - toMinutes(a.time!);
      if (Math.abs(gap) >= MIN_GAP) continue;
      const [first, second] = gap < 0 ? [b, a] : [a, b];
      for (const team of new Set([a.team1Id, a.team2Id])) {
        if (team === null || (team !== b.team1Id && team !== b.team2Id)) continue;
        const key = [team, ...[a.id, b.id].sort()].join('|');
        pairs.set(key, { teamId: team, day: a.day!, times: [first.time!, second.time!] });
      }
    }
  }
  return pairs;
}

/**
 * E-45: a manual move never refuses a short rest gap (the old editor had no
 * check), but the editor warns about the ones it creates. Returns each team
 * whose moved game now sits under MIN_GAP from another of its games that
 * day, leaving out pairs that were already that close before the move.
 * TBD sides (null) have no rest to break.
 */
export function restBreaks(before: readonly IdGame[], after: readonly IdGame[], movedIds: readonly string[]) {
  const moved = new Set(movedIds);
  const old = closePairs(before, moved);
  return [...closePairs(after, moved)]
    .filter(([key]) => !old.has(key))
    .map(([, found]) => found)
    .sort(
      (x, y) =>
        x.day.localeCompare(y.day) || toMinutes(x.times[0]) - toMinutes(y.times[0]) || x.teamId.localeCompare(y.teamId),
    );
}
