import { mkdirSync, writeFileSync } from 'node:fs';

import { adminClient, createUser } from '../support/supabase';
import { FIXTURE_FILE, type E2EFixtures } from './fixtures';
import { seedPublicEvent } from './seed-public-event';

/** Seeds isolated users and events for this run on the LOCAL stack. */
export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error('E2E tests run against the local Supabase stack only (npm run db:start, npm run env:local).');
  }

  const [superadmin, adminA, adminB, noRole] = await Promise.all([
    createUser('superadmin', { tag: 'e2e-super', name: 'Sam Superadmin' }),
    createUser('admin', { tag: 'e2e-a', name: 'Aroha Admin' }),
    createUser('admin', { tag: 'e2e-b', name: 'Ben Admin' }),
    createUser(null, { tag: 'e2e-norole', name: 'Nora Norole' }),
  ]);

  const stamp = Date.now();
  const { data, error } = await adminClient()
    .from('events')
    .insert([
      { owner_id: adminA.id, name: `A Spring Hoops ${stamp}`, status: 'draft', schedule_days: ['2026-10-03'] },
      { owner_id: adminB.id, name: `B Winter League ${stamp}`, status: 'published', schedule_days: ['2026-11-07'] },
    ])
    .select('id, name');
  if (error) throw error;

  const fixtures: E2EFixtures = {
    users: { superadmin, adminA, adminB, noRole },
    events: {
      aDraft: data.find((e) => e.name.startsWith('A '))!.name,
      bPublished: data.find((e) => e.name.startsWith('B '))!.name,
      aDraftId: data.find((e) => e.name.startsWith('A '))!.id,
    },
    publicEvent: await seedPublicEvent(adminClient(), adminA.id, stamp),
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixtures));
}
