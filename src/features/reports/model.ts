/** Isolated report contracts. Existing Connect and mobile rows are mapped here before calculation. */
export type ReportTemplate = 'box-score' | 'league' | 'team' | 'results' | 'leaders' | 'player-log';
export type Coverage = 'complete' | 'not-tracked' | 'partial' | 'unknown';
export type ShotCategory = 'fg2' | 'fg3' | 'ft';
export type OtherCategory = 'rebounds' | 'assists' | 'steals' | 'blocks' | 'fouls';
export type ReportCell = string | number | null;

export interface ReportDefinition {
  eventId: string;
  template: ReportTemplate;
  divisionId?: string;
  teamId?: string;
  playerId?: string;
  dateMode: 'all' | 'day' | 'range' | 'dates';
  dates: string[];
  gameIds?: string[];
  relative?: 'latest' | 'last-five';
  standingsScope?: 'through-cutoff' | 'selected-games';
  minAppearances?: number;
  minAttempts?: number;
}

export interface ReportTeam {
  id: string;
  divisionId: string;
  name: string;
}

export interface ReportPlayer {
  id: string;
  name: string;
}

export interface ReportEvent {
  id: string;
  teamId: string;
  playerId: string | null;
  type: string;
}

/** A manifest is only populated from explicit, server-visible mobile capture evidence. */
export interface SideManifest {
  teamId: string;
  scoring: Coverage;
  shots: Record<ShotCategory, Coverage>;
  turnovers: Coverage;
  other?: Partial<Record<OtherCategory, Coverage>>;
  appearances: 'confirmed' | 'unknown';
  playerIds: string[];
  eventCount: number;
}

export interface ReportGame {
  id: string;
  divisionId: string;
  date: string; // Connect event-local YYYY-MM-DD, never upload time.
  startTime: string;
  type: 'group' | 'playoff' | 'other';
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  mobileGameId: string | null; // Approved provenance only.
  mobileFinal: boolean;
  mobileEvents: ReportEvent[];
  manifests: SideManifest[];
}

export interface ReportSource {
  event: { id: string; name: string; timezone: string };
  divisions: { id: string; name: string }[];
  teams: ReportTeam[];
  players: ReportPlayer[];
  games: ReportGame[];
  readAt: string;
  warnings?: string[];
}

export interface ReportTable {
  title: string;
  columns: { key: string; label: string; kind: 'text' | 'number' }[];
  rows: Record<string, ReportCell>[];
}

export interface ReportDocument {
  version: 1;
  template: ReportTemplate;
  title: string;
  eventId: string;
  eventName: string;
  timezone: string;
  generatedAt: string;
  sourceReadAt: string;
  selectedCount: number;
  includedCount: number;
  gameIds: string[];
  /** Selected games left out, with the reason. `label` names the game ("Sat 04/10/2026 · Aces vs Blues"). */
  exclusions: { gameId: string; label?: string; reason: string }[];
  notes: string[];
  tables: ReportTable[];
}

/** Added when Mobile stats could not be read or checked (or more than 100 games would be). */
export const MOBILE_UNVERIFIED = 'Mobile player statistics could not be verified. Connect scores remain available.';

export const REPORT_TEMPLATES: { id: ReportTemplate; label: string }[] = [
  { id: 'box-score', label: 'Game Box Score Book' },
  { id: 'league', label: 'Cumulative League Statistics' },
  { id: 'team', label: 'Cumulative Team Statistics' },
  { id: 'results', label: 'Results and Standings' },
  { id: 'leaders', label: 'Player Leaderboards' },
  { id: 'player-log', label: 'Player Game Log' },
];
