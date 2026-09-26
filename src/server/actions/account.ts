'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin } from '@/server/auth';
import { NO_ACCESS_MESSAGES, resolveAccess, type ProfileRow } from '../access';
import { LINK_FAILED, passwordProblem } from './account-messages';

export interface LinkState {
  error?: string;
}

const linkSchema = z.object({
  // Auth's token hash is a SHA-224 in hex; anything else is refused before Auth is asked.
  token_hash: z.string().regex(/^[0-9a-f]{56}$/),
  type: z.enum(['invite', 'recovery']),
});

/**
 * Use a set-up link (PRD A-09). Runs only when the person presses Continue,
 * never on opening the link, so email and chat link scanners cannot use up
 * the one-time token. The same access rules as sign-in then apply.
 */
export async function confirmSetupLink(_prev: LinkState, form: FormData): Promise<LinkState> {
  const parsed = linkSchema.safeParse({ token_hash: form.get('token_hash'), type: form.get('type') });
  if (!parsed.success) return { error: LINK_FAILED };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: parsed.data.token_hash, type: parsed.data.type });
  if (error || !data.user) return { error: LINK_FAILED };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, role, disabled_at')
    .eq('id', data.user.id)
    .maybeSingle<ProfileRow>();
  const access = resolveAccess(data.user.id, profile ?? null);
  if (access.kind !== 'admin') {
    await supabase.auth.signOut();
    return { error: access.kind === 'no-access' ? NO_ACCESS_MESSAGES[access.reason] : LINK_FAILED };
  }
  redirect('/admin/password?welcome=1');
}

export interface PasswordState {
  error?: string;
  done?: boolean;
}

const passwordSchema = z
  .object({
    password: z.string().min(10, 'Use at least 10 characters.').max(200, 'Keep the password under 200 characters.'),
    confirm: z.string().max(200),
  })
  .refine((v) => v.password === v.confirm, { message: 'The two passwords do not match.' });

/** Choose or change the signed-in admin's own password (after a set-up link, or any time). */
export async function changePassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return { error: auth.error };
  const parsed = passwordSchema.safeParse({ password: form.get('password'), confirm: form.get('confirm') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? passwordProblem(undefined) };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: passwordProblem(error.code) };
  return { done: true };
}
