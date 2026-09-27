/**
 * npm run migrate:firebase -- --file <export.json> [--event=<id>]... [--timezone Pacific/Auckland] [--report <out.json>]
 *
 * Firebase event ids start with "-", so give them as --event=<id>.
 *
 * Plans the import of the old Firebase database into iTala Connect
 * (MIGRATION_PLAN.md 12.1) from a JSON export made in the Firebase console,
 * and prints the verification report. This is a dry run: nothing is
 * written anywhere, and the old database is never contacted. Keep the
 * export (production data) outside the repository.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { planImport } from '../src/migration/import-plan';
import { formatReport, importReport } from '../src/migration/report';
import { verifyEvent, type Difference } from '../src/migration/verify';
import { loadLegacyCode } from './firebase-legacy';

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
  'dry-run': { type: 'boolean', default: true },
  apply: { type: 'boolean', default: false },
} as const;

function main() {
  let values: ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>['values'];
  try {
    ({ values } = parseArgs({ options: OPTIONS }));
  } catch (error) {
    console.error(`${(error as Error).message}\nEvent ids start with "-": give them as --event=<id>.`);
    process.exit(2);
  }
  if (values.apply) {
    console.error('Writing to the database is not built yet (Phase 7b). Nothing was written.');
    process.exit(2);
  }
  if (!values.file) {
    console.error('Give the Firebase JSON export with --file <path>.');
    process.exit(2);
  }
  try {
    new Intl.DateTimeFormat('en-NZ', { timeZone: values.timezone });
  } catch {
    console.error(`"${values.timezone}" is not a time zone.`);
    process.exit(2);
  }
  for (const path of [values.file, values.report].filter(Boolean) as string[])
    if (inRepo(path)) console.warn(`Note: ${path} is inside the repository. Keep production data outside it.`);

  const tree: unknown = JSON.parse(readFileSync(values.file, 'utf8'));
  const plan = planImport(tree, { timezone: values.timezone, only: values.event });
  const legacy = loadLegacyCode();
  const differences = new Map<string, Difference[]>();
  for (const e of plan.events) if (e.plan) differences.set(e.legacyId, verifyEvent(e.raw, e.plan, legacy));
  const report = importReport(plan, differences);

  console.log(formatReport(report));
  if (values.report) {
    writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nReport written to ${values.report}`);
  }
  process.exit(report.totals.errors || report.totals.differences ? 1 : 0);
}

main();
