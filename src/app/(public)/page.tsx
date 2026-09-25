import { loadHomeEvents } from '@/server/public/load-event';

import { PlatformChrome } from '../platform-chrome';
import { HomeView } from './home-view';
import { LegacyHashRedirect } from './legacy-hash-redirect';

/*
 * Home (PRD H-01 to H-05), Broadcast Package: the season as a rundown of
 * event bugs, spectators first, then a short plate for organisers.
 */
export default async function HomePage() {
  const events = await loadHomeEvents();
  return (
    <PlatformChrome current="events">
      <LegacyHashRedirect />
      <HomeView events={events} />
    </PlatformChrome>
  );
}
