import type { Metadata } from 'next';

import { requireSuperadmin } from '@/server/auth';

export const metadata: Metadata = { title: 'Settings' };

// Superadmin only. Platform sponsors and the default rules template
// (PRD S-01, S-02) are built in phase 5.
export default async function SettingsPage() {
  await requireSuperadmin();
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Platform settings</h1>
      <p className="text-brand-muted">Sponsors and the default rules template arrive in a later phase.</p>
    </section>
  );
}
