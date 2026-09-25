import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from './database.types';

export interface SessionResult {
  response: NextResponse;
  /** Verified JWT claims, or null when signed out or the token is invalid. */
  userId: string | null;
}

/**
 * Refreshes the Supabase session cookie on every matched request and
 * verifies the token with getClaims(). Returns the response built by the
 * last setAll call, so refreshed cookies are never lost.
 */
export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers,
  config: { url: string; publishableKey: string },
): Promise<SessionResult> {
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Cache-Control headers from Supabase stop CDNs caching a response
        // that carries someone's session cookie.
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Nothing may run between creating the client and getClaims().
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;

  return { response, userId: typeof sub === 'string' ? sub : null };
}
