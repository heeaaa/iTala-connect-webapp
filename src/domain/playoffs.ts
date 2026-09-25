import { toMinutes } from './game-day';
import { fromMinutes, generateBracket } from './scheduler';
import { computeStandings, divisionGroupComplete } from './standings';
import { type EventSetup, type Game, type PlayoffSource } from './types';

/**
 * PRD 12.5 and E-64, ported from Scheduler.resolvePlayoffTeams,
 * resolveAllPlayoffs and editorGeneratePlayoff (iTala-platform/src/app.js
 * 759-843, 1736-1780). Two recorded Fixes: E-64 games that do not fit go
 * to Unscheduled instead of overflowing the last day, and E-41 the day's
 * end time keeps its minutes.
 */

type PlayoffGame = Pick<Game, 'playoff' | 'team1Id' | 'team2Id' | 'score1' | 'score2'>;

export function resolveSource(source: PlayoffSource, games: readonly PlayoffGame[], seeds: readonly string[]) {
  if (source.type === 'seed') return seeds[source.rank - 1] ?? null;
  const ref = games.find((g) => g.playoff?.bracketGameId === source.bracketGameId);
  if (!ref || ref.score1 === null || ref.score2 === null) return null;
  if (ref.score1 > ref.score2) return ref.team1Id;
  if (ref.score2 > ref.score1) return ref.team2Id;
  return null;
}

export interface DivisionTeams {
  id: string;
  teamIds: string[];
}

/**
 * Resolves every playoff game's teams from standings and bracket results.
 * Seeds use whole-division standings and only once the division's round
 * robin is complete. Games resolve in schedule order, so a "winner of"
 * source sees teams already resolved earlier in the list (as the old code
 * did). Returns new game objects; the input is not changed.
 */
export function resolveAllPlayoffs<G extends Game>(divisions: readonly DivisionTeams[], games: readonly G[]): G[] {
  const seeds = new Map(
    divisions.map((d) => [
      d.id,
      divisionGroupComplete(games, d.id) ? computeStandings(d.teamIds, games, d.id).map((r) => r.teamId) : [],
    ]),
  );
  const out = games.map((g) => ({ ...g }));
  for (const g of out) {
    if (!g.playoff) continue;
    const table = seeds.get(g.divisionId) ?? [];
    const team1Id = resolveSource(g.playoff.team1Source, out, table);
    const team2Id = resolveSource(g.playoff.team2Source, out, table);
    g.team1Id = team1Id;
    g.team2Id = team2Id;
  }
  return out;
}

/**
 * "+ Playoff" (E-64): a seeded bracket for one division, placed from one
 * hour after the latest scheduled game, in 60-minute steps on court 1,
 * rolling to the next day. Returns only the new games.
 */
export function placePlayoffGames(
  setup: Pick<EventSetup, 'days' | 'timeStart' | 'timeEnd'>,
  existing: readonly Game[],
  division: { id: string; name: string },
  teams: number,
): Game[] {
  const bracket = generateBracket(division.id, division.name, teams);
  // Each day once: a repeated day would otherwise offer the same slot twice.
  const days = [...new Set(setup.days)].sort();
  const dayStart = toMinutes(setup.timeStart);
  const dayEnd = toMinutes(setup.timeEnd);
  const scheduled = existing.filter((g) => g.day && g.time);

  let lastDay: string | null = null;
  let lastAbs = 0;
  for (const g of scheduled) {
    const abs = Math.max(days.indexOf(g.day!), 0) * 1440 + toMinutes(g.time!);
    if (abs > lastAbs || lastDay === null) {
      lastAbs = abs;
      lastDay = g.day;
    }
  }

  let dayIdx = 0;
  let minute = dayStart;
  if (lastDay !== null) {
    dayIdx = Math.max(days.indexOf(lastDay), 0);
    minute = Math.max(0, ...scheduled.filter((g) => g.day === lastDay).map((g) => toMinutes(g.time!))) + 60;
  }
  if (minute >= dayEnd) {
    dayIdx++;
    minute = dayStart;
  }

  const placed: Game[] = [];
  /*
   * The old findNextFreeSlot also skipped a court-1 slot already in use.
   * That check can never fire: the search always starts after every
   * existing game (the latest one, plus 60 minutes) and after the previous
   * playoff game, so the first slot in the window is always free. Dropping
   * it changes nothing, which the golden placement cases confirm.
   */
  const nextFree = (fromDay: number, fromMinute: number) => {
    for (let d = fromDay, start = fromMinute; d < days.length; d++, start = dayStart) {
      if (start < dayEnd) return { dayIdx: d, minute: start };
    }
    return null;
  };

  for (const bg of bracket) {
    const slot = nextFree(dayIdx, minute);
    placed.push({
      day: slot ? days[slot.dayIdx]! : null,
      time: slot ? fromMinutes(slot.minute) : null,
      court: slot ? 1 : null,
      divisionId: division.id,
      groupId: null,
      team1Id: null,
      team2Id: null,
      label: bg.label,
      type: bg.type,
      score1: null,
      score2: null,
      playoff: {
        bracketGameId: bg.bracketGameId,
        team1Source: bg.team1Source,
        team2Source: bg.team2Source,
        round: bg.round,
      },
    });
    if (!slot) {
      // E-64 fix: out of days, so every later game is unscheduled too.
      dayIdx = days.length;
      continue;
    }
    dayIdx = slot.dayIdx;
    minute = slot.minute + 60;
    if (minute >= dayEnd) {
      dayIdx++;
      minute = dayStart;
    }
  }
  return placed;
}
