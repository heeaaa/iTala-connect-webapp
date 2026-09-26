import { type EventSetup, type Game, type PlayoffSource } from '@/domain/types';
import { hhmm } from '@/lib/public-event/model';
import { type Json } from '@/lib/supabase/database.types';

/** Stored event fields the scheduler needs. */
export interface SetupEventRow {
  schedule_days: string[];
  time_start: string;
  time_end: string;
  courts: number;
}

/** A stored division with its teams (only their order matters). */
export interface SetupDivisionRow {
  id: string;
  name: string;
  bracket_count: number;
  custom_games_per_team: boolean;
  games_per_team: number | null;
  sort_order: number;
  teams: { id: string; sort_order: number }[];
}

/**
 * Stored rows to the scheduler's input, the same way the golden parity
 * suite maps the old data: teams in insertion order, games per team only
 * when the custom box is ticked with a value above 0.
 */
export function eventSetupFromRows(event: SetupEventRow, divisions: readonly SetupDivisionRow[]): EventSetup {
  return {
    days: [...new Set(event.schedule_days)].sort(),
    timeStart: hhmm(event.time_start)!,
    timeEnd: hhmm(event.time_end)!,
    courts: event.courts || 1,
    divisions: [...divisions]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((d) => ({
        id: d.id,
        name: d.name,
        teamIds: [...d.teams].sort((a, b) => a.sort_order - b.sort_order).map((t) => t.id),
        bracketCount: d.bracket_count || 1,
        gamesPerTeam: d.custom_games_per_team && d.games_per_team ? Math.trunc(d.games_per_team) : null,
      })),
  };
}

/** The jsonb row shape `publish_event` and `append_games` insert. */
export type NewGameRow = {
  division_id: string;
  day: string | null;
  start_time: string | null;
  court: number | null;
  group_id: string | null;
  team1_id: string | null;
  team2_id: string | null;
  label: string;
  type: Game['type'];
  is_playoff: boolean;
  bracket_game_id: string | null;
  team1_source: Json;
  team2_source: Json;
  playoff_round: number | null;
  position: number;
};

const sourceJson = (s: PlayoffSource | undefined): Json =>
  !s ? null : s.type === 'seed' ? { type: 'seed', rank: s.rank } : { type: 'winner', bracketGameId: s.bracketGameId };

/** Domain games to insert rows, keeping their order from `firstPosition`. */
export function gameRows(games: readonly Game[], firstPosition = 0): NewGameRow[] {
  return games.map((g, i) => {
    const scheduled = Boolean(g.day && g.time && g.court);
    return {
      division_id: g.divisionId,
      day: scheduled ? g.day : null,
      start_time: scheduled ? g.time : null,
      court: scheduled ? g.court : null,
      group_id: g.groupId,
      team1_id: g.team1Id,
      team2_id: g.team2Id,
      label: g.label,
      type: g.type,
      is_playoff: Boolean(g.playoff),
      bracket_game_id: g.playoff?.bracketGameId ?? null,
      team1_source: sourceJson(g.playoff?.team1Source),
      team2_source: sourceJson(g.playoff?.team2Source),
      playoff_round: g.playoff?.round ?? null,
      position: firstPosition + i,
    };
  });
}
