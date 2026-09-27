import { defaultEventSlug, slugYear } from '@/lib/event-slug';

import type { ImportPlan, PlannedEvent } from './import-plan';
import type { ImageSource, Issue, IssueLevel } from './map-event';
import type { Difference } from './verify';

/**
 * The verification report (MIGRATION_PLAN.md 12.1 step 7): per event,
 * counts, every issue grouped by kind, and the computed-output diff. An
 * event is ready when it has no errors and no differences; warnings are
 * changes made so it fits, listed for a person to check.
 */

export interface IssueGroup {
  level: IssueLevel;
  code: string;
  count: number;
  examples: string[];
}

export interface EventReport {
  legacyId: string;
  name: string;
  /**
   * The web address a first import gives it (P-14): the database makes the same
   * default, or adds -2 and so on when another event has it. A re-import keeps
   * the address the event has.
   */
  slug: string;
  status: string;
  counts: {
    divisions: number;
    teams: number;
    players: number;
    games: number;
    scheduled: number;
    unscheduled: number;
    playoff: number;
    scored: number;
    approvals: number;
    mobileLinks: number;
    images: { url: number; embedded: number };
  };
  issues: IssueGroup[];
  differences: Difference[];
  ready: boolean;
}

export interface ImportReport {
  events: EventReport[];
  platform: { sponsors: number; defaultRules: boolean };
  issues: IssueGroup[];
  totals: { events: number; ready: number; errors: number; warnings: number; differences: number };
}

const ORDER: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };
const MAX_EXAMPLES = 3;

export function groupIssues(issues: readonly Issue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const i of issues) {
    const key = `${i.level}:${i.code}`;
    const g = groups.get(key) ?? { level: i.level, code: i.code, count: 0, examples: [] };
    g.count++;
    if (g.examples.length < MAX_EXAMPLES) g.examples.push(i.message);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.code.localeCompare(b.code));
}

const images = (list: readonly (ImageSource | null)[]) => ({
  url: list.filter((s) => s?.kind === 'url').length,
  embedded: list.filter((s) => s?.kind === 'data').length,
});

export function eventReport(e: PlannedEvent, differences: Difference[]): EventReport {
  const p = e.plan;
  const teams = p?.divisions.flatMap((d) => d.teams) ?? [];
  const games = p?.games ?? [];
  const issues = groupIssues(e.issues);
  return {
    legacyId: e.legacyId,
    name: p?.event.name ?? '',
    slug: p
      ? defaultEventSlug(
          p.event.name,
          slugYear(
            p.event.schedule_days,
            p.event.created_at ? new Date(p.event.created_at) : new Date(),
            p.event.timezone,
          ),
        )
      : '',
    status: p?.event.status ?? 'not imported',
    counts: {
      divisions: p?.divisions.length ?? 0,
      teams: teams.length,
      players: teams.reduce((n, t) => n + t.players.length, 0),
      games: games.length,
      scheduled: games.filter((g) => g.day !== null).length,
      unscheduled: games.filter((g) => g.day === null).length,
      playoff: games.filter((g) => g.is_playoff).length,
      // Both sides, as the old page counted a result.
      scored: games.filter((g) => g.score !== null && g.score.s1 !== null && g.score.s2 !== null).length,
      approvals: games.filter((g) => g.source).length,
      mobileLinks: p?.divisions.filter((d) => d.mobile_link).length ?? 0,
      images: images(p ? [p.logo, ...p.sponsors.map((s) => s.source)] : []),
    },
    issues,
    differences,
    ready: Boolean(p) && !issues.some((i) => i.level === 'error') && differences.length === 0,
  };
}

export function importReport(plan: ImportPlan, differences: ReadonlyMap<string, Difference[]>): ImportReport {
  const events = plan.events.map((e) => eventReport(e, differences.get(e.legacyId) ?? []));
  const issues = groupIssues(plan.issues);
  const count = (level: IssueLevel) =>
    [...events.flatMap((e) => e.issues), ...issues].filter((i) => i.level === level).reduce((n, i) => n + i.count, 0);
  return {
    events,
    platform: { sponsors: plan.platform.sponsors.length, defaultRules: plan.platform.default_rules_html !== null },
    issues,
    totals: {
      events: events.length,
      ready: events.filter((e) => e.ready).length,
      errors: count('error'),
      warnings: count('warning'),
      differences: events.reduce((n, e) => n + e.differences.length, 0),
    },
  };
}

const LEVEL_WORD: Record<IssueLevel, string> = { error: 'ERROR', warning: 'warning', info: 'note' };

/** The report as plain text for the terminal. */
export function formatReport(report: ImportReport, options: { applying?: boolean } = {}): string {
  const out: string[] = [];
  const t = report.totals;
  out.push(
    `iTala Connect import report (${options.applying ? 'checked before writing' : 'dry run: nothing was written'})`,
  );
  out.push(
    `${t.events} event(s): ${t.ready} ready, ${t.errors} error(s), ${t.warnings} warning(s), ${t.differences} difference(s)`,
  );
  out.push(
    `Platform: ${report.platform.sponsors} sponsor image(s); default rules ${report.platform.defaultRules ? 'present' : 'not set'}`,
  );
  for (const g of report.issues) out.push(`  ${LEVEL_WORD[g.level]} ${g.code} x${g.count}: ${g.examples[0]}`);
  for (const e of report.events) {
    const c = e.counts;
    out.push('');
    out.push(`${e.ready ? 'READY' : 'CHECK'}  ${e.name || '(untitled)'}  [${e.legacyId}, ${e.status}]`);
    out.push(
      `  ${c.divisions} division(s), ${c.teams} team(s), ${c.players} player(s); ${c.games} game(s): ${c.scheduled} scheduled, ${c.unscheduled} unscheduled, ${c.playoff} playoff, ${c.scored} scored, ${c.approvals} mobile approval(s); ${c.mobileLinks} mobile link(s); images: ${c.images.url} to copy, ${c.images.embedded} embedded`,
    );
    if (e.slug)
      out.push(`  web address for a first import: /events/${e.slug} (with -2 and so on if another event has it)`);
    for (const g of e.issues) {
      out.push(`  ${LEVEL_WORD[g.level]} ${g.code} x${g.count}`);
      for (const ex of g.examples) out.push(`    - ${ex}`);
      if (g.count > g.examples.length) out.push(`    - and ${g.count - g.examples.length} more`);
    }
    for (const d of e.differences) out.push(`  DIFFERENCE ${d.kind} at ${d.where}: old ${d.old}, new ${d.new}`);
  }
  return out.join('\n');
}
