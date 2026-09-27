/**
 * Loads the verbatim old app code for the import's computed-output diff:
 * scores as the live build applies them (scripts/golden/legacy/live-extract.js),
 * and the standings and playoff code, the same in both builds
 * (app-extract.js, loaded the way the golden generator loads it).
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { LegacyCode } from '../src/migration/verify';

export function loadLegacyCode(root = process.cwd()): LegacyCode {
  const require = createRequire(join(root, 'package.json'));
  // app-extract's resolveAllPlayoffs calls the global Scheduler, as in the browser.
  (globalThis as { Scheduler?: unknown }).Scheduler = require('./scripts/golden/legacy/scheduler.js');
  const app = require('./scripts/golden/legacy/app-extract.js') as Omit<LegacyCode, 'applyScoresToSchedule'>;
  const live = require('./scripts/golden/legacy/live-extract.js') as Pick<LegacyCode, 'applyScoresToSchedule'>;
  return {
    applyScoresToSchedule: live.applyScoresToSchedule,
    resolveAllPlayoffs: app.resolveAllPlayoffs,
    publicStandings: app.publicStandings,
  };
}
