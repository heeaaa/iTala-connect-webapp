import { clientEnvSchema, parseEnv, type ClientEnv } from './env.schema';

/**
 * Public environment. Only NEXT_PUBLIC_* values, referenced one by one so
 * Next.js can inline them into the browser bundle. All are publishable by
 * design; Row Level Security is the real boundary.
 */
let cached: ClientEnv | undefined;

export function clientEnv(): ClientEnv {
  cached ??= parseEnv(clientEnvSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  return cached;
}
