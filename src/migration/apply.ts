import type { StoredType } from '@/lib/event-images';

import { imageOrigin, storedImage } from './images';
import type { ImportPlan } from './import-plan';
import type { EventPlan, ImageSource } from './map-event';
import { legacyKeyedRows, type StoredEvent } from './read-back';
import type { ImportReport } from './report';
import { compareRows, type Difference, type LegacyCode } from './verify';

/**
 * Writing a planned import (MIGRATION_PLAN.md 12.1 steps 4, 5 and 7).
 * The database and the bucket are reached only through ImportTarget, so the
 * rules here are tested without them: events with errors are never written,
 * events with differences only when a person has accepted them, every
 * written event is read back and compared with the old page again, and an
 * image that cannot be copied is reported without undoing the event.
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

export interface SponsorRow {
  tier: string;
  image_path: string;
  sort_order: number;
}

export interface ImportTarget {
  /** An active admin's id by email, or null. */
  ownerId(email: string): Promise<string | null>;
  importEvent(ownerId: string, payload: ImportPayload): Promise<ImportResult>;
  readBack(eventId: string): Promise<StoredEvent>;
  /** Fills the default rules template when iTala Connect has none; true when it did. */
  importPlatform(defaultRulesHtml: string | null): Promise<boolean>;
  /** An old image's bytes by its web address; throws with a reason. */
  fetchImage(url: string): Promise<Uint8Array>;
  uploadImage(path: string, bytes: Uint8Array, type: StoredType): Promise<void>;
  removeImages(paths: string[]): Promise<void>;
  /** Sets an imported event's logo and sponsors together; returns the files no longer used. */
  setEventImages(eventId: string, logoPath: string | null, sponsors: SponsorRow[]): Promise<string[]>;
  platformHasSponsors(): Promise<boolean>;
  /** Only when iTala Connect has none; true when it set them. */
  setPlatformSponsors(sponsors: SponsorRow[]): Promise<boolean>;
}

export type ImportPayload = Pick<EventPlan, 'event' | 'divisions' | 'games'>;

/** What the writer takes: the plan without images (the image step sets those). */
export function importPayload(plan: EventPlan): ImportPayload {
  return { event: plan.event, divisions: plan.divisions, games: plan.games };
}

export interface ImageOutcome {
  copied: number;
  left: { what: string; reason: string }[];
}

export interface AppliedEvent {
  legacyId: string;
  name: string;
  outcome: 'written' | 'skipped' | 'failed';
  reason?: string;
  result?: ImportResult;
  /** The diff again, on the rows as stored. */
  differences?: Difference[];
  images?: ImageOutcome;
}

export interface ApplyResult {
  ownerId: string;
  events: AppliedEvent[];
  /** Null when the platform step did not run (only some events were asked for). */
  defaultRules: boolean | null;
  platformSponsors: (ImageOutcome & { set: boolean }) | null;
}

export interface ApplyOptions {
  ownerEmail: string;
  acceptDifferences: boolean;
  platform: boolean;
  images: boolean;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

type Place = Parameters<typeof storedImage>[1];

/** One image into the bucket: decoded or fetched, checked, uploaded. */
async function copyImage(target: ImportTarget, source: ImageSource, place: Place) {
  const origin = imageOrigin(source);
  if ('problem' in origin) return { problem: origin.problem };
  let bytes: Uint8Array;
  if ('url' in origin) {
    try {
      bytes = await target.fetchImage(origin.url);
    } catch (error) {
      return { problem: `it could not be fetched (${reason(error)})` };
    }
  } else bytes = origin.bytes;
  const stored = storedImage(bytes, place);
  if ('problem' in stored) return stored;
  try {
    await target.uploadImage(stored.path, stored.bytes, stored.type);
  } catch (error) {
    return { problem: `it could not be uploaded (${reason(error)})` };
  }
  return { path: stored.path };
}

async function copyEventImages(target: ImportTarget, plan: EventPlan, eventId: string): Promise<ImageOutcome> {
  const outcome: ImageOutcome = { copied: 0, left: [] };
  let logoPath: string | null = null;
  if (plan.logo) {
    const r = await copyImage(target, plan.logo, { eventId, kind: 'logo' });
    if ('path' in r) {
      logoPath = r.path;
      outcome.copied++;
    } else outcome.left.push({ what: 'the logo', reason: r.problem });
  }
  const sponsors: SponsorRow[] = [];
  for (const s of plan.sponsors) {
    const r = await copyImage(target, s.source, { eventId, kind: s.tier });
    const what = s.tier === 'major' ? 'the major sponsor' : `minor sponsor ${s.sort_order + 1}`;
    if ('path' in r) {
      // Minor sponsors keep their order, closing any gap a lost one leaves.
      sponsors.push({ tier: s.tier, image_path: r.path, sort_order: sponsors.filter((x) => x.tier === s.tier).length });
      outcome.copied++;
    } else outcome.left.push({ what, reason: r.problem });
  }
  const unused = await target.setEventImages(eventId, logoPath, sponsors);
  if (unused.length) await target.removeImages(unused);
  return outcome;
}

async function copyPlatformSponsors(target: ImportTarget, plan: ImportPlan) {
  const outcome = { copied: 0, left: [] as ImageOutcome['left'], set: false };
  if (!plan.platform.sponsors.length || (await target.platformHasSponsors())) return outcome;
  const rows: SponsorRow[] = [];
  for (const s of plan.platform.sponsors) {
    const r = await copyImage(target, s.source, { tier: s.tier });
    if ('path' in r) {
      rows.push({ tier: s.tier, image_path: r.path, sort_order: rows.filter((x) => x.tier === s.tier).length });
      outcome.copied++;
    } else outcome.left.push({ what: `platform ${s.tier} sponsor ${s.sort_order + 1}`, reason: r.problem });
  }
  if (rows.length) {
    outcome.set = await target.setPlatformSponsors(rows);
    // Someone set sponsors in Connect meanwhile: theirs stay, these files go.
    if (!outcome.set) await target.removeImages(rows.map((r) => r.image_path));
  }
  return outcome;
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
    let result: ImportResult;
    try {
      result = await target.importEvent(ownerId, importPayload(planned.plan));
    } catch (error) {
      // import_legacy_event is one transaction: a failure leaves the event as it was.
      events.push({ ...base, outcome: 'failed', reason: reason(error) });
      continue;
    }
    const written: AppliedEvent = { ...base, outcome: 'written', result };
    try {
      const keyed = legacyKeyedRows(await target.readBack(result.event_id), planned.legacyId);
      written.differences = compareRows(planned.raw, keyed.rows, keyed.oldIndex, legacy);
    } catch (error) {
      written.reason = `written, but it could not be read back: ${reason(error)}`;
    }
    if (options.images) {
      try {
        written.images = await copyEventImages(target, planned.plan, result.event_id);
      } catch (error) {
        written.images = { copied: 0, left: [{ what: 'the images', reason: reason(error) }] };
      }
    }
    events.push(written);
  }
  const defaultRules = options.platform ? await target.importPlatform(plan.platform.default_rules_html) : null;
  const platformSponsors = options.platform && options.images ? await copyPlatformSponsors(target, plan) : null;
  return { ownerId, events, defaultRules, platformSponsors };
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
      if (!e.differences) out.push(`    ${e.reason}`);
      else if (e.differences.length)
        for (const d of e.differences)
          out.push(`    AFTER WRITING, DIFFERENCE ${d.kind} at ${d.where}: old ${d.old}, new ${d.new}`);
      else out.push('    read back: matches the old page');
      if (e.images) {
        out.push(`    images: ${e.images.copied} copied`);
        for (const l of e.images.left) out.push(`    image left out: ${l.what}, because ${l.reason}`);
      }
    } else out.push(`  ${e.outcome.toUpperCase()}  ${label}: ${e.reason}`);
  }
  if (result.defaultRules !== null)
    out.push(`  Default rules template: ${result.defaultRules ? 'filled in from the old database' : 'left as it is'}`);
  if (result.platformSponsors) {
    const p = result.platformSponsors;
    out.push(
      `  Platform sponsors: ${p.set ? `${p.copied} copied from the old database` : 'left as they are (iTala Connect has its own, or there were none to copy)'}`,
    );
    for (const l of p.left) out.push(`    image left out: ${l.what}, because ${l.reason}`);
  }
  const count = (o: AppliedEvent['outcome']) => result.events.filter((e) => e.outcome === o).length;
  out.push(`${count('written')} written, ${count('skipped')} skipped, ${count('failed')} failed.`);
  return out.join('\n');
}
