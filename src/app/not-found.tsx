import Link from 'next/link';

import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';

import { PlatformChrome } from './platform-chrome';

/** Any unknown URL, including old event links that no longer match (N-04). Real 404 status. */
export default function NotFound() {
  return (
    <PlatformChrome current="events">
      <main className={`${s.wrap} pb-12`}>
        <TitlePlate title="Page not found" sub="Off the schedule" />
        <p className={s.lede}>This link does not go anywhere. It may be old, or it may have been typed wrong.</p>
        <p>
          <Link href="/" className={`${s.button} ${s.buttonLive}`}>
            See published events
          </Link>
        </p>
      </main>
    </PlatformChrome>
  );
}
