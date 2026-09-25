import type { Metadata } from 'next';

import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';
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
    <section aria-labelledby="admins-title">
      <TitlePlate id="admins-title" title="Admins" sub="Accounts and roles" />
      <p className={s.lede}>
        Inviting admins, changing roles and disabling accounts arrive with the rest of the admin tools. Until then a
        superadmin uses the admin:create script.
      </p>
      {error ? (
        <p role="alert" className={s.error}>
          Could not load accounts. Please refresh the page.
        </p>
      ) : (
        <div className={s.tableScroll} tabIndex={0} role="region" aria-label="Accounts">
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{p.display_name}</td>
                  <td>{p.role === 'superadmin' ? 'Superadmin' : p.role === 'admin' ? 'Admin' : 'No access'}</td>
                  <td>
                    <span className={s.statusBug} data-status={p.disabled_at ? 'disabled' : 'published'}>
                      {p.disabled_at ? 'Disabled' : 'Active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
