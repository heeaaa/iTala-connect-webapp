import Link from 'next/link';

import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';

import { PlatformChrome } from '../../../platform-chrome';

/** N-04: unknown, malformed or unpublished event id. Sent with a real 404 status. */
export default function EventNotFound() {
  return (
    <PlatformChrome current="events">
      <main className={`${s.wrap} pb-12`}>
        <TitlePlate title="Event not found" sub="Not on the schedule" />
        <p className={s.lede}>
          This event does not exist, or it has not been published yet. Check the link with whoever shared it.
        </p>
        <p>
          <Link href="/" className={`${s.button} ${s.buttonLive}`}>
            See published events
          </Link>
        </p>
      </main>
    </PlatformChrome>
  );
}
