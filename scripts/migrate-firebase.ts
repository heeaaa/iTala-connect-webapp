/**
 * npm run migrate:firebase -- --file <export.json> [--event=<id>]... [--timezone Pacific/Auckland] [--report <out.json>]
 * npm run migrate:firebase -- --file <export.json> --apply --owner <email> --env <file> --to <host>
 *     [--accept-differences=<id>]... [--overwrite=<id>]... [--skip-images] [--image-host <host>]...
 * Either form also takes --relink-division=<event id>:<old division key>=<new division key>, which
 * moves the games of a division deleted in the old app to one that exists (a person's choice,
 * shown in the report).
 *
 * Imports the old Firebase database into iTala Connect (MIGRATION_PLAN.md
 * 12.1) from a JSON export made in the Firebase console. The old database is
 * never contacted. Keep the export (production data) outside the repository.
 *
 * Without --apply it is a dry run: it prints the verification report and
 * writes nothing. With --apply it prints the same report, then writes each
 * ready event through import_legacy_event with the secret key, owned by the
 * --owner admin, reads each one back and compares it with the old page
 * again, then copies its images (unless --skip-images).
 *
 * Safety:
 * - --to must name the host of the project being written to, so a key for
 *   another project is never used by mistake. With --env, only that file's
 *   values are used (not ones already set in the shell).
 * - Events with errors are never written. An event with differences is
 *   written only when named with --accept-differences=<id> after checking.
 * - An event changed in iTala Connect since its last import, deleted there,
 *   or with far fewer games or scores in the export, is refused by the
 *   database unless named with --overwrite=<id>.
 * - Old images are fetched only from the old Supabase bucket (*.supabase.co),
 *   over https, without redirects; --image-host adds a host.
 *
 * Firebase event ids start with "-", so give them as --event=<id>.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';

import { applyImport, formatApplied } from '../src/migration/apply';
import { OLD_IMAGE_HOSTS } from '../src/migration/images';
import { planImport } from '../src/migration/import-plan';
import { canonicalTimeZone } from '../src/migration/map-event';
import { formatReport, importReport } from '../src/migration/report';
import { verifyAll } from '../src/migration/verify';
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
  to: { type: 'string' },
  'accept-differences': { type: 'string', multiple: true },
  overwrite: { type: 'string', multiple: true },
  'skip-images': { type: 'boolean', default: false },
  'image-host': { type: 'string', multiple: true },
  'relink-division': { type: 'string', multiple: true },
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
  if (values.apply && !values.to)
    stop('Give the host you mean to write to with --to <host> (for example abcd.supabase.co).');
  const timezone = canonicalTimeZone(values.timezone);
  if (!timezone) stop(`"${values.timezone}" is not a time zone.`);
  for (const path of [values.file, values.report].filter(Boolean) as string[])
    if (inRepo(path)) console.warn(`Note: ${path} is inside the repository. Keep production data outside it.`);

  const relink: Record<string, Record<string, string>> = {};
  for (const rule of values['relink-division'] ?? []) {
    const m = /^([^:]+):([^=]+)=(.+)$/.exec(rule);
    if (!m) stop(`"${rule}" is not <event id>:<old division key>=<new division key>.`);
    (relink[m[1]!] ??= {})[m[2]!] = m[3]!;
  }

  const tree: unknown = JSON.parse(readFileSync(values.file, 'utf8'));
  const plan = planImport(tree, { timezone, only: values.event, relink });
  const legacy = loadLegacyCode();
  const report = importReport(plan, verifyAll(plan, legacy));

  console.log(formatReport(report, { applying: values.apply }));
  if (values.report) {
    writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nReport written to ${values.report}`);
  }
  if (!values.apply) process.exit(report.totals.errors || report.totals.differences ? 1 : 0);

  // The keys: from --env only when given (never mixed with the shell's), else the environment.
  const env = values.env ? parseEnv(readFileSync(values.env, 'utf8')) : process.env;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) stop('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed to write (use --env <file>).');
  const host = new URL(url).host;
  if (host !== values.to) stop(`The keys are for ${host}, not ${values.to}. Nothing was written.`);
  if (env.SUPABASE_STORAGE_BUCKET) process.env.SUPABASE_STORAGE_BUCKET = env.SUPABASE_STORAGE_BUCKET;
  // The address only, never the key.
  console.log(`\nWriting to ${host} as the migration import, owner ${values.owner}.`);
  const result = await applyImport(plan, report, supabaseTarget(url, key), legacy, {
    ownerEmail: values.owner!,
    acceptDifferences: values['accept-differences'] ?? [],
    overwrite: values.overwrite ?? [],
    // The default rules template and platform sponsors are platform-wide: only on a whole import.
    platform: !values.event?.length,
    images: !values['skip-images'],
    imageHosts: [...OLD_IMAGE_HOSTS, ...(values['image-host'] ?? [])],
  });
  console.log(formatApplied(result));
  // Success only when every event was written and its stored rows match what was planned.
  const planned = new Map(report.events.map((e) => [e.legacyId, JSON.stringify(e.differences)]));
  const complete =
    !report.issues.some((i) => i.level === 'error') &&
    !result.platformError &&
    result.events.every((e) => e.outcome === 'written' && JSON.stringify(e.differences) === planned.get(e.legacyId));
  process.exit(complete ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
