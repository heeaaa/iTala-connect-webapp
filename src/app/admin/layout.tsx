import { platformStyles as s } from '@/components/platform/platform-frame';
import { requireAdmin } from '@/server/auth';

import { PlatformChrome } from '../platform-chrome';

// Role gate for the whole admin area (plan section 9). Every Server Action
// checks again; this is not the only guard.
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await requireAdmin();
  return (
    <PlatformChrome current="admin">
      <main className={`${s.wrap} pb-12`}>{children}</main>
    </PlatformChrome>
  );
}
