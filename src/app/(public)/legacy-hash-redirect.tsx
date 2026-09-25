'use client';

import { useEffect } from 'react';

/** Old app links: https://connect.itala.fyi/#/event/{firebaseId} (PRD section 3). */
export const LEGACY_EVENT_HASH = /^#\/event\/([A-Za-z0-9_-]{1,64})(?:[/?].*)?$/;

export function legacyTarget(hash: string): string | null {
  const m = LEGACY_EVENT_HASH.exec(hash);
  return m ? `/l/${m[1]}` : null;
}

/**
 * The hash never reaches the server, so the browser reads it and hands the
 * id to /l/{id}, which looks it up and redirects to /events/{id}.
 */
export function LegacyHashRedirect() {
  useEffect(() => {
    const target = legacyTarget(window.location.hash);
    if (target) window.location.replace(target);
  }, []);
  return null;
}
