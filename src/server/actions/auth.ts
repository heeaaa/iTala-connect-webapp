'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { NO_ACCESS_MESSAGES, resolveAccess, safeNextPath, SIGN_IN_FAILED, type ProfileRow } from '../access';

export interface SignInState {
  error?: string;
  email?: string;
}

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  });
  const email = typeof formData.get('email') === 'string' ? String(formData.get('email')) : '';
  if (!parsed.success) return { error: SIGN_IN_FAILED, email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: SIGN_IN_FAILED, email };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, role, disabled_at')
    .eq('id', data.user.id)
    .maybeSingle<ProfileRow>();

  const access = resolveAccess(data.user.id, profile ?? null);
  if (access.kind !== 'admin') {
    await supabase.auth.signOut();
    return {
      error: access.kind === 'no-access' ? NO_ACCESS_MESSAGES[access.reason] : SIGN_IN_FAILED,
      email,
    };
  }

  redirect(safeNextPath(parsed.data.next));
}

/** A-08: logout returns to the home page. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
