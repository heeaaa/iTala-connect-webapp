import { sanitizeRulesHtml } from '@/lib/rules-html';

import { entries, isRecord, text, values } from './firebase-tree';
import { imageSource, mapEvent, type ImageSource, type Issue, type MapOptions, type MappedEvent } from './map-event';

/**
 * The whole Firebase export planned as an import (MIGRATION_PLAN.md 12.1):
 * every event, plus the platform settings. Pure; nothing is written.
 */

export interface PlatformPlan {
  sponsors: { tier: 'primary' | 'secondary'; source: ImageSource; sort_order: number }[];
  /** Null when the old database never had one (it was only ever set by hand). */
  default_rules_html: string | null;
}

export interface PlannedEvent extends MappedEvent {
  legacyId: string;
  raw: unknown;
}

export interface ImportPlan {
  events: PlannedEvent[];
  platform: PlatformPlan;
  issues: Issue[];
}

const KNOWN_TOP = new Set(['events', 'platform']);

export function planImport(tree: unknown, options: MapOptions & { only?: readonly string[] }): ImportPlan {
  const issues: Issue[] = [];
  if (!isRecord(tree)) {
    issues.push({
      level: 'error',
      code: 'export.not_object',
      message: 'The file is not a Firebase export (no top-level object).',
    });
    return { events: [], platform: { sponsors: [], default_rules_html: null }, issues };
  }
  for (const key of Object.keys(tree))
    if (!KNOWN_TOP.has(key))
      issues.push({
        level: 'info',
        code: 'export.unknown_node',
        message: `The top-level node "${key}" is not used by the old app; not imported.`,
      });
  if (!isRecord(tree.events))
    issues.push({ level: 'warning', code: 'export.no_events', message: 'The export has no events node.' });

  const wanted = options.only?.length ? new Set(options.only) : null;
  const events = entries(tree.events)
    .filter(([key]) => !wanted || wanted.has(key))
    .map(([legacyId, raw]) => ({ legacyId, raw, ...mapEvent(legacyId, raw, options) }));
  if (wanted)
    for (const id of wanted)
      if (!events.some((e) => e.legacyId === id))
        issues.push({ level: 'error', code: 'export.event_missing', message: `Event ${id} is not in the export.` });

  const platform = isRecord(tree.platform) ? tree.platform : {};
  const sponsorsNode = isRecord(platform.sponsors) ? platform.sponsors : {};
  const sponsors: PlatformPlan['sponsors'] = [];
  for (const tier of ['primary', 'secondary'] as const)
    values(sponsorsNode[tier]).forEach((v, i) => {
      const src = imageSource(v);
      if (src === 'unknown')
        issues.push({
          level: 'warning',
          code: 'image.unknown',
          message: `Platform ${tier} sponsor ${i + 1} is neither a web address nor an embedded image, so it is left out.`,
        });
      else if (src !== 'none')
        sponsors.push({ tier, source: src, sort_order: sponsors.filter((s) => s.tier === tier).length });
    });
  const rules = text(platform.defaultRulesHtml);
  return {
    events,
    platform: { sponsors, default_rules_html: rules.trim() ? sanitizeRulesHtml(rules) : null },
    issues,
  };
}
