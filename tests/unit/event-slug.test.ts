import { describe, expect, it } from 'vitest';
import {
  defaultEventSlug,
  eventAddress,
  eventPath,
  isEventId,
  normaliseSlug,
  slugProblem,
  slugWords,
  slugYear,
  typedSlug,
  validSlug,
} from '@/lib/event-slug';

/*
 * Event web addresses (PRD P-14). The database makes the same default for events
 * created without one (the Firebase import): these expectations are what
 * public.event_slug_words and public.default_event_slug returned for the same
 * names on Postgres 17, and supabase/tests/017_event_slugs.sql checks a set of them there.
 */

const dash = String.fromCharCode(0x2014);
const acute = String.fromCharCode(0x301);
const SQL_CASES: [name: string, words: string, slug2026: string][] = [
  ['BATANG PINOY BASKETBALL', 'batang-pinoy-basketball', 'batang-pinoy-basketball-2026'],
  ['Niño’s Cup', 'nino-s-cup', 'nino-s-cup-2026'],
  ['Crème Brûlée Classic', 'creme-brulee-classic', 'creme-brulee-classic-2026'],
  ['Ōtautahi 3x3', 'otautahi-3x3', 'otautahi-3x3-2026'],
  ['Summer League 2026', 'summer-league-2026', 'summer-league-2026'],
  ['2026', '2026', '2026'],
  ['', '', 'event-2026'],
  ['   ', '', 'event-2026'],
  ['!!!', '', 'event-2026'],
  ['Ⅻ Ｆｕｌｌ Ｗｉｄｔｈ ½ Court', 'xii-full-width-1-2-court', 'xii-full-width-1-2-court-2026'],
  ['Straße Ball', 'stra-e-ball', 'stra-e-ball-2026'],
  ['Ærø Open', 'r-open', 'r-open-2026'],
  ['İstanbul Invitational', 'istanbul-invitational', 'istanbul-invitational-2026'],
  ['Kelvin K Cup', 'kelvin-k-cup', 'kelvin-k-cup-2026'],
  [`Tēnā koe ${dash} Whānau Day`, 'tena-koe-whanau-day', 'tena-koe-whanau-day-2026'],
  [`${'a'.repeat(59)} b c`, `${'a'.repeat(59)}-b-c`, `${'a'.repeat(59)}-2026`],
  ['x'.repeat(70), 'x'.repeat(70), `${'x'.repeat(60)}-2026`],
  ['Under-12s / Under-14s', 'under-12s-under-14s', 'under-12s-under-14s-2026'],
  ['ﬁnal ﬂing', 'final-fling', 'final-fling-2026'],
  [`Café${acute} Déjà`, 'cafe-deja', 'cafe-deja-2026'],
  ['Кубок Москвы', '', 'event-2026'],
  ['中文 League', 'league', 'league-2026'],
  ['Hawks   vs---Owls', 'hawks-vs-owls', 'hawks-vs-owls-2026'],
  ['TM™ Games', 'tmtm-games', 'tmtm-games-2026'],
  ['mix-2026-', 'mix-2026', 'mix-2026'],
];

describe('default addresses, the same as the database makes', () => {
  it.each(SQL_CASES)('%j', (name, words, slug) => {
    expect(slugWords(name)).toBe(words);
    expect(defaultEventSlug(name, 2026)).toBe(slug);
    expect(validSlug(slug)).toBe(true);
  });

  it('adds the year only when the name does not already end with it', () => {
    expect(defaultEventSlug('Summer League 2025', 2026)).toBe('summer-league-2025-2026');
    expect(defaultEventSlug('Summer League 20260', 2026)).toBe('summer-league-20260-2026');
  });
});

describe('the year of a default address', () => {
  it('is the first event day, whatever order the days are in', () => {
    expect(slugYear(['2027-01-02', '2026-12-30'], new Date('2020-06-01T00:00:00Z'), 'Pacific/Auckland')).toBe(2026);
  });

  it('is the current year in the event’s time zone when there are no days', () => {
    // 31/12/2025 12:30 UTC is already 01/01/2026 in Auckland, still 2025 in Vancouver.
    const now = new Date('2025-12-31T12:30:00Z');
    expect(slugYear([], now, 'Pacific/Auckland')).toBe(2026);
    expect(slugYear([], now, 'America/Vancouver')).toBe(2025);
  });
});

describe('what the organiser types', () => {
  it('turns capitals, spaces and accents into an address as they type, keeping a trailing hyphen', () => {
    expect(typedSlug('Batang Pinoy ')).toBe('batang-pinoy-');
    expect(typedSlug('batang-')).toBe('batang-');
    expect(typedSlug('  -Ōtautahi  Cup')).toBe('otautahi-cup');
    expect(typedSlug('x'.repeat(90))).toHaveLength(80);
  });

  it('is stored without the trailing hyphen', () => {
    expect(normaliseSlug('batang-pinoy-')).toBe('batang-pinoy');
    expect(normaliseSlug('Summer League 2026!')).toBe('summer-league-2026');
    expect(normaliseSlug(`${'y'.repeat(79)}-z`)).toBe('y'.repeat(79));
  });
});

describe('which addresses can be used', () => {
  it('accepts lower-case words joined by single hyphens, up to 80 characters', () => {
    expect(['a', 'summer-2026', 'a-b-c', 'x'.repeat(80)].every(validSlug)).toBe(true);
  });

  it('refuses anything else, and anything shaped like an event id', () => {
    expect(
      ['', 'A', 'a--b', '-a', 'a-', 'a_b', 'x'.repeat(81), '0d1f2e3c-4b5a-4968-8776-a5b4c3d2e1f0'].some(validSlug),
    ).toBe(false);
  });

  it('says why', () => {
    expect(slugProblem('summer-2026')).toBeNull();
    expect(slugProblem('')).toBe('Enter a web address, such as summer-league-2026.');
    expect(slugProblem('0d1f2e3c-4b5a-4968-8776-a5b4c3d2e1f0')).toBe(
      'Choose an address that does not look like an event id.',
    );
    expect(slugProblem('Not Normalised')).toBe(
      'Use lower-case letters, numbers and single hyphens, up to 80 characters.',
    );
  });

  it('tells event ids apart, in either case', () => {
    expect(isEventId('0D1F2E3C-4B5A-4968-8776-A5B4C3D2E1F0')).toBe(true);
    expect(isEventId('summer-2026')).toBe(false);
  });
});

describe('showing an address', () => {
  it('is the path under /events', () => {
    expect(eventPath('summer-2026')).toBe('/events/summer-2026');
  });

  it('shows the host and path without the scheme', () => {
    expect(eventAddress('https://itala-connect.netlify.app', 'summer-2026')).toBe(
      'itala-connect.netlify.app/events/summer-2026',
    );
    expect(eventAddress('not a url', 'summer-2026')).toBe('not a url/events/summer-2026');
  });
});
