import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/database.types';

/** Test helpers for the LOCAL stack (tests/setup/integration.ts and e2e setup enforce that). */

export type Role = 'superadmin' | 'admin' | null;

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(url(), process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(url(), publishable(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createUser(role: Role, opts: { disabled?: boolean; name?: string; tag?: string } = {}) {
  const admin = adminClient();
  const email = `${opts.tag ?? 'test'}-${randomUUID().slice(0, 8)}@itala.test`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: opts.name ?? email },
  });
  if (error) throw error;
  const id = data.user.id;
  const { error: pErr } = await admin
    .from('profiles')
    .update({ role, disabled_at: opts.disabled ? new Date().toISOString() : null })
    .eq('id', id);
  if (pErr) throw pErr;
  return { id, email, password } satisfies TestUser;
}

export async function signedInClient(user: TestUser): Promise<SupabaseClient<Database>> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

export async function deleteUsers(users: TestUser[]) {
  const admin = adminClient();
  // Events reference owners with ON DELETE RESTRICT; remove them first.
  const ids = users.map((u) => u.id);
  if (ids.length) await admin.from('events').delete().in('owner_id', ids);
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
}
