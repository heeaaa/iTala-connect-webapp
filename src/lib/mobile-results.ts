import { z } from 'zod';
import { toMs, type MatchState, type MobileFinal } from '@/domain/mobile-matching';

/**
 * The results inbox (PRD M-04 to M-07): the mobile app's finished games, as
 * read from its final_game_scores view, and the wording the old inbox used.
 * Pure, so the page and the tests agree.
 */

// PostgREST can return a bigint or numeric column as a string; a score must be a number.
const count = z.preprocess(
  (v) => (typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : v),
  z.number().int().nullable(),
);
const when = z.union([z.number(), z.string()]).nullable();

/** A row of final_game_scores. Extra columns (winner_team_id, finished_at_ts) are ignored. */
export const mobileFinalSchema = z.object({
  game_id: z.string().min(1),
  league_id: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  league_name: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  home_team_id: z.string().nullable(),
  home_name: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  away_team_id: z.string().nullable(),
  away_name: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  home_pts: count,
  away_pts: count,
  event_count: count,
  is_default: z.boolean().optional(),
  finished_at: when,
  last_event_at: when,
});
export type InboxFinal = z.infer<typeof mobileFinalSchema> & MobileFinal;

/** The inbox groups, in the old order. */
export const GROUPS: readonly { state: MatchState; title: string }[] = [
  { state: 'proposed', title: 'Ready to approve' },
  { state: 'drifted', title: 'Changed since you approved them' },
  { state: 'ambiguous', title: 'More than one fixture matches' },
  { state: 'settling', title: 'Still settling: stats may still be arriving' },
  { state: 'review', title: 'Needs a look' },
  { state: 'unlinked', title: 'Team not linked' },
  { state: 'unmatched', title: 'No fixture matches' },
  { state: 'approved', title: 'Approved' },
];

/** A number as the card shows it; "?" for anything unreadable (the old num()). */
export const num = (v: unknown) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) ? String(n) : '?';
};

/** "Ballers 70 - 61 Hoopers BC": home first, as the mobile app records it (M-05). */
export const resultLine = (f: InboxFinal) =>
  `${f.home_name || f.home_team_id || '?'} ${num(f.home_pts)} - ${num(f.away_pts)} ${f.away_name || f.away_team_id || '?'}`;

/** When the game finished, in the event's time zone: "27/09/2026 8:05 pm". */
export function finishedWhen(value: number | string | null, timeZone: string): string {
  const ms = toMs(value);
  if (ms === null) return 'no finish time';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return 'no finish time';
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}

/** "{league} · finished {when} · {n} stats" (M-05). */
export const detailLine = (f: InboxFinal, timeZone: string) => {
  const stats = Number(f.event_count) || 0;
  return [
    f.league_name,
    `finished ${finishedWhen(f.finished_at, timeZone)}`,
    f.is_default ? 'default result' : `${stats} stat${stats === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');
};

/** "Published 70-61, the mobile app now says 72-61 (64 to 66 stats)" (M-05). */
export const driftLine = (
  published: { s1: number | null; s2: number | null; eventCount: number | null },
  f: InboxFinal,
) =>
  `Published ${num(published.s1)}-${num(published.s2)}, the mobile app now says ${num(f.home_pts)}-${num(f.away_pts)} (${num(published.eventCount ?? 0)} to ${num(f.event_count ?? 0)} stats)`;
