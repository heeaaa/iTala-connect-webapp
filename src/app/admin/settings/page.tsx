import type { Metadata } from 'next';

import { requireSuperadmin } from '@/server/auth';

import { SettingsView } from './settings-view';

export const metadata: Metadata = { title: 'Settings' };

// Superadmin only. Platform sponsors and the default rules template
// (PRD S-01, S-02) are built in phase 5.
export default async function SettingsPage() {
  await requireSuperadmin();
  return <SettingsView />;
}
