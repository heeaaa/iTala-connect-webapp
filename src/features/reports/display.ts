import { clockInZone, minutesToTime } from '@/lib/event-time';
import { formatDate, formatTime } from '@/lib/format';

import type { ReportCell, ReportDocument, ReportTable } from './model';

/**
 * How a report reads on screen and in the PDF. Internal identifiers and the box score's line type
 * stay in the spreadsheet and CSV downloads, where they trace each row; people read names.
 */
const INTERNAL = new Set(['gameId', 'teamId', 'playerId', 'entry']);
export function displayColumns(table: ReportTable): ReportTable['columns'] {
  return table.columns.filter((column) => !INTERNAL.has(column.key));
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A cell as people read it: dates as DD/MM/YYYY (downloads keep the sortable YYYY-MM-DD), and a
 * box-score line from a report saved before 07/10/2026, which had no player name, by its line type
 * ("Connect score", "Score difference").
 */
export function displayValue(row: ReportTable['rows'][number], key: string): ReportCell {
  const value = row[key] ?? null;
  if (key === 'date' && typeof value === 'string' && ISO_DAY.test(value)) return formatDate(value);
  if (key === 'player' && !value && typeof row.entry === 'string') return row.entry;
  return value;
}

/** Older saved reports listed games outside the chosen dates; those were never a problem. */
const NOT_CHOSEN = new Set(['Outside selected dates', 'Outside relative selection']);
export function leftOut(report: ReportDocument): ReportDocument['exclusions'] {
  return report.exclusions.filter((item) => !NOT_CHOSEN.has(item.reason));
}

/** "07/10/2026 1:23 pm" in the event's time zone (UTC if the zone cannot be read). */
export function madeAt(report: ReportDocument): string {
  const instant = new Date(report.generatedAt);
  for (const zone of [report.timezone, 'UTC']) {
    try {
      const clock = clockInZone(instant, zone);
      return `${formatDate(clock.date)} ${formatTime(minutesToTime(clock.minutes))}${zone === 'UTC' ? ' UTC' : ''}`;
    } catch {
      continue;
    }
  }
  return report.generatedAt;
}
