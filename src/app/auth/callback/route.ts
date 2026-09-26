import { NextResponse, type NextRequest } from 'next/server';

import { serverEnv } from '@/env';
import { createClient } from '@/lib/supabase/server';
import { resolveAccess, safeNextPath, type ProfileRow } from '@/server/access';

/**
 * Finishes Google sign-in (PRD A-11). Sign-ups stay off, so Supabase only
 * lets in an account a superadmin created (the Google identity links to it
 * by verified email). The same role checks as password sign-in then apply,
 * and anyone without admin access is signed out again.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get('next'));
  const site = serverEnv().NEXT_PUBLIC_SITE_URL;
  const back = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}&next=${encodeURIComponent(next)}`, site));
  const code = params.get('code');
  // Provider or Auth errors (for example "Signups not allowed") arrive as query text: never shown as-is.
  if (!code || params.get('error')) return back('google');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return back('google');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, role, disabled_at')
    .eq('id', data.user.id)
    .maybeSingle<ProfileRow>();
  const access = resolveAccess(data.user.id, profile ?? null);
  if (access.kind !== 'admin') {
    await supabase.auth.signOut();
    return back(access.kind === 'no-access' ? access.reason : 'google');
  }
  return NextResponse.redirect(new URL(next, site));
}
