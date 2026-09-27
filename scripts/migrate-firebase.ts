/**
 * npm run migrate:firebase -- --file <export.json> [--event=<id>]... [--timezone Pacific/Auckland] [--report <out.json>]
 * npm run migrate:firebase -- --file <export.json> --apply --owner <email> [--env <file>] [--accept-differences]
 *
 * Imports the old Firebase database into iTala Connect (MIGRATION_PLAN.md
 * 12.1) from a JSON export made in the Firebase console. The old database is
 * never contacted. Keep the export (production data) outside the repository.
 *
 * Without --apply it is a dry run: it prints the verification report and
 * writes nothing. With --apply it prints the same report, then writes each
 * ready event through import_legacy_event with SUPABASE_SECRET_KEY (from the
 * environment, or --env <file>), owned by the --owner admin, reads each one
 * back and compares it with the old page again. Events with errors are never
 * written; events with differences only with --accept-differences.
 *
 * Firebase event ids start with "-", so give them as --event=<id>.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { applyImport, formatApplied } from '../src/migration/apply';
import { planImport } from '../src/migration/import-plan';
import { canonicalTimeZone } from '../src/migration/map-event';
import { formatReport, importReport } from '../src/migration/report';
import { verifyEvent, type Difference } from '../src/migration/verify';
import { loadLegacyCode } from './firebase-legacy';
import { supabaseTarget } from './firebase-target';

/** True when the path is inside the working directory (the repository). */
function inRepo(path: string) {
  const rel = relative(process.cwd(), resolve(path));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

const OPTIONS = {
  file: { type: 'string' },
  event: { type: 'string', multiple: true },
  timezone: { type: 'string', default: 'Pacific/Auckland' },
  report: { type: 'string' },
  'dry-run': { type: 'boolean', default: false },
  apply: { type: 'boolean', default: false },
  owner: { type: 'string' },
  env: { type: 'string' },
  'accept-differences': { type: 'boolean', default: false },
} as const;

function stop(message: string): never {
  console.error(message);
  process.exit(2);
}

async function main() {
  let values: ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>['values'];
  try {
    ({ values } = parseArgs({ options: OPTIONS }));
  } catch (error) {
    stop(`${(error as Error).message}\nEvent ids start with "-": give them as --event=<id>.`);
  }
  if (!values.file) stop('Give the Firebase JSON export with --file <path>.');
  if (values.apply && values['dry-run']) stop('Choose --apply or --dry-run, not both.');
  if (values.apply && !values.owner) stop('Give the admin who will own the imported events with --owner <email>.');
  const timezone = canonicalTimeZone(values.timezone);
  if (!timezone) stop(`"${values.timezone}" is not a time zone.`);
  for (const path of [values.file, values.report].filter(Boolean) as string[])
    if (inRepo(path)) console.warn(`Note: ${path} is inside the repository. Keep production data outside it.`);

  const tree: unknown = JSON.parse(readFileSync(values.file, 'utf8'));
  const plan = planImport(tree, { timezone, only: values.event });
  const legacy = loadLegacyCode();
  const differences = new Map<string, Difference[]>();
  for (const e of plan.events) if (e.plan) differences.set(e.legacyId, verifyEvent(e.raw, e.plan, legacy));
  const report = importReport(plan, differences);

  console.log(formatReport(report, { applying: values.apply }));
  if (values.report) {
    writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nReport written to ${values.report}`);
  }
  if (!values.apply) process.exit(report.totals.errors || report.totals.differences ? 1 : 0);

  if (values.env) process.loadEnvFile(values.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) stop('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed to write (use --env <file>).');
  // The address only, never the key.
  console.log(`\nWriting to ${new URL(url).host} as the migration import, owner ${values.owner}.`);
  const result = await applyImport(plan, report, supabaseTarget(url, key), legacy, {
    ownerEmail: values.owner!,
    acceptDifferences: values['accept-differences'],
    // The default rules template is platform-wide: only on a whole import.
    platform: !values.event?.length,
  });
  console.log(formatApplied(result));
  const planned = new Map(report.events.map((e) => [e.legacyId, JSON.stringify(e.differences)]));
  const unexpected = result.events.some(
    (e) =>
      e.outcome === 'failed' || (e.outcome === 'written' && JSON.stringify(e.differences) !== planned.get(e.legacyId)),
  );
  process.exit(unexpected ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
