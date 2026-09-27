import { computeStandings } from '@/domain/standings';
import { scoredGames, toEventModel, type EventRows } from '@/lib/public-event/model';

import { entries, inFirebaseOrder, isRecord } from './firebase-tree';
import type { ImportPlan } from './import-plan';
import { parseOldTime, type EventPlan } from './map-event';

/**
 * The computed-output diff (MIGRATION_PLAN.md 12.1 step 7): what the live
 * old page showed, worked out by the old code itself on the old data,
 * against what the new public page shows from the imported rows. Per game:
 * where it appears, its score and its resolved playoff teams; per division:
 * the standings. Runs on the plan before writing and on the stored rows after.
 */

/** The verbatim old functions: live-extract.js (scores) and app-extract.js (the rest, the same in both builds). */
export interface LegacyCode {
  applyScoresToSchedule(evt: object, scores: unknown): void;
  resolveAllPlayoffs(evt: object): void;
  publicStandings(
    evt: object,
  ): Record<string, { code: string; w: number; l: number; pf: number; pa: number; diff: number; gp: number }[]>;
}

export interface Difference {
  kind: 'score' | 'standings' | 'playoff' | 'slot' | 'game';
  where: string;
  old: string;
  new: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the old event is untyped by nature */
type OldGame = any;

const oldScore = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
};
const oldTeam = (v: unknown): string | null => (typeof v === 'string' && v && v !== 'TBD' ? v : null);
const show = (v: unknown) => JSON.stringify(v);
const isUnscheduled = (g: OldGame) => !g.day || g.day === 'TBD' || !g.time || g.time === 'TBD';

/**
 * A fresh load of the live page (deploy/src/app.js 1356-1368): the first
 * render resolves playoffs on the event as read, then the scores listener
 * applies scores and renders again, which resolves them a second time.
 */
function oldView(raw: Record<string, unknown>, legacy: LegacyCode) {
  const evt = inFirebaseOrder(raw) as Record<string, any>;
  // The schedule as the Firebase SDK hands it over: an array with holes, so
  // positions (and position-based scores) line up.
  const schedule: OldGame[] = [];
  for (const [k, g] of entries(evt.schedule)) if (isRecord(g)) schedule[Number(k)] = g;
  evt.schedule = schedule;
  legacy.resolveAllPlayoffs(evt);
  legacy.applyScoresToSchedule(evt, evt.scores ?? null);
  legacy.resolveAllPlayoffs(evt);
  // Where each game appeared: days[day][time][court] = g, so a later row takes the slot.
  const lastInSlot = new Map<string, number>();
  schedule.forEach((g, i) => {
    if (!isUnscheduled(g)) lastInSlot.set(`${g.day}\u0000${g.time}\u0000${g.court}`, i);
  });
  const placement = schedule.map((g, i) => {
    if (isUnscheduled(g)) return 'unscheduled';
    if (lastInSlot.get(`${g.day}\u0000${g.time}\u0000${g.court}`) !== i) return 'hidden';
    return `${g.day} ${parseOldTime(String(g.time))?.hhmm ?? g.time} court ${parseInt(g.court, 10)}`;
  });
  return {
    schedule,
    placement,
    scores: schedule.map((g) => [oldScore(g.s1), oldScore(g.s2)]),
    standings: legacy.publicStandings(evt),
  };
}

/** The plan's rows as the new public page reads them. Legacy keys stand in for ids. */
export function rowsOf(plan: EventPlan): EventRows {
  const e = plan.event;
  return {
    event: {
      id: plan.legacyId,
      name: e.name,
      status: e.status,
      schedule_days: e.schedule_days,
      time_start: `${e.time_start}:00`,
      time_end: `${e.time_end}:00`,
      courts: e.courts,
      court_names: e.court_names,
      timezone: e.timezone,
      logo_path: null,
      theme_primary: e.theme_primary,
      theme_bg: e.theme_bg,
      theme_text: e.theme_text,
      theme_text_secondary: e.theme_text_secondary,
      theme_heading: e.theme_heading,
      rules_html: e.rules_html,
    },
    divisions: plan.divisions.map((d) => ({
      id: d.legacy_key,
      name: d.name,
      color: d.color,
      sort_order: d.sort_order,
      created_at: '',
    })),
    teams: plan.divisions.flatMap((d) =>
      d.teams.map((t) => ({
        id: t.legacy_code,
        division_id: d.legacy_key,
        name: t.name,
        coach: t.coach,
        sort_order: t.sort_order,
        created_at: '',
      })),
    ),
    players: [],
    games: plan.games.map((g) => ({
      id: g.legacy_gid,
      division_id: g.division_key,
      day: g.day,
      start_time: g.start_time ? `${g.start_time}:00` : null,
      court: g.court,
      group_id: g.group_id,
      team1_id: g.team1?.code ?? null,
      team2_id: g.team2?.code ?? null,
      label: g.label,
      type: g.type,
      is_playoff: g.is_playoff,
      bracket_game_id: g.bracket_game_id,
      team1_source: g.team1_source,
      team2_source: g.team2_source,
      playoff_round: g.playoff_round,
      position: g.position,
    })),
    scores: plan.games.filter((g) => g.score).map((g) => ({ game_id: g.legacy_gid, s1: g.score!.s1, s2: g.score!.s2 })),
    eventSponsors: [],
    platformSponsors: [],
  };
}

/**
 * Rows keyed by legacy keys (team ids are team codes, division ids division
 * keys) against the raw old event. oldIndex gives each game's position in
 * the old schedule array.
 */
export function compareRows(
  raw: unknown,
  rows: EventRows,
  oldIndex: ReadonlyMap<string, number>,
  legacy: LegacyCode,
): Difference[] {
  if (!isRecord(raw)) return [];
  const before = oldView(raw, legacy);
  const model = toEventModel(rows, '');
  const games = scoredGames(model);
  const diffs: Difference[] = [];
  const matched = new Set<number>();

  for (const g of games) {
    const i = oldIndex.get(g.id);
    const oldG = i === undefined ? undefined : before.schedule[i];
    const where = `game ${i === undefined ? '?' : i + 1} ("${g.label || 'no label'}")`;
    if (i === undefined || !oldG) {
      diffs.push({ kind: 'game', where, old: 'not on the old page', new: 'on the new page' });
      continue;
    }
    matched.add(i);
    const now =
      g.day === null ? 'unscheduled' : model.days.includes(g.day) ? `${g.day} ${g.time} court ${g.court}` : 'hidden';
    const was = before.placement[i]!;
    // A game the old page hid behind another now shows in Unscheduled: better, and reported by the mapping.
    if (was !== now && !(was === 'hidden' && now === 'unscheduled'))
      diffs.push({ kind: 'slot', where, old: was, new: now });
    const score = [g.score1, g.score2];
    if (show(before.scores[i]) !== show(score))
      diffs.push({ kind: 'score', where, old: show(before.scores[i]), new: show(score) });
    if (oldG.playoff && oldG.team1Source) {
      const wasTeams = [oldTeam(oldG.team1), oldTeam(oldG.team2)];
      const nowTeams = [g.team1Id, g.team2Id];
      if (show(wasTeams) !== show(nowTeams))
        diffs.push({ kind: 'playoff', where, old: show(wasTeams), new: show(nowTeams) });
    }
  }
  before.schedule.forEach((g: OldGame, i) => {
    if (!matched.has(i))
      diffs.push({ kind: 'game', where: `game ${i + 1} ("${g.label ?? ''}")`, old: 'on the old page', new: 'missing' });
  });

  const names = new Map(model.divisions.map((d) => [d.id, d.name]));
  for (const id of new Set([...Object.keys(before.standings), ...model.divisions.map((d) => d.id)])) {
    const d = model.divisions.find((x) => x.id === id);
    const was = (before.standings[id] ?? []).map((r) => [r.code, r.w, r.l, r.pf, r.pa, r.diff, r.gp]);
    const now = d
      ? computeStandings(d.teamIds, games, d.id).map((r) => [r.teamId, r.w, r.l, r.pf, r.pa, r.diff, r.gp])
      : [];
    if (show(was) !== show(now))
      diffs.push({ kind: 'standings', where: `division "${names.get(id) ?? id}"`, old: show(was), new: show(now) });
  }
  return diffs;
}

/** The diff on the plan, before anything is written. */
export function verifyEvent(raw: unknown, plan: EventPlan, legacy: LegacyCode): Difference[] {
  return compareRows(raw, rowsOf(plan), new Map(plan.games.map((g) => [g.legacy_gid, g.legacy_index])), legacy);
}

/**
 * The diff for every planned event. An event the old code cannot work out
 * gets an error (so it is not written) and the rest are still checked.
 */
export function verifyAll(plan: ImportPlan, legacy: LegacyCode): Map<string, Difference[]> {
  const diffs = new Map<string, Difference[]>();
  for (const e of plan.events) {
    if (!e.plan) continue;
    try {
      diffs.set(e.legacyId, verifyEvent(e.raw, e.plan, legacy));
    } catch (error) {
      e.issues.push({
        level: 'error',
        code: 'verify.failed',
        message: `The old code could not work this event out (${error instanceof Error ? error.message : String(error)}), so it cannot be checked.`,
      });
    }
  }
  return diffs;
}
