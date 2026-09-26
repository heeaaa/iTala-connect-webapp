import { z } from 'zod';

/**
 * Environment schemas, shared by src/env.ts (server) and src/env.client.ts.
 * Pure: no process access, so it can be unit tested.
 *
 * Error messages name the variable and the rule, never the value (X-02).
 */

const PLACEHOLDER = /(YOUR_|change-me|changeme|placeholder|<[^>]*>|xxxxx)/i;

const notPlaceholder = (s: string) => !PLACEHOLDER.test(s);

const httpUrl = z
  .string()
  .trim()
  .refine(notPlaceholder, 'still holds a placeholder value')
  .pipe(z.url({ protocol: /^https?$/, error: 'must be an http:// or https:// URL' }));

const key = z
  .string()
  .trim()
  .min(20, 'is too short to be a real key')
  .refine(notPlaceholder, 'still holds a placeholder value');

const optionalBlank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional());

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-NZ', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key.refine(
    (s) => !s.startsWith('sb_secret_'),
    'must be the publishable key, not the secret key',
  ),
  NEXT_PUBLIC_SITE_URL: httpUrl,
});

export const serverEnvSchema = clientEnvSchema
  .extend({
    SUPABASE_SECRET_KEY: optionalBlank(key),
    SUPABASE_STORAGE_BUCKET: optionalBlank(z.string().trim().min(1)).transform((v) => v ?? 'images'),
    MOBILE_SUPABASE_URL: optionalBlank(httpUrl),
    MOBILE_SUPABASE_PUBLISHABLE_KEY: optionalBlank(key),
    DEFAULT_EVENT_TIMEZONE: optionalBlank(
      z.string().trim().refine(isValidTimeZone, 'is not a valid IANA time zone'),
    ).transform((v) => v ?? 'Pacific/Auckland'),
    // Design prototypes with sample data (/prototype/*). Off unless "1";
    // never set in production.
    ENABLE_PROTOTYPES: optionalBlank(z.enum(['0', '1'], { error: 'must be 0 or 1' })).transform((v) => v === '1'),
  })
  .superRefine((env, ctx) => {
    if (env.MOBILE_SUPABASE_PUBLISHABLE_KEY && !env.MOBILE_SUPABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['MOBILE_SUPABASE_URL'],
        message: 'is required when MOBILE_SUPABASE_PUBLISHABLE_KEY is set',
      });
    }
    if (env.MOBILE_SUPABASE_URL && !env.MOBILE_SUPABASE_PUBLISHABLE_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['MOBILE_SUPABASE_PUBLISHABLE_KEY'],
        message: 'is required when MOBILE_SUPABASE_URL is set',
      });
    }
  });

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

function describe(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const name = issue.path.join('.') || '(root)';
    const message = issue.code === 'invalid_type' && issue.input === undefined ? 'is missing' : issue.message;
    return `${name} ${message}`;
  });
}

export function parseEnv<T extends z.ZodType>(schema: T, source: Record<string, string | undefined>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) throw new EnvError(describe(result.error));
  return result.data;
}
