import { toMinutes } from './game-day';
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
