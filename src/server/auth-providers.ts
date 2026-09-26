import 'server-only';

import { serverEnv } from '@/env';

/**
 * Whether Google sign-in is switched on for this Supabase project (PRD A-11),
 * read from Auth's public settings so the dashboard stays the one switch.
 * Anything unexpected hides the button rather than offering a broken flow.
 */
export async function googleSignInEnabled(): Promise<boolean> {
  const env = serverEnv();
  try {
    const response = await fetch(new URL('/auth/v1/settings', env.NEXT_PUBLIC_SUPABASE_URL), {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 300 },
    });
    if (!response.ok) return false;
    const settings = (await response.json()) as { external?: { google?: unknown } };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}
