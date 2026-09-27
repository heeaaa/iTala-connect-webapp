import 'server-only';
import { serverEnv } from '@/env';
import { createMobileReader } from './transport';

const env = serverEnv();
export const mobileConfigured = Boolean(env.MOBILE_SUPABASE_URL && env.MOBILE_SUPABASE_PUBLISHABLE_KEY);
const reader = mobileConfigured
  ? createMobileReader(env.MOBILE_SUPABASE_URL!.replace(/\/$/, ''), env.MOBILE_SUPABASE_PUBLISHABLE_KEY!)
  : null;
export function mobileReader() {
  if (!reader) throw new Error('Mobile integration is not configured');
  return reader;
}
