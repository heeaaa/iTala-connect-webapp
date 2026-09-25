/**
 * Shared domain shapes. Times are event-local wall-clock "HH:MM" strings,
 * days are "YYYY-MM-DD", and a missing team (playoff TBD) is null.
 */

export type GameType = 'group' | 'semi' | 'final';

export type PlayoffSource = { type: 'seed'; rank: number } | { type: 'winner'; bracketGameId: string };

export interface PlayoffLink {
  /** "po_{divisionId}_{n}" (PRD 12.5). */
  bracketGameId: string;
  team1Source: PlayoffSource;
  team2Source: PlayoffSource;
  round: number;
}

export interface Game {
  /** Stable game id once stored. */
  id?: string;
  day: string | null;
  time: string | null;
  court: number | null;
  divisionId: string;
  /** Round-robin group letter when the division has several brackets. */
  groupId: string | null;
  team1Id: string | null;
  team2Id: string | null;
  label: string;
  type: GameType;
  score1: number | null;
  score2: number | null;
  playoff?: PlayoffLink;
}

export interface DivisionSetup {
  id: string;
  name: string;
  /** In insertion order: group splits and standings ties use this order. */
  teamIds: string[];
  /** 1 to 4. */
  bracketCount: number;
  /** Custom games per team, or null for a full round robin. */
  gamesPerTeam: number | null;
}

export interface EventSetup {
  days: string[];
  /** "HH:MM" */
  timeStart: string;
  /** "HH:MM", exclusive. */
  timeEnd: string;
  courts: number;
  divisions: DivisionSetup[];
}
