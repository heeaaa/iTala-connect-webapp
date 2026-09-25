import 'server-only';

import { parseEnv, serverEnvSchema, type ServerEnv } from './env.schema';

/**
 * Server environment. Importing this file from a client component fails the
 * build because of `server-only`. Values are validated on first use.
 */
let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseEnv(serverEnvSchema, process.env);
  return cached;
}

/** True when the iTala mobile integration is configured (MI-01). */
export function mobileIntegrationEnabled(): boolean {
  const env = serverEnv();
  return Boolean(env.MOBILE_SUPABASE_URL && env.MOBILE_SUPABASE_PUBLISHABLE_KEY);
}

/** The secret key is only for admin operations; fail loudly if absent. */
export function requireSecretKey(): string {
  const key = serverEnv().SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY is missing; this operation needs it.');
  return key;
}
