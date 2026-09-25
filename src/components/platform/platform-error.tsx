'use client';

import Link from 'next/link';

import { PlatformFrame, platformStyles as s, TitlePlate } from './platform-frame';

/**
 * Error state for platform routes (N-04). Client side, so the bar shows the
 * public view; the retry is the one primary action.
 */
export function PlatformError({
  title,
  message,
  onRetry,
  fontClassName,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  fontClassName: string;
}) {
  return (
    <PlatformFrame current="events" viewer={null} fontClassName={fontClassName}>
      <main className={`${s.wrap} pb-12`}>
        <TitlePlate title={title} sub="Signal lost" />
        <p className={s.lede}>{message}</p>
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={onRetry} className={`${s.button} ${s.buttonLive}`}>
            Try again
          </button>
          <Link href="/" className={`${s.button} ${s.buttonQuiet}`}>
            See published events
          </Link>
        </div>
      </main>
    </PlatformFrame>
  );
}
