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

/** Where a dragged game can land (E-45): a grid cell, an unscheduled game, or the Unscheduled row. */
export type DropTarget =
  { kind: 'slot'; day: string; time: string; court: number } | { kind: 'game'; id: string } | { kind: 'unscheduled' };

export const targetId = (t: DropTarget) =>
  t.kind === 'slot' ? `slot:${t.day}|${t.time}|${t.court}` : t.kind === 'game' ? `game:${t.id}` : 'unscheduled';

export type DropPlan<G> =
  | { kind: 'move'; game: G; day: string; time: string; court: number }
  | { kind: 'swap'; game: G; other: G }
  | { kind: 'unschedule'; game: G };

/**
 * What dropping a game on a target does, as the old editor did it
 * (schedDrop, schedDropSlot, schedDropUnscheduled): a game swaps slots, an
 * empty cell moves, the Unscheduled row clears the slot. Null when nothing
 * would change: its own slot, two unscheduled games, or no target.
 */
export function planDrop<G extends Game & { id: string }>(
  grid: EditorGrid<G>,
  games: readonly G[],
  gameId: string,
  target: DropTarget | null,
): DropPlan<G> | null {
  const game = games.find((g) => g.id === gameId);
  if (!game || !target) return null;
  if (target.kind === 'unscheduled') return isUnscheduled(game) ? null : { kind: 'unschedule', game };
  const other =
    target.kind === 'game'
      ? games.find((g) => g.id === target.id)
      : grid.days.find((d) => d.day === target.day)?.slots.get(slotKey(target.time, target.court));
  if (other) {
    if (other.id === game.id || (isUnscheduled(game) && isUnscheduled(other))) return null;
    return { kind: 'swap', game, other };
  }
  if (target.kind === 'game') return null;
  return { kind: 'move', game, day: target.day, time: target.time, court: target.court };
}

/** The schedule after a drop, for the optimistic grid while the save runs. */
export function applyDrop<G extends Game & { id: string }>(games: readonly G[], plan: DropPlan<G>): G[] {
  const slotOf = (g: Game) => ({ day: g.day, time: g.time, court: g.court });
  const slots = new Map<string, Pick<Game, 'day' | 'time' | 'court'>>();
  if (plan.kind === 'move') slots.set(plan.game.id, { day: plan.day, time: plan.time, court: plan.court });
  else if (plan.kind === 'unschedule') slots.set(plan.game.id, { day: null, time: null, court: null });
  else {
    slots.set(plan.game.id, slotOf(plan.other));
    slots.set(plan.other.id, slotOf(plan.game));
  }
  return games.map((g) => (slots.has(g.id) ? { ...g, ...slots.get(g.id) } : g));
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Where a game starts a keyboard move: its own cell, or its own card in the Unscheduled row. */
export function ownTarget(game: Game & { id: string }): DropTarget {
  return isUnscheduled(game)
    ? { kind: 'game', id: game.id }
    : { kind: 'slot', day: game.day!, time: game.time!, court: game.court ?? 1 };
}

/**
 * Keyboard moves (E-45) step through the grid the way it reads: left and
 * right across courts, up and down through the times and on into the next
 * or previous day, and up from the first row of the first day into the
 * Unscheduled row, where left and right step through its games. Moves stop
 * at the edges rather than wrapping.
 */
export function nextTarget<G extends Game & { id: string }>(
  grid: EditorGrid<G>,
  from: DropTarget,
  direction: Direction,
): DropTarget {
  const days = grid.days.filter((d) => d.times.length > 0);
  const strip: DropTarget[] = [
    { kind: 'unscheduled' },
    ...grid.unscheduled.map((g): DropTarget => ({ kind: 'game', id: g.id })),
  ];
  const first = days[0];
  const slot = (dayIndex: number, row: number, court: number): DropTarget => {
    const d = days[dayIndex]!;
    return { kind: 'slot', day: d.day, time: d.times[row]!, court };
  };
  const dayIndex = from.kind === 'slot' ? days.findIndex((d) => d.day === from.day) : -1;
  const row = dayIndex < 0 || from.kind !== 'slot' ? -1 : days[dayIndex]!.times.indexOf(from.time);
  if (from.kind !== 'slot' || row < 0) {
    const at = Math.max(
      0,
      strip.findIndex((t) => targetId(t) === targetId(from)),
    );
    if (direction === 'down') return first ? slot(0, 0, 1) : strip[at]!;
    if (direction === 'left') return strip[Math.max(0, at - 1)]!;
    if (direction === 'right') return strip[Math.min(strip.length - 1, at + 1)]!;
    return strip[at]!;
  }
  const times = days[dayIndex]!.times;
  switch (direction) {
    case 'left':
      return slot(dayIndex, row, Math.max(1, from.court - 1));
    case 'right':
      return slot(dayIndex, row, Math.min(grid.courts, from.court + 1));
    case 'down':
      if (row + 1 < times.length) return slot(dayIndex, row + 1, from.court);
      return dayIndex + 1 < days.length ? slot(dayIndex + 1, 0, from.court) : from;
    case 'up':
      if (row > 0) return slot(dayIndex, row - 1, from.court);
      return dayIndex > 0 ? slot(dayIndex - 1, days[dayIndex - 1]!.times.length - 1, from.court) : strip[0]!;
  }
}
