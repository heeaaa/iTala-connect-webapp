/**
 * npm run admin:create -- --email someone@example.com --name "Someone" --role superadmin
 *
 * Interim admin management until the Admins screen (PRD A-09) exists.
 * Creates the account (or updates the role of an existing one) using
 * SUPABASE_SECRET_KEY from .env.local. The password is read from the
 * ADMIN_PASSWORD environment variable or a hidden prompt, never taken as an
 * argument (arguments end up in shell history).
 */
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const argsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(1).max(120),
  role: z.enum(['superadmin', 'admin']),
});

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) {
    throw new Error('No terminal to prompt in. Set ADMIN_PASSWORD for this command instead.');
  }
  // Hidden prompt: characters are not echoed.
  process.stdout.write('Password (min 10 characters): ');
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          reject(new Error('Cancelled.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', default: 'admin' } },
  });
  const args = argsSchema.parse(values);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (see .env.example).');
  }
  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

  let userId: string | undefined;
  const password = await readPassword();
  const created = await admin.auth.admin.createUser({
    email: args.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: args.name },
  });

  if (created.error) {
    if (!/already been registered|already exists/i.test(created.error.message)) throw created.error;
    // Existing account: find it and update the role only.
    for (let page = 1; !userId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      userId = data.users.find((u) => u.email?.toLowerCase() === args.email)?.id;
      if (data.users.length < 200) break;
    }
    if (!userId) throw new Error('Account exists but could not be found.');
    console.log('Account already exists; updating its role only (password unchanged).');
  } else {
    userId = created.data.user.id;
  }

  const { data: updated, error } = await admin
    .from('profiles')
    .update({ role: args.role, display_name: args.name, disabled_at: null })
    .eq('id', userId)
    .select('id');
  if (error) throw error;
  if (!updated || updated.length !== 1) {
    throw new Error('The account exists but has no profile row, so no role was set. Check the migrations ran.');
  }

  console.log(`${args.email} is now ${args.role === 'superadmin' ? 'a superadmin' : 'an admin'}.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
