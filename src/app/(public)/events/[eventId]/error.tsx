'use client';

import { PlatformError } from '@/components/platform/platform-error';

import { platformFontClassName } from '../../../platform-fonts';

/** N-04: the event could not be loaded (network or database error). */
export default function EventError({ reset }: { error: Error; reset: () => void }) {
  return (
    <PlatformError
      title="Could not load this event"
      message="Check your connection, then try again."
      onRetry={reset}
      fontClassName={platformFontClassName}
    />
  );
}
