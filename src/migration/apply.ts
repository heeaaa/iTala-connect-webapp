import type { ImportPlan } from './import-plan';
import type { EventPlan } from './map-event';
import { legacyKeyedRows, type StoredEvent } from './read-back';
import type { ImportReport } from './report';
import { compareRows, type Difference, type LegacyCode } from './verify';

/**
 * Writing a planned import (MIGRATION_PLAN.md 12.1 steps 5 and 7, Phase 7b).
 * The database is reached only through ImportTarget, so the rules here are
 * tested without one: events with errors are never written, events with
 * differences only when a person has accepted them, and every written event
 * is read back and compared with the old page again.
 */

export interface ImportResult {
  event_id: string;
  created: boolean;
  divisions: number;
  teams: number;
  players: number;
  games: number;
  scores: number;
  approvals: number;
  mobile_links: number;
}

export interface ImportTarget {
  /** An active admin's id by email, or null. */
  ownerId(email: string): Promise<string | null>;
  importEvent(ownerId: string, payload: ImportPayload): Promise<ImportResult>;
  readBack(eventId: string): Promise<StoredEvent>;
  /** Fills the default rules template when iTala Connect has none; true when it did. */
  importPlatform(defaultRulesHtml: string | null): Promise<boolean>;
}

export type ImportPayload = Pick<EventPlan, 'event' | 'divisions' | 'games'>;

/** What the writer takes: the plan without images (the image step sets those). */
export function importPayload(plan: EventPlan): ImportPayload {
  return { event: plan.event, divisions: plan.divisions, games: plan.games };
}

export interface AppliedEvent {
  legacyId: string;
  name: string;
  outcome: 'written' | 'skipped' | 'failed';
  reason?: string;
  result?: ImportResult;
  /** The diff again, on the rows as stored. */
  differences?: Difference[];
}

export interface ApplyResult {
  ownerId: string;
  events: AppliedEvent[];
  /** Null when the platform step did not run (only some events were asked for). */
  defaultRules: boolean | null;
}

export interface ApplyOptions {
  ownerEmail: string;
  acceptDifferences: boolean;
  platform: boolean;
}

export async function applyImport(
  plan: ImportPlan,
  report: ImportReport,
  target: ImportTarget,
  legacy: LegacyCode,
  options: ApplyOptions,
): Promise<ApplyResult> {
  const ownerId = await target.ownerId(options.ownerEmail.trim().toLowerCase());
  if (!ownerId) throw new Error(`No active admin account has the email ${options.ownerEmail}.`);
  const events: AppliedEvent[] = [];
  for (const planned of plan.events) {
    const checked = report.events.find((e) => e.legacyId === planned.legacyId)!;
    const base = { legacyId: planned.legacyId, name: checked.name };
    if (!planned.plan) {
      events.push({ ...base, outcome: 'skipped', reason: 'not an event' });
      continue;
    }
    if (checked.issues.some((i) => i.level === 'error')) {
      events.push({ ...base, outcome: 'skipped', reason: 'has errors' });
      continue;
    }
    if (checked.differences.length && !options.acceptDifferences) {
      events.push({
        ...base,
        outcome: 'skipped',
        reason: 'has differences (check them, then use --accept-differences)',
      });
      continue;
    }
    try {
      const result = await target.importEvent(ownerId, importPayload(planned.plan));
      const keyed = legacyKeyedRows(await target.readBack(result.event_id), planned.legacyId);
      events.push({
        ...base,
        outcome: 'written',
        result,
        differences: compareRows(planned.raw, keyed.rows, keyed.oldIndex, legacy),
      });
    } catch (error) {
      // import_legacy_event is one transaction: a failure leaves the event as it was.
      events.push({ ...base, outcome: 'failed', reason: error instanceof Error ? error.message : String(error) });
    }
  }
  const defaultRules = options.platform ? await target.importPlatform(plan.platform.default_rules_html) : null;
  return { ownerId, events, defaultRules };
}

export function formatApplied(result: ApplyResult): string {
  const out = ['', 'Import (written to the database):'];
  for (const e of result.events) {
    const label = `${e.name || '(untitled)'} [${e.legacyId}]`;
    if (e.outcome === 'written') {
      const r = e.result!;
      out.push(
        `  ${r.created ? 'CREATED' : 'UPDATED'}  ${label}: ${r.divisions} division(s), ${r.teams} team(s), ${r.players} player(s), ${r.games} game(s), ${r.scores} score(s), ${r.approvals} approval(s), ${r.mobile_links} mobile link(s)`,
      );
      if (e.differences!.length)
        for (const d of e.differences!)
          out.push(`    AFTER WRITING, DIFFERENCE ${d.kind} at ${d.where}: old ${d.old}, new ${d.new}`);
      else out.push('    read back: matches the old page');
    } else out.push(`  ${e.outcome.toUpperCase()}  ${label}: ${e.reason}`);
  }
  if (result.defaultRules !== null)
    out.push(`  Default rules template: ${result.defaultRules ? 'filled in from the old database' : 'left as it is'}`);
  const w = result.events.filter((e) => e.outcome === 'written').length;
  out.push(
    `${w} written, ${result.events.filter((e) => e.outcome === 'skipped').length} skipped, ${result.events.filter((e) => e.outcome === 'failed').length} failed.`,
  );
  return out.join('\n');
}
