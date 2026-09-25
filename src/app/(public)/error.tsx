'use client';

import { PlatformError } from '@/components/platform/platform-error';

import { platformFontClassName } from '../platform-fonts';

/** N-04: Home could not load the events list (network or database error). */
export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <PlatformError
      title="Could not load events"
      message="Check your connection, then try again."
      onRetry={reset}
      fontClassName={platformFontClassName}
    />
  );
}
