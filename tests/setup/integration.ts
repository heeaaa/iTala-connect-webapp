import { existsSync } from 'node:fs';

// Integration tests run against the LOCAL Supabase stack only.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  throw new Error(
    'Integration tests need the local Supabase stack. Run `npm run db:start` and `npm run env:local`. ' +
      'Refusing to run against a non-local URL.',
  );
}
for (const name of ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
  if (!process.env[name]) throw new Error(`${name} is missing for integration tests.`);
}
