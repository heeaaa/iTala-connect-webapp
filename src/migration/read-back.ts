import type { DivisionRow, EventRow, EventRows, GameRow, ScoreRow, TeamRow } from '@/lib/public-event/model';

/**
 * An imported event as stored, turned back into its legacy keys, so the
 * computed-output diff can run on what is really in the database after a
 * write (MIGRATION_PLAN.md 12.1 step 7), not only on the plan.
 */

export interface StoredEvent {
  event: EventRow;
  /** The event's web address as stored (P-14). */
  slug?: string;
  divisions: (DivisionRow & { legacy_key: string | null })[];
  teams: (TeamRow & { legacy_code: string | null })[];
  games: (GameRow & { legacy_gid: string | null; legacy_index: number | null })[];
  scores: ScoreRow[];
}

export interface KeyedRows {
  rows: EventRows;
  /** Game (by legacy gid) to its position in the old schedule array. */
  oldIndex: Map<string, number>;
}

export function legacyKeyedRows(stored: StoredEvent, legacyId: string): KeyedRows {
  // Rows the import did not make (no legacy key) keep their ids, so they show up as differences.
  const division = new Map(stored.divisions.map((d) => [d.id, d.legacy_key ?? d.id]));
  const team = new Map(stored.teams.map((t) => [t.id, t.legacy_code ?? t.id]));
  const game = new Map(stored.games.map((g) => [g.id, g.legacy_gid ?? g.id]));
  const oldIndex = new Map<string, number>();
  for (const g of stored.games)
    if (g.legacy_gid !== null && g.legacy_index !== null) oldIndex.set(g.legacy_gid, g.legacy_index);
  const teamOf = (id: string | null) => (id === null ? null : (team.get(id) ?? id));
  return {
    rows: {
      event: { ...stored.event, id: legacyId },
      divisions: stored.divisions.map(({ legacy_key: _k, ...d }) => ({ ...d, id: division.get(d.id)! })),
      teams: stored.teams.map(({ legacy_code: _c, ...t }) => ({
        ...t,
        id: team.get(t.id)!,
        division_id: division.get(t.division_id) ?? t.division_id,
      })),
      players: [],
      games: stored.games.map(({ legacy_gid: _g, legacy_index: _i, ...g }) => ({
        ...g,
        id: game.get(g.id)!,
        division_id: g.division_id === null ? null : (division.get(g.division_id) ?? g.division_id),
        team1_id: teamOf(g.team1_id),
        team2_id: teamOf(g.team2_id),
      })),
      scores: stored.scores.map((s) => ({ ...s, game_id: game.get(s.game_id) ?? s.game_id })),
      eventSponsors: [],
      platformSponsors: [],
    },
    oldIndex,
  };
}
