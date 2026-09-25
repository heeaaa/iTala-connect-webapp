import { NextResponse, type NextRequest } from 'next/server';

import { clientEnv } from '@/env.client';
import { buildCsp, createNonce } from '@/lib/security/csp';
import { updateSession } from '@/lib/supabase/proxy';

/**
 * Runs before every page request:
 *  1. a fresh CSP nonce (X-03),
 *  2. Supabase session refresh with verified claims,
 *  3. a first gate on /admin (the admin layout checks the role again, and
 *     every Server Action checks again, so this is not the only guard).
 */
export async function proxy(request: NextRequest) {
  const env = clientEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const nonce = createNonce();
  const csp = buildCsp({ nonce, isDev: process.env.NODE_ENV === 'development', supabaseUrl });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const { response, userId } = await updateSession(request, requestHeaders, {
    url: supabaseUrl,
    publishableKey,
  });

  const path = request.nextUrl.pathname;
  let result: NextResponse = response;

  if (path.startsWith('/admin') && !userId) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    login.searchParams.set('next', path);
    result = NextResponse.redirect(login);
    // Keep any cookies the refresh wrote (for example a cleared session) and
    // the no-cache headers Supabase adds alongside them.
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    for (const name of ['cache-control', 'expires', 'pragma']) {
      const value = response.headers.get(name);
      if (value) result.headers.set(name, value);
    }
  }

  result.headers.set('Content-Security-Policy', csp);
  return result;
}

export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
