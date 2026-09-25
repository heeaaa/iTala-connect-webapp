import type { Metadata } from 'next';

import { formatDate } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/server/auth';

export const metadata: Metadata = { title: 'Events' };

// Phase 1 shell: a read-only list proving roles and RLS end to end. The full
// dashboard (PRD D-01 to D-05) is built in phase 3b on the approved design.
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

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">My events</h1>
      {error ? (
        <p role="alert" className="text-brand-danger">
          Could not load events. Please refresh the page.
        </p>
      ) : !events || events.length === 0 ? (
        <p className="text-brand-muted">No events yet. Create your first tournament or league.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-brand-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-surface">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Name
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  First date
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const first = [...event.schedule_days].sort()[0];
                return (
                  <tr key={event.id} className="border-t border-brand-border">
                    <td className="px-3 py-2">{event.name || 'Untitled event'}</td>
                    <td className="px-3 py-2">{event.status === 'published' ? 'Published' : 'Draft'}</td>
                    <td className="px-3 py-2">{first ? formatDate(first) : 'No dates'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
