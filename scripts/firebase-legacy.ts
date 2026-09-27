/**
 * Loads the verbatim old app code (scripts/golden/legacy) for the import's
 * computed-output diff, the same way the golden generator does.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { LegacyCode } from '../src/migration/verify';

export function loadLegacyCode(root = process.cwd()): LegacyCode {
  const require = createRequire(join(root, 'package.json'));
  // app-extract's resolveAllPlayoffs calls the global Scheduler, as in the browser.
  (globalThis as { Scheduler?: unknown }).Scheduler = require('./scripts/golden/legacy/scheduler.js');
  return require('./scripts/golden/legacy/app-extract.js') as LegacyCode;
}
