'use client';

import { createBrowserClient } from '@supabase/ssr';

import { clientEnv } from '@/env.client';
import type { Database } from './database.types';

/** Browser client: publishable key only, RLS applies to everything. */
export function createClient() {
  const env = clientEnv();
  return createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
