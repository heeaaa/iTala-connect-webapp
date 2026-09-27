import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';
import { requireSuperadmin } from '@/server/auth';
import { googleSignInEnabled } from '@/server/auth-providers';

import { AdminsView, type AdminAccount } from './admins-view';

export const metadata: Metadata = { title: 'Admins' };

// Superadmin only (PRD A-09): accounts, roles, set-up links, disabling.
export default async function AdminsPage() {
  const admin = await requireSuperadmin();
  const supabase = await createClient();
  const [{ data, error }, google] = await Promise.all([supabase.rpc('list_admin_accounts'), googleSignInEnabled()]);
  return (
    <AdminsView accounts={(data ?? []) as AdminAccount[]} error={Boolean(error)} selfId={admin.id} google={google} />
  );
}
