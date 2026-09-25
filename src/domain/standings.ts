import { type Game } from './types';

/**
 * PRD 12.4, ported from renderPublicStandings and the seeding table in
 * resolveAllPlayoffs (iTala-platform/src/app.js 1736-1760, 1940-1958).
 */

export interface StandingRow {
  teamId: string;
  w: number;
  l: number;
  pf: number;
  pa: number;
  diff: number;
  gp: number;
}

type ScoredGame = Pick<Game, 'divisionId' | 'type' | 'playoff' | 'team1Id' | 'team2Id' | 'score1' | 'score2'>;

/** A round-robin fixture of this division with both teams known (app.js isGroupGame). */
export function isGroupGame(g: ScoredGame, divisionId: string): boolean {
  if (g.divisionId !== divisionId) return false;
  if (g.playoff || g.type !== 'group') return false;
  return g.team1Id !== null && g.team2Id !== null;
}

/** Both scores present; 0 is a score. */
export function hasScore(g: Pick<Game, 'score1' | 'score2'>): boolean {
  return g.score1 !== null && g.score2 !== null;
}

/**
 * Counted: group games of the division with both scores and both teams in
 * the division. A win or loss only when scores differ. Sorted by W, then
 * point difference, then PF, then insertion order.
 */
export function computeStandings(teamIds: readonly string[], games: readonly ScoredGame[], divisionId: string) {
  const records = new Map<string, StandingRow>(
    teamIds.map((id) => [id, { teamId: id, w: 0, l: 0, pf: 0, pa: 0, diff: 0, gp: 0 }]),
  );
  for (const g of games) {
    if (!isGroupGame(g, divisionId) || !hasScore(g)) continue;
    const r1 = records.get(g.team1Id!);
    const r2 = records.get(g.team2Id!);
    if (!r1 || !r2) continue;
    const s1 = g.score1!;
    const s2 = g.score2!;
    r1.pf += s1;
    r1.pa += s2;
    r1.gp++;
    r2.pf += s2;
    r2.pa += s1;
    r2.gp++;
    if (s1 > s2) {
      r1.w++;
      r2.l++;
    } else if (s2 > s1) {
      r2.w++;
      r1.l++;
    }
    r1.diff = r1.pf - r1.pa;
    r2.diff = r2.pf - r2.pa;
  }
  return [...records.values()].sort((a, b) => b.w - a.w || b.diff - a.diff || b.pf - a.pf);
}

/** 12.5: seeds resolve only once the division has group games and every one is scored. */
export function divisionGroupComplete(games: readonly ScoredGame[], divisionId: string): boolean {
  const group = games.filter((g) => isGroupGame(g, divisionId));
  return group.length > 0 && group.every(hasScore);
}
