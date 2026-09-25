import { existsSync, rmSync } from 'node:fs';

import { deleteUsers } from '../support/supabase';
import { FIXTURE_FILE, fixtures } from './fixtures';

export default async function globalTeardown() {
  if (!existsSync(FIXTURE_FILE)) return;
  await deleteUsers(Object.values(fixtures().users));
  rmSync(FIXTURE_FILE, { force: true });
}
