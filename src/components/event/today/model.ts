import { type DayGame } from '@/domain/game-day';

import { type EventTheme } from '../theme';

/** View model for the public Schedule tab. Built from the database in phase 4. */
export interface TodayDivision {
  id: string;
  name: string;
  color: string;
}

export interface TodayTeam {
  id: string;
  name: string;
  divisionId: string;
}

export interface TodayGame extends DayGame {
  divisionId: string;
  /** "{division} - Group A", "{division} - Semi 1", ... */
  label: string;
  type: 'group' | 'semi' | 'final';
  /** Set when a score just changed, so only that score paints in. */
  changedAt?: number;
}

export interface TodayEvent {
  id: string;
  name: string;
  /** YYYY-MM-DD, any order. */
  days: string[];
  courtNames: string[];
  timeZone: string;
  theme: EventTheme;
  divisions: TodayDivision[];
  teams: TodayTeam[];
  games: TodayGame[];
}

export type FeedState = 'live' | 'reconnecting';

export function courtName(event: Pick<TodayEvent, 'courtNames'>, court: number): string {
  return event.courtNames[court - 1]?.trim() || `Court ${court}`;
}
