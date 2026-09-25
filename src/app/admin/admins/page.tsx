import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';
import { requireSuperadmin } from '@/server/auth';

export const metadata: Metadata = { title: 'Admins' };

// Superadmin only. Read-only list for now; invite, change role and disable
// (PRD A-09, O-2) are built in phase 5. Until then use
// `npm run admin:create` (see README).
export default async function AdminsPage() {
  await requireSuperadmin();
  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name, role, disabled_at')
    .order('display_name');

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Admins</h1>
      {error ? (
        <p role="alert" className="text-brand-danger">
          Could not load accounts. Please refresh the page.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-brand-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-surface">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Name
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Role
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id} className="border-t border-brand-border">
                  <td className="px-3 py-2">{p.display_name}</td>
                  <td className="px-3 py-2">
                    {p.role === 'superadmin' ? 'Superadmin' : p.role === 'admin' ? 'Admin' : 'No access'}
                  </td>
                  <td className="px-3 py-2">{p.disabled_at ? 'Disabled' : 'Active'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
