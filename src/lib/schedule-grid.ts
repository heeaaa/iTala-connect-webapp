import { toMinutes } from '@/domain/game-day';
import { buildSlotGrid, isUnscheduled } from '@/domain/scheduler';
import { type Game } from '@/domain/types';

export interface GridDay<G> {
  day: string;
  /** "HH:MM" rows in time order. */
  times: string[];
  /** Game at "time|court". */
  slots: Map<string, G>;
}

export interface EditorGrid<G> {
  days: GridDay<G>[];
  /** Court columns: the event's courts, or more if a game sits on a higher court. */
  courts: number;
  unscheduled: G[];
}

export const slotKey = (time: string, court: number) => `${time}|${court}`;

/**
 * The editor schedule grid (PRD E-40, E-41): one table per event day with
 * every hourly slot in the window (end minutes honoured, as the scheduler
 * does), plus any off-grid times and days that games already use.
 */
export function editorGrid<G extends Game>(
  event: { days: readonly string[]; timeStart: string; timeEnd: string; courts: number },
  games: readonly G[],
): EditorGrid<G> {
  const byDay = new Map<string, Set<string>>();
  for (const { day, rows } of buildSlotGrid({ ...event, days: [...new Set(event.days)] }))
    byDay.set(day, new Set(rows.map((r) => r.time)));
  const unscheduled: G[] = [];
  const slots = new Map<string, Map<string, G>>();
  let courts = event.courts || 1;
  for (const g of games) {
    if (isUnscheduled(g)) {
      unscheduled.push(g);
      continue;
    }
    const day = g.day!;
    const court = g.court ?? 1;
    if (!byDay.has(day)) byDay.set(day, new Set());
    byDay.get(day)!.add(g.time!);
    if (!slots.has(day)) slots.set(day, new Map());
    slots.get(day)!.set(slotKey(g.time!, court), g);
    courts = Math.max(courts, court);
  }
  return {
    courts,
    unscheduled,
    days: [...byDay.keys()].sort().map((day) => ({
      day,
      times: [...byDay.get(day)!].sort((a, b) => toMinutes(a) - toMinutes(b)),
      slots: slots.get(day) ?? new Map(),
    })),
  };
}
