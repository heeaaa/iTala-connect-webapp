import { type Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DEFAULT_EVENT_THEME } from '@/components/event/theme';
import { parseEventTab } from '@/components/event/tabs';
import { toMinutes } from '@/domain/game-day';
import { serverEnv } from '@/env';
import { clockInZone } from '@/lib/event-time';
import { sanitizeRulesHtml } from '@/lib/rules-html';
import { LIGHT_ORGANISER_THEME, SAMPLE_GAME_DAY, SAMPLE_RULES_HTML, sampleLeague } from '@/prototype/league-night';

import { eventFontClassName } from '../../event-fonts';
import { PrototypeToday } from './prototype-today';

export const metadata: Metadata = {
  title: 'Today screen prototype',
  robots: { index: false, follow: false },
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * SIMULATED: the Today screen (public event page, Schedule tab) with sample
 * data and a controllable clock. Returns 404 unless ENABLE_PROTOTYPES=1.
 * The real route is /events/[eventId] in phase 4.
 */
export default async function TodayPrototypePage({ searchParams }: PageProps<'/prototype/today'>) {
  if (!serverEnv().ENABLE_PROTOTYPES) notFound();
  const sp = await searchParams;
  const one = (key: string) => (typeof sp[key] === 'string' ? (sp[key] as string) : undefined);

  const at = one('at');
  const liveClock = at === 'live';
  const courts = one('courts') === '4' ? 4 : 2;
  const theme = one('theme') === 'light' ? LIGHT_ORGANISER_THEME : DEFAULT_EVENT_THEME;
  const clock = liveClock
    ? clockInZone(new Date(), 'America/Vancouver')
    : { date: SAMPLE_GAME_DAY, minutes: toMinutes(at && HHMM.test(at) ? at : '19:25') };

  return (
    <PrototypeToday
      // A new clock or court count starts the sample scores afresh.
      key={`${clock.date}-${clock.minutes}-${courts}`}
      event={sampleLeague({ courts, clock, theme })}
      clock={clock}
      liveClock={liveClock}
      selectedDay={one('day') ?? null}
      tab={parseEventTab(one('tab'))}
      feed={one('feed') === 'reconnecting' ? 'reconnecting' : 'live'}
      owner={one('owner') === '1'}
      fontClassName={eventFontClassName}
      rulesHtml={sanitizeRulesHtml(SAMPLE_RULES_HTML)}
    />
  );
}
