import { toMinutes } from './game-day';
import { type DivisionSetup, type EventSetup, type Game, type PlayoffSource } from './types';

/**
 * Port of the old Scheduler (iTala-platform/src/scheduler.js), behaviour
 * identical and proven by the golden suite (tests/unit/golden-parity.test.ts).
 * PRD 12.1 to 12.3 and 12.5. Only the shapes changed: times are "HH:MM",
 * unscheduled games have null day, time and court, TBD is null, and labels
 * use " - " instead of a long dash (organisation copy rule).
 */

/** Minutes a team must rest between its own games on one day. */
export const MIN_GAP = 120;

export function fromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function isUnscheduled(g: Pick<Game, 'day' | 'time'>): boolean {
  return !g.day || !g.time;
}

export interface SlotRow {
  time: string;
  minutes: number;
  courts: number[];
}

/** 12.1: days ascending; hourly rows from start while start < end; courts 1 to N. */
export function buildSlotGrid(setup: Pick<EventSetup, 'days' | 'timeStart' | 'timeEnd' | 'courts'>) {
  const days = [...setup.days].sort();
  const courts = Array.from({ length: setup.courts || 1 }, (_, i) => i + 1);
  const end = toMinutes(setup.timeEnd);
  return days.map((day) => {
    const rows: SlotRow[] = [];
    for (let t = toMinutes(setup.timeStart); t < end; t += 60) rows.push({ time: fromMinutes(t), minutes: t, courts });
    return { day, rows };
  });
}

/** 12.2: circle method, first team fixed; odd counts get a bye. */
export function circleRounds(teamIds: readonly string[], gamesPerTeam: number): [string, string][][] {
  const teams: (string | null)[] = [...teamIds];
  if (teams.length < 2) return [];
  if (teams.length % 2 !== 0) teams.push(null);
  const n = teams.length;
  const wanted = gamesPerTeam > 0 ? Math.min(gamesPerTeam, n - 1) : n - 1;
  const fixed = teams[0]!;
  const rotating = teams.slice(1);
  const rounds: [string, string][][] = [];
  for (let r = 0; r < wanted; r++) {
    const all = [fixed, ...rotating];
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const t1 = all[i]!;
      const t2 = all[n - 1 - i]!;
      // Team ids are unique, so t1 !== t2 always holds; only the bye is skipped.
      if (t1 !== null && t2 !== null) round.push([t1, t2]);
    }
    rounds.push(round);
    rotating.push(rotating.shift()!);
  }
  return rounds;
}

/** A pairing waiting for a slot. */
export interface Pairing {
  divisionId: string;
  groupId: string | null;
  team1Id: string;
  team2Id: string;
  label: string;
  type: 'group';
}

/** 12.2: rounds for one division, split into groups, merged index by index. */
export function divisionRounds(div: DivisionSetup, gamesPerTeamOverride = 0): Pairing[][] {
  if (div.teamIds.length < 2) return [];
  // Whole games only, as the old parseInt did.
  const custom = Math.trunc(gamesPerTeamOverride > 0 ? gamesPerTeamOverride : (div.gamesPerTeam ?? 0));
  const name = div.name || div.id;
  const count = div.bracketCount || 1;
  const groups: { label: string; groupId: string | null; ids: string[] }[] = [];
  if (count <= 1) {
    groups.push({ label: name, groupId: null, ids: div.teamIds });
  } else {
    const per = Math.ceil(div.teamIds.length / count);
    for (let b = 0; b < count; b++) {
      const ids = div.teamIds.slice(b * per, (b + 1) * per);
      if (ids.length < 2) continue;
      const letter = String.fromCharCode(65 + b);
      groups.push({ label: `${name} - Group ${letter}`, groupId: letter, ids });
    }
  }
  const merged: Pairing[][] = [];
  for (const group of groups) {
    circleRounds(group.ids, custom).forEach((round, ri) => {
      merged[ri] ??= [];
      for (const [team1Id, team2Id] of round) {
        merged[ri].push({
          divisionId: div.id,
          groupId: group.groupId,
          team1Id,
          team2Id,
          label: group.label,
          type: 'group',
        });
      }
    });
  }
  return merged;
}

/** 12.2: rounds merged across divisions, index by index (divisions interleave). */
export function buildRounds(setup: Pick<EventSetup, 'divisions'>): Pairing[][] {
  const merged: Pairing[][] = [];
  for (const div of setup.divisions) {
    divisionRounds(div).forEach((round, ri) => {
      merged[ri] = [...(merged[ri] ?? []), ...round];
    });
  }
  return merged;
}

/**
 * 12.3: walk day, time row, court; pick the lowest-scoring placeable
 * pairing for each free slot. Pass 1 holds a team to one game a day while
 * any team with games left has not played; pass 2 fills the rest.
 * Leftovers are returned unscheduled, never dropped. Returns only the new
 * games, in placement order.
 */
export function placeGames(setup: EventSetup, rounds: Pairing[][], existing: readonly Game[] = []): Game[] {
  const grid = buildSlotGrid(setup);
  const placed: Game[] = [];
  const occupied = new Set<string>();
  const played = new Map<string, Map<string, number[]>>();

  const note = (day: string, time: string, court: number | null, teams: (string | null)[]) => {
    // Keyed on minutes so "09:00" and a database "09:00:00" are the same slot.
    occupied.add(`${day}|${toMinutes(time)}|${court}`);
    const minutes = toMinutes(time);
    let byTeam = played.get(day);
    if (!byTeam) played.set(day, (byTeam = new Map()));
    for (const t of teams) {
      if (t === null) continue;
      byTeam.set(t, [...(byTeam.get(t) ?? []), minutes]);
    }
  };

  for (const g of existing) {
    if (isUnscheduled(g)) continue;
    note(g.day!, g.time!, g.court, [g.team1Id, g.team2Id]);
  }

  const pending = rounds.flatMap((round, ri) => round.map((p) => ({ ...p, round: ri })));
  const gamesToday = (day: string, team: string) => played.get(day)?.get(team)?.length ?? 0;
  const restOk = (day: string, team: string, slot: number) =>
    (played.get(day)?.get(team) ?? []).every((m) => Math.abs(slot - m) >= MIN_GAP);

  const pick = (day: string, slot: number, strict: boolean) => {
    const someoneUnplayed =
      strict && pending.some((p) => gamesToday(day, p.team1Id) === 0 || gamesToday(day, p.team2Id) === 0);
    let best = -1;
    let bestScore = Infinity;
    pending.forEach((g, i) => {
      if (!restOk(day, g.team1Id, slot) || !restOk(day, g.team2Id, slot)) return;
      const a = gamesToday(day, g.team1Id);
      const b = gamesToday(day, g.team2Id);
      if (someoneUnplayed && a >= 1 && b >= 1) return;
      const score = g.round * 1000 + (a + b) * 10 + i * 0.001;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  };

  const fill = (strict: boolean) => {
    for (const { day, rows } of grid) {
      for (const row of rows) {
        for (const court of row.courts) {
          if (pending.length === 0) return;
          if (occupied.has(`${day}|${row.minutes}|${court}`)) continue;
          const idx = pick(day, row.minutes, strict);
          if (idx < 0) continue;
          const [g] = pending.splice(idx, 1);
          placed.push(toGame(g!, day, row.time, court));
          note(day, row.time, court, [g!.team1Id, g!.team2Id]);
        }
      }
    }
  };

  fill(true);
  fill(false);
  for (const g of pending) placed.push(toGame(g, null, null, null));
  return placed;
}

function toGame(p: Pairing, day: string | null, time: string | null, court: number | null): Game {
  return {
    day,
    time,
    court,
    divisionId: p.divisionId,
    groupId: p.groupId,
    team1Id: p.team1Id,
    team2Id: p.team2Id,
    label: p.label,
    type: p.type,
    score1: null,
    score2: null,
  };
}

/** 12.3: scheduled first by day, time, court; unscheduled last, stable. Returns a new array. */
export function sortSchedule<G extends Pick<Game, 'day' | 'time' | 'court'>>(games: readonly G[]): G[] {
  return [...games].sort((a, b) => {
    const ua = isUnscheduled(a) ? 1 : 0;
    const ub = isUnscheduled(b) ? 1 : 0;
    if (ua !== ub) return ua - ub;
    if (ua) return 0;
    if (a.day !== b.day) return a.day! < b.day! ? -1 : 1;
    const ma = toMinutes(a.time!);
    const mb = toMinutes(b.time!);
    if (ma !== mb) return ma - mb;
    return (a.court ?? 0) - (b.court ?? 0);
  });
}

/** Publish (E-61): the whole schedule from scratch. */
export function generateSchedule(setup: EventSetup): Game[] {
  const rounds = buildRounds(setup);
  if (rounds.length === 0) return [];
  return sortSchedule(placeGames(setup, rounds));
}

/** Post-publish "+ Round robin" (E-63): skips existing pairings, fills free slots only. Returns the new games. */
export function generateDivisionRoundRobin(
  setup: EventSetup,
  divisionId: string,
  existing: readonly Game[],
  gamesPerTeam = 0,
): Game[] {
  const div = setup.divisions.find((d) => d.id === divisionId);
  if (!div) return [];
  const pairKey = (a: string, b: string) => [a, b].sort().join('|');
  const seen = new Set(
    existing
      .filter((g) => g.divisionId === divisionId && g.team1Id !== null && g.team2Id !== null)
      .map((g) => pairKey(g.team1Id!, g.team2Id!)),
  );
  const rounds = divisionRounds(div, gamesPerTeam)
    .map((round) => round.filter((p) => !seen.has(pairKey(p.team1Id, p.team2Id))))
    .filter((round) => round.length > 0);
  if (rounds.length === 0) return [];
  return placeGames(setup, rounds, existing);
}

/** Full round robin games per team (E-63 dialog). */
export function maxRoundsFor(teams: number): number {
  if (teams < 2) return 0;
  return teams % 2 === 0 ? teams - 1 : teams;
}

export interface BracketGame {
  bracketGameId: string;
  round: number;
  label: string;
  type: 'semi' | 'final';
  team1Source: PlayoffSource;
  team2Source: PlayoffSource;
}

/** 12.5: seeded single elimination; missing opponents are byes. */
export function generateBracket(divisionId: string, divisionName: string, teams: number): BracketGame[] {
  if (teams < 2) return [];
  let size = 1;
  while (size < teams) size *= 2;
  const prefix = `po_${divisionId}_`;
  const name = divisionName || divisionId;
  const games: BracketGame[] = [];
  let gameNum = 0;

  let sources: PlayoffSource[] = [];
  for (let i = 0; i < size / 2; i++) {
    const s1 = i + 1;
    const s2 = size - i;
    if (s2 > teams) {
      sources.push({ type: 'seed', rank: s1 });
      continue;
    }
    gameNum++;
    const id = prefix + gameNum;
    const roundLabel = teams <= 4 ? 'Semi' : teams <= 8 ? 'Quarter' : 'R1';
    games.push({
      bracketGameId: id,
      round: 1,
      label: `${name} - ${roundLabel} ${gameNum}`,
      type: 'semi',
      team1Source: { type: 'seed', rank: s1 },
      team2Source: { type: 'seed', rank: s2 },
    });
    sources.push({ type: 'winner', bracketGameId: id });
  }

  let round = 1;
  while (sources.length > 1) {
    round++;
    const next: PlayoffSource[] = [];
    const count = sources.length;
    for (let j = 0; j < count / 2; j++) {
      gameNum++;
      const id = prefix + gameNum;
      const roundLabel = count === 2 ? 'Finals' : count === 4 ? 'Semi' : `R${round}`;
      games.push({
        bracketGameId: id,
        round,
        label: `${name} - ${roundLabel}${count > 2 ? ` ${j + 1}` : ''}`,
        type: count === 2 ? 'final' : 'semi',
        team1Source: sources[j]!,
        team2Source: sources[count - 1 - j]!,
      });
      next.push({ type: 'winner', bracketGameId: id });
    }
    sources = next;
  }
  return games;
}
