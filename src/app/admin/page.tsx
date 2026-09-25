import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/server/auth';

import { DashboardView } from './dashboard-view';

export const metadata: Metadata = { title: 'Events' };

// Phase 1 shell: a read-only list proving roles and RLS end to end. The full
// dashboard (PRD D-01 to D-05) is built in phase 5.
export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from('events')
    .select('id, name, status, schedule_days')
    .order('created_at', { ascending: false });
  // RLS also lets admins read other people's published events; the
  // dashboard shows only their own (D-01). Superadmins see everything.
  if (admin.role !== 'superadmin') query = query.eq('owner_id', admin.id);

  const { data: events, error } = await query;

  return <DashboardView events={events} error={Boolean(error)} superadmin={admin.role === 'superadmin'} />;
}
