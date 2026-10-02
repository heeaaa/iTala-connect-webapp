import { NextResponse, type NextRequest } from 'next/server';

import { serverEnv } from '@/env';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/server/access';
import { authOrigin } from '@/server/auth-origin';
import { googleSignInEnabled } from '@/server/auth-providers';
import { OAUTH_NEXT_COOKIE } from '@/server/oauth-next';

/**
 * Starts Google sign-in (PRD A-11). A plain GET link rather than a form, so
 * the CSP form-action rule never meets the redirect to Google. The PKCE
 * verifier is kept in a cookie by the Supabase server client.
 */
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));
  const site = authOrigin(serverEnv().NEXT_PUBLIC_SITE_URL, request.nextUrl.origin);
  const back = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}&next=${encodeURIComponent(next)}`, site));
  if (!(await googleSignInEnabled())) return back('google');
  const supabase = await createClient();
  // Supabase checks the entire redirect URL, including its query string,
  // against the allow list. Keep this path exact and carry `next` in a cookie.
  const callback = new URL('/auth/callback', site);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
  });
  if (error || !data.url) return back('google');
  const response = NextResponse.redirect(data.url);
  response.cookies.set(OAUTH_NEXT_COOKIE, next, {
    httpOnly: true,
    sameSite: 'lax',
    secure: callback.protocol === 'https:',
    path: '/',
    maxAge: 600,
  });
  return response;
}
