import { z } from 'zod';
import { clockInZone } from './event-time';

/**
 * Event web addresses (PRD P-14): /events/{slug} beside /events/{id}. The
 * rules match the database's (supabase/migrations/20260927000800_event_slugs.sql),
 * which makes the default for events created without one; the tests hold both
 * to the same names.
 */

export const SLUG_MAX = 80;
/** The name part of a default address, so the year and a "-2" still fit. */
const NAME_MAX = 60;
/** Combining diacritical marks (U+0300 to U+036F): the accents NFKD splits off letters. */
const ACCENTS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
const FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const plain = (text: string) => text.normalize('NFKD').replace(ACCENTS, '').toLowerCase();

/** Lower-case letters and numbers joined by single hyphens: "Niño's Cup!" is "nino-s-cup". */
export function slugWords(text: string): string {
  return plain(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The default address: the name (up to 60 characters) and the year, unless the name already ends with it. */
export function defaultEventSlug(name: string, year: number): string {
  const base = slugWords(name).slice(0, NAME_MAX).replace(/-+$/, '');
  if (!base) return `event-${year}`;
  return base === String(year) || base.endsWith(`-${year}`) ? base : `${base}-${year}`;
}

/** The year a default address uses: the event's first day, or now in its time zone. */
export function slugYear(days: readonly string[], now: Date, timeZone: string): number {
  const first = [...days].sort()[0];
  return Number((first ?? clockInZone(now, timeZone).date).slice(0, 4));
}

/** As the organiser types: spaces and capitals become an address, and a trailing hyphen waits for the next word. */
export function typedSlug(text: string): string {
  return plain(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX);
}

/** What is stored for what was typed (or pasted). */
export function normaliseSlug(text: string): string {
  return slugWords(text).slice(0, SLUG_MAX).replace(/-+$/, '');
}

export const isEventId = (ref: string) => EVENT_ID.test(ref);

export const validSlug = (slug: string) => slug.length <= SLUG_MAX && FORMAT.test(slug) && !isEventId(slug);

/** Why a normalised address cannot be used, or null when it can. */
export function slugProblem(slug: string): string | null {
  if (!slug) return 'Enter a web address, such as summer-league-2026.';
  if (isEventId(slug)) return 'Choose an address that does not look like an event id.';
  if (!validSlug(slug)) return 'Use lower-case letters, numbers and single hyphens, up to 80 characters.';
  return null;
}

/** An address from a form: normalised, then refused with the reason when it cannot be used. */
export const eventSlugSchema = z
  .string()
  .max(200)
  .transform(normaliseSlug)
  .superRefine((slug, ctx) => {
    const problem = slugProblem(slug);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

export const eventPath = (slug: string) => `/events/${slug}`;

/** The address as people read it: host and path, without "https://". */
export function eventAddress(siteUrl: string, slug: string): string {
  let host = siteUrl;
  try {
    host = new URL(siteUrl).host;
  } catch {
    /* A bad site URL still shows the path. */
  }
  return `${host}${eventPath(slug)}`;
}
