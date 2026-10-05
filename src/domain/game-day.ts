/**
 * Game-day view rules for the public Schedule tab (the "Today" screen).
 *
 * New in iTala Connect (no old-code equivalent), so there is no golden
 * file: the rules are the ones confirmed in the Today surface brief.
 *  - On court: the game's scheduled slot is in progress.
 *  - Final: the slot has passed and both scores are in (0 is a score).
 *  - Awaiting score: the slot has passed without both scores.
 * All times are the event's local wall-clock times; the caller converts
 * "now" into the event time zone first (src/lib/event-time.ts).
 */

/** Scheduler slots are 60-minute steps (PRD 12.1). */
export const SLOT_MINUTES = 60;

export interface DayGame {
  id: string;
  /** YYYY-MM-DD, or null when unscheduled. */
  day: string | null;
  /** HH:MM (24 h), or null when unscheduled. */
  time: string | null;
  /** 1-based court number, or null when unscheduled. */
  court: number | null;
  /** null while a playoff team is still TBD. */
  team1Id: string | null;
  team2Id: string | null;
  score1: number | null;
  score2: number | null;
}

/** "Now" in the event's time zone. */
export interface Clock {
  date: string;
  minutes: number;
}

export type GameStatus = 'unscheduled' | 'upcoming' | 'on-court' | 'final' | 'awaiting-score';

export function toMinutes(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

export function hasBothScores(game: Pick<DayGame, 'score1' | 'score2'>): boolean {
  return game.score1 !== null && game.score2 !== null;
}

export function gameStatus(game: DayGame, clock: Clock, slotMinutes = SLOT_MINUTES): GameStatus {
  if (game.day === null || game.time === null) return 'unscheduled';
  const finished = hasBothScores(game) ? 'final' : 'awaiting-score';
  if (game.day < clock.date) return finished;
  if (game.day > clock.date) return 'upcoming';
  const start = toMinutes(game.time);
  if (clock.minutes < start) return 'upcoming';
  if (clock.minutes < start + slotMinutes) return 'on-court';
  return finished;
}

export type DayRelation = 'today' | 'upcoming' | 'past';

/**
 * The day the Schedule tab opens on: today when it is an event day, else
 * the next event day, else the last one. Null when the event has no days.
 */
export function pickFocusDay(days: readonly string[], today: string): { day: string; relation: DayRelation } | null {
  const sorted = [...days].sort();
  if (sorted.includes(today)) return { day: today, relation: 'today' };
  const next = sorted.find((d) => d > today);
  if (next) return { day: next, relation: 'upcoming' };
  const last = sorted.at(-1);
  return last ? { day: last, relation: 'past' } : null;
}

export function compareScheduled(a: DayGame, b: DayGame): number {
  return (
    (a.day ?? '').localeCompare(b.day ?? '') ||
    (a.time ?? '').localeCompare(b.time ?? '') ||
    (a.court ?? 0) - (b.court ?? 0)
  );
}

export interface CourtStations<G extends DayGame> {
  court: number;
  /** Most recently finished game (final or awaiting score). */
  final: G | null;
  onCourt: G | null;
  upNext: G | null;
  /** The upcoming game after upNext. */
  then: G | null;
}

/** Final, On court and Up next for every court on one day. */
export function courtStations<G extends DayGame>(
  games: readonly G[],
  day: string,
  courts: number,
  clock: Clock,
  slotMinutes = SLOT_MINUTES,
): CourtStations<G>[] {
  const result: CourtStations<G>[] = [];
  for (let court = 1; court <= courts; court++) {
    const onThisCourt = games.filter((g) => g.day === day && g.court === court && g.time !== null);
    onThisCourt.sort(compareScheduled);
    const status = (g: G) => gameStatus(g, clock, slotMinutes);
    const finished = onThisCourt.filter((g) => {
      const s = status(g);
      return s === 'final' || s === 'awaiting-score';
    });
    const upcoming = onThisCourt.filter((g) => status(g) === 'upcoming');
    result.push({
      court,
      final: finished.at(-1) ?? null,
      onCourt: onThisCourt.find((g) => status(g) === 'on-court') ?? null,
      upNext: upcoming[0] ?? null,
      then: upcoming[1] ?? null,
    });
  }
  return result;
}

export function involvesTeam(game: DayGame, teamId: string): boolean {
  return game.team1Id === teamId || game.team2Id === teamId;
}

/** The team's game on court now, else its next upcoming game on any day. */
export function nextGameForTeam<G extends DayGame>(
  games: readonly G[],
  teamId: string,
  clock: Clock,
  slotMinutes = SLOT_MINUTES,
): G | null {
  const candidates = games
    .filter((g) => involvesTeam(g, teamId))
    .filter((g) => {
      const s = gameStatus(g, clock, slotMinutes);
      return s === 'on-court' || s === 'upcoming';
    });
  candidates.sort(compareScheduled);
  return candidates[0] ?? null;
}

export interface DayWindow {
  /** Minutes after midnight of the first slot's start. */
  start: number;
  /** Minutes after midnight of the last slot's end. */
  end: number;
}

/** First start to last end of the scheduled games on one day. */
export function dayWindow(games: readonly DayGame[], day: string, slotMinutes = SLOT_MINUTES): DayWindow | null {
  const starts = games.filter((g) => g.day === day && g.time !== null).map((g) => toMinutes(g.time!));
  if (starts.length === 0) return null;
  return { start: Math.min(...starts), end: Math.max(...starts) + slotMinutes };
}

/** Where "now" sits in the window, 0 to 1, or null when outside it or on another day. */
export function nowFraction(clock: Clock, day: string, window: DayWindow): number | null {
  if (clock.date !== day) return null;
  if (clock.minutes < window.start || clock.minutes > window.end) return null;
  return (clock.minutes - window.start) / (window.end - window.start);
}

/** One label in the day grid's time column. */
export interface StartMark {
  /** Minutes after midnight of the earliest start in the mark. */
  start: number;
  /** Minutes after midnight where the next mark starts, or the window end. */
  end: number;
  /** HH:MM starts shown together, earliest first (two only when they share one grid step). */
  times: string[];
}

/**
 * The time column (reported 05/10/2026): one mark per distinct start time
 * on the day, so every label is a real start time level with its games. An
 * hourly ruler counted from the first game drifted 5 minutes a game when
 * games ran 65 minutes apart. Starts in the same grid step share a mark.
 */
export function startMarks(games: readonly DayGame[], day: string, window: DayWindow, step = 5): StartMark[] {
  const starts = new Map<number, string>();
  for (const g of games) {
    if (g.day !== day || g.time === null) continue;
    const minutes = toMinutes(g.time);
    if (!starts.has(minutes)) starts.set(minutes, g.time);
  }
  const marks: StartMark[] = [];
  let stepOfLast = Number.NaN;
  for (const minutes of [...starts.keys()].sort((a, b) => a - b)) {
    const stepOf = Math.floor((minutes - window.start) / step);
    const last = marks.at(-1);
    if (last && stepOf === stepOfLast) last.times.push(starts.get(minutes)!);
    else {
      if (last) last.end = minutes;
      marks.push({ start: minutes, end: window.end, times: [starts.get(minutes)!] });
    }
    stepOfLast = stepOf;
  }
  return marks;
}

/**
 * The start time whose games are on court now, banded on the grid until its
 * slot ends or the next start begins, whichever is first. Null between games,
 * over a break, before the first start, after the last slot and on another day.
 */
export function markInProgress(
  marks: readonly StartMark[],
  clock: Clock,
  day: string,
  slotMinutes = SLOT_MINUTES,
): { mark: StartMark; until: number } | null {
  if (clock.date !== day) return null;
  for (const mark of marks) {
    const until = Math.min(mark.end, mark.start + slotMinutes);
    if (mark.start <= clock.minutes && clock.minutes < until) return { mark, until };
  }
  return null;
}

/**
 * Where a game's cell ends on the day grid: the end of its slot, or sooner
 * when the next game on its court starts first, so cells never overlap.
 */
export function cellEnd(game: DayGame, games: readonly DayGame[], slotMinutes = SLOT_MINUTES): number {
  const start = toMinutes(game.time!);
  let end = start + slotMinutes;
  for (const g of games) {
    if (g.day !== game.day || g.court !== game.court || g.time === null) continue;
    const next = toMinutes(g.time);
    if (next > start && next < end) end = next;
  }
  return end;
}
