import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { requireSecretKey, serverEnv } from '@/env';
import type { Database } from './database.types';

/**
 * Secret-key client. Bypasses RLS, so it is reserved for admin account
 * management (invite, disable, sign out everywhere) and storage cleanup.
 * Never use it for ordinary event reads or writes.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(serverEnv().NEXT_PUBLIC_SUPABASE_URL, requireSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
