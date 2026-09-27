import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import exportJson from '../fixtures/firebase-export.json';
import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../support/supabase';
import { loadLegacyCode } from '../../scripts/firebase-legacy';
import { supabaseTarget } from '../../scripts/firebase-target';
import { applyImport, importPayload } from '@/migration/apply';
import { planImport } from '@/migration/import-plan';
import { legacyKeyedRows } from '@/migration/read-back';
import { importReport } from '@/migration/report';
import { compareRows, verifyEvent, type Difference } from '@/migration/verify';
import type { Json } from '@/lib/supabase/database.types';

/*
 * Phase 7b (MIGRATION_PLAN.md 12.1): the Firebase import written to the LOCAL
 * database with the secret key, read back, and compared with the old page
 * again; run twice to prove it is idempotent. Synthetic export only.
 */

const A = '-P1JcLF-aaaaaaaaaaaa';
const B = '-P0Zslb-bbbbbbbbbbbb';
const C = '-P1WYkLVcccccccccccc';
const opts = { timezone: 'Pacific/Auckland' };
const legacy = loadLegacyCode();
const target = () => supabaseTarget(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const planned = (only: string[]) => {
  const plan = planImport(exportJson, { ...opts, only });
  const diffs = new Map<string, Difference[]>();
  for (const e of plan.events) if (e.plan) diffs.set(e.legacyId, verifyEvent(e.raw, e.plan, legacy));
  return { plan, report: importReport(plan, diffs) };
};
const eventIdOf = async (legacyId: string) =>
  (await adminClient().from('events').select('id').eq('legacy_firebase_id', legacyId).single()).data!.id;

let owner: TestUser;
let admin: TestUser;
beforeAll(async () => {
  [owner, admin] = await Promise.all([
    createUser('superadmin', { tag: 'legacy' }),
    createUser('admin', { tag: 'legacy' }),
  ]);
});
afterAll(async () => {
  await adminClient().from('events').delete().in('legacy_firebase_id', [A, B, C]);
  await deleteUsers([owner, admin].filter(Boolean));
});

describe('Firebase import writer', () => {
  it('writes a clean event, and the stored rows match the old page exactly', async () => {
    const { plan } = planned([A]);
    const e = plan.events[0]!;
    const result = await target().importEvent(owner.id, importPayload(e.plan!), false);
    expect(result).toMatchObject({
      created: true,
      divisions: 1,
      teams: 3,
      players: 3,
      games: 6,
      scores: 6,
      approvals: 1,
      mobile_links: 1,
    });
    const keyed = legacyKeyedRows(await target().readBack(result.event_id), A);
    expect(compareRows(e.raw, keyed.rows, keyed.oldIndex, legacy)).toEqual([]);
    // Published in the old app, so the public can see it.
    const { data } = await anonClient().from('events').select('name').eq('id', result.event_id);
    expect(data).toEqual([{ name: 'Harbour Spring Cup' }]);
  });

  it('imports the same export again without changing an id or adding a row', async () => {
    const db = adminClient();
    const eventId = await eventIdOf(A);
    const before = (await db.from('games').select('id, legacy_gid').eq('event_id', eventId).order('position')).data;
    const { plan } = planned([A]);
    const result = await target().importEvent(owner.id, importPayload(plan.events[0]!.plan!), false);
    expect(result).toMatchObject({ event_id: eventId, created: false, games: 6 });
    expect((await db.from('games').select('id, legacy_gid').eq('event_id', eventId).order('position')).data).toEqual(
      before,
    );
    const audit = (await db.from('audit_log').select('action').eq('event_id', eventId)).data!.map((r) => r.action);
    expect(audit).toEqual(['event.legacy_import', 'event.legacy_import']);
  });

  it('writes what is ready, skips errors and unaccepted differences, and reads each written event back', async () => {
    const { plan, report } = planned([]);
    const result = await applyImport(plan, report, target(), legacy, {
      ownerEmail: owner.email,
      acceptDifferences: [],
      overwrite: [],
      platform: false,
      images: false,
    });
    expect(result.events.map((e) => [e.legacyId, e.outcome, e.differences ?? e.reason])).toEqual([
      [B, 'skipped', `has differences (check them, then use --accept-differences=${B})`],
      [A, 'written', []],
      [C, 'skipped', 'has errors'],
      ['broken', 'skipped', 'not an event'],
    ]);
    expect(result.defaultRules).toBeNull();

    // Accepted after a look: the stored rows show exactly the differences planned.
    const accepted = planned([B]);
    const written = await applyImport(accepted.plan, accepted.report, target(), legacy, {
      ownerEmail: owner.email,
      acceptDifferences: [B],
      overwrite: [],
      platform: false,
      images: false,
    });
    expect(written.events[0]).toMatchObject({ outcome: 'written', result: { created: true, games: 5 } });
    expect(written.events[0]!.differences).toEqual(accepted.report.events[0]!.differences);
  });

  it('fills the default rules template only when iTala Connect has none', async () => {
    const db = adminClient();
    const was = (await db.from('platform_settings').select('default_rules_html').single()).data!.default_rules_html;
    try {
      await db.from('platform_settings').update({ default_rules_html: '' }).eq('id', true);
      const { plan, report } = planned([A]);
      const options = { ownerEmail: owner.email, acceptDifferences: [], overwrite: [], platform: true, images: false };
      expect((await applyImport(plan, report, target(), legacy, options)).defaultRules).toBe(true);
      expect((await applyImport(plan, report, target(), legacy, options)).defaultRules).toBe(false);
      expect((await db.from('platform_settings').select('default_rules_html').single()).data!.default_rules_html).toBe(
        '<p>Be kind</p>',
      );
    } finally {
      await db.from('platform_settings').update({ default_rules_html: was }).eq('id', true);
    }
  });

  it('copies the old images into the bucket, sets their rows, and reuses the same file next time', async () => {
    const db = adminClient();
    const { plan, report } = planned([A]);
    const options = { ownerEmail: owner.email, acceptDifferences: [], overwrite: [], platform: false, images: true };
    const first = await applyImport(plan, report, target(), legacy, options);
    // The embedded minor sponsor is copied; the old addresses are not in the old image store, so they are not fetched.
    expect(first.events[0]!.images!.copied).toBe(1);
    expect(first.events[0]!.images!.left.map((l) => l.what)).toEqual([
      'the logo',
      'the major sponsor',
      'minor sponsor 2',
    ]);
    const eventId = await eventIdOf(A);
    const rows = (await db.from('event_sponsors').select('tier, image_path, sort_order').eq('event_id', eventId)).data!;
    expect(rows).toEqual([
      {
        tier: 'minor',
        image_path: expect.stringMatching(new RegExp(`^events/${eventId}/minor-legacy-[0-9a-f]{20}\\.jpg$`)),
        sort_order: 0,
      },
    ]);
    const bucket = db.storage.from(process.env.SUPABASE_STORAGE_BUCKET || 'images');
    const file = await bucket.download(rows[0]!.image_path);
    expect(file.error).toBeNull();
    expect(new Uint8Array(await file.data!.arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));

    await applyImport(plan, report, target(), legacy, options);
    expect((await db.from('event_sponsors').select('image_path').eq('event_id', eventId)).data).toEqual([
      { image_path: rows[0]!.image_path },
    ]);
    expect((await bucket.download(rows[0]!.image_path)).error).toBeNull();
    // Skipping images later leaves them as they were.
    await applyImport(plan, report, target(), legacy, { ...options, images: false });
    expect((await db.from('event_sponsors').select('image_path').eq('event_id', eventId)).data).toHaveLength(1);
    await bucket.remove([rows[0]!.image_path]);
  });

  it('refuses an owner who is not an active admin, and anyone but the secret key', async () => {
    const { plan, report } = planned([A]);
    await expect(
      applyImport(plan, report, target(), legacy, {
        ownerEmail: 'nobody@itala.test',
        acceptDifferences: [],
        overwrite: [],
        platform: false,
        images: false,
      }),
    ).rejects.toThrow('No active admin account has the email nobody@itala.test.');
    const signedIn = await signedInClient(owner);
    const { error } = await signedIn.rpc('import_legacy_event', {
      p_owner: owner.id,
      p_event: importPayload(plan.events[0]!.plan!) as unknown as Json,
    });
    expect(error?.code).toBe('42501');
  });

  it('refuses to undo a score entered in Connect since the import, unless that event is named to overwrite', async () => {
    const db = adminClient();
    const eventId = await eventIdOf(A);
    const game = (await db.from('games').select('id').eq('event_id', eventId).eq('legacy_gid', 'g_a3').single()).data!;
    const scoreOf = async () => (await db.from('game_scores').select('s1, s2').eq('game_id', game.id).single()).data;
    const signedIn = await signedInClient(owner);
    expect((await signedIn.rpc('set_score', { p_game_id: game.id, p_s1: 99, p_s2: 1 })).error).toBeNull();

    const { plan, report } = planned([A]);
    const options = { ownerEmail: owner.email, acceptDifferences: [], overwrite: [], platform: false, images: false };
    const refused = await applyImport(plan, report, target(), legacy, options);
    expect(refused.events[0]).toMatchObject({
      outcome: 'failed',
      reason: 'This event was changed in iTala Connect since its last import (it has a change recorded as score.set)',
    });
    expect(await scoreOf()).toEqual({ s1: 99, s2: 1 });

    const forced = await applyImport(plan, report, target(), legacy, { ...options, overwrite: [A] });
    expect(forced.events[0]!.outcome).toBe('written');
    expect(await scoreOf()).toEqual({ s1: 60, s2: 55 });
  });

  it('runs end to end from the command line: report first, then the write, its read-back and its images', () => {
    const r = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/migrate-firebase.ts',
        '--file',
        'tests/fixtures/firebase-export.json',
        `--event=${A}`,
        '--apply',
        '--owner',
        admin.email,
        '--to',
        new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host,
      ],
      { encoding: 'utf8', timeout: 60_000, env: process.env },
    );
    expect(r.stdout).toContain('READY  Harbour Spring Cup');
    expect(r.stdout).toContain('UPDATED  Harbour Spring Cup');
    expect(r.stdout).toContain('read back: matches the old page');
    expect(r.stdout).toContain('images: 1 copied');
    expect(r.stdout).not.toContain(process.env.SUPABASE_SECRET_KEY!);
    expect(r.status).toBe(0);
  }, 60_000);
});
