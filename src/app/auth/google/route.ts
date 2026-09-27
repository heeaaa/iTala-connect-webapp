import { NextResponse, type NextRequest } from 'next/server';

import { serverEnv } from '@/env';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/server/access';
import { googleSignInEnabled } from '@/server/auth-providers';

/**
 * Starts Google sign-in (PRD A-11). A plain GET link rather than a form, so
 * the CSP form-action rule never meets the redirect to Google. The PKCE
 * verifier is kept in a cookie by the Supabase server client.
 */
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));
  const site = serverEnv().NEXT_PUBLIC_SITE_URL;
  const back = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}&next=${encodeURIComponent(next)}`, site));
  if (!(await googleSignInEnabled())) return back('google');
  const supabase = await createClient();
  const callback = new URL('/auth/callback', site);
  callback.searchParams.set('next', next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
  });
  if (error || !data.url) return back('google');
  return NextResponse.redirect(data.url);
}
