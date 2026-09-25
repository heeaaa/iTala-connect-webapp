import Link from 'next/link';

import { signOut } from '@/server/actions/auth';
import { requireAdmin } from '@/server/auth';

// Role gate for the whole admin area (plan section 9). Every Server Action
// checks again; this is not the only guard.
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const admin = await requireAdmin();
  const isSuper = admin.role === 'superadmin';

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-brand-border bg-brand-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="font-semibold">
            iTala Connect
          </Link>
          <nav aria-label="Admin" className="flex flex-wrap gap-4 text-sm">
            <Link href="/admin" className="underline-offset-4 hover:underline">
              Events
            </Link>
            {isSuper ? (
              <>
                <Link href="/admin/settings" className="underline-offset-4 hover:underline">
                  Settings
                </Link>
                <Link href="/admin/admins" className="underline-offset-4 hover:underline">
                  Admins
                </Link>
              </>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span data-testid="signed-in-as">
              {admin.display_name} <span className="text-brand-muted">({isSuper ? 'Superadmin' : 'Admin'})</span>
            </span>
            <form action={signOut}>
              <button type="submit" className="min-h-11 rounded-md border border-brand-border px-3">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
