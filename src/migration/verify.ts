import { computeStandings } from '@/domain/standings';
import { scoredGames, toEventModel, type EventRows } from '@/lib/public-event/model';

import { entries, inFirebaseOrder, isRecord } from './firebase-tree';
import type { EventPlan } from './map-event';

/**
 * The computed-output diff (MIGRATION_PLAN.md 12.1 step 7): what the old
 * public page showed, worked out by the old code itself on the old data,
 * against what the new public page shows from the imported rows. Scores
 * per game, standings per division and resolved playoff teams must match.
 */

/** The verbatim old functions (scripts/golden/legacy/app-extract.js). */
export interface LegacyCode {
  cleanScheduleRow(g: object): object;
  applyScoresToSchedule(evt: object, scores: unknown, scoresById: unknown): void;
  resolveAllPlayoffs(evt: object): void;
  publicStandings(
    evt: object,
  ): Record<string, { code: string; w: number; l: number; pf: number; pa: number; diff: number; gp: number }[]>;
}

export interface Difference {
  kind: 'score' | 'standings' | 'playoff';
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

/** The old page's view of one raw event: scores applied, playoffs resolved, standings. */
function oldView(raw: Record<string, unknown>, legacy: LegacyCode) {
  const evt = inFirebaseOrder(raw) as Record<string, any>;
  // The schedule as the Firebase SDK hands it over: an array, with holes
  // where rows are missing, so positions (and positional scores) line up.
  const schedule: OldGame[] = [];
  for (const [k, g] of entries(raw.schedule)) if (isRecord(g)) schedule[Number(k)] = legacy.cleanScheduleRow(g);
  evt.schedule = schedule;
  legacy.applyScoresToSchedule(evt, evt.scores ?? null, evt.scoresById ?? null);
  const scores = schedule.map((g: OldGame) => [oldScore(g.s1), oldScore(g.s2)]);
  legacy.resolveAllPlayoffs(evt);
  return { schedule, scores, standings: legacy.publicStandings(evt) };
}

/** The imported rows as the new public page reads them. Legacy keys stand in for ids. */
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

export function verifyEvent(raw: unknown, plan: EventPlan, legacy: LegacyCode): Difference[] {
  if (!isRecord(raw)) return [];
  const before = oldView(raw, legacy);
  const model = toEventModel(rowsOf(plan), '');
  const after = new Map(scoredGames(model).map((g) => [g.id, g]));
  const diffs: Difference[] = [];

  for (const g of plan.games) {
    const where = `game ${g.legacy_index + 1} ("${g.label || 'no label'}")`;
    const oldG = before.schedule[g.legacy_index];
    const newG = after.get(g.legacy_gid)!;
    const was = before.scores[g.legacy_index] ?? [null, null];
    const now = [newG.score1, newG.score2];
    if (show(was) !== show(now)) diffs.push({ kind: 'score', where, old: show(was), new: show(now) });
    if (oldG?.playoff && oldG.team1Source) {
      const wasTeams = [oldTeam(oldG.team1), oldTeam(oldG.team2)];
      const nowTeams = [newG.team1Id, newG.team2Id];
      if (show(wasTeams) !== show(nowTeams))
        diffs.push({ kind: 'playoff', where, old: show(wasTeams), new: show(nowTeams) });
    }
  }

  const games = [...after.values()];
  for (const d of model.divisions) {
    const was = (before.standings[d.id] ?? []).map((r) => [r.code, r.w, r.l, r.pf, r.pa, r.diff, r.gp]);
    const now = computeStandings(d.teamIds, games, d.id).map((r) => [r.teamId, r.w, r.l, r.pf, r.pa, r.diff, r.gp]);
    if (show(was) !== show(now))
      diffs.push({ kind: 'standings', where: `division "${d.name}"`, old: show(was), new: show(now) });
  }
  return diffs;
}
