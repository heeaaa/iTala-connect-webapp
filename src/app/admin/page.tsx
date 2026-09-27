import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/server/auth';
import { mobileIntegrationEnabled } from '@/env';

import { DashboardView } from './dashboard-view';
import { CleanupNotice } from './_components/cleanup-notice';

export const metadata: Metadata = { title: 'Events' };

// Event management and the first mobile import slice (PRD D-01 to D-05).
export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from('events')
    .select('id, name, status, schedule_days, divisions(count)')
    .order('created_at', { ascending: false });
  // RLS also lets admins read other people's published events; the
  // dashboard shows only their own (D-01). Superadmins see everything.
  if (admin.role !== 'superadmin') query = query.eq('owner_id', admin.id);

  const [{ data: events, error }, { count: cleanupCount }] = await Promise.all([
    query,
    supabase.from('event_image_cleanup').select('event_id', { count: 'exact', head: true }),
  ]);

  return (
    <>
      {Boolean(cleanupCount) && <CleanupNotice count={cleanupCount!} />}
      <DashboardView
        events={events}
        error={Boolean(error)}
        superadmin={admin.role === 'superadmin'}
        mobileEnabled={mobileIntegrationEnabled()}
      />
    </>
  );
}
