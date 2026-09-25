import { type ReactNode } from 'react';

import { PlatformFrame, platformStyles, type PlatformSection, type Viewer } from '@/components/platform/platform-frame';
import { signOut } from '@/server/actions/auth';
import { getAccess } from '@/server/auth';

import { platformFontClassName } from './platform-fonts';

/** The signed-in admin for the network bar, or null (verified with getClaims via getAccess). */
export async function getViewer(): Promise<Viewer | null> {
  const access = await getAccess();
  return access.kind === 'admin' ? { name: access.profile.display_name, role: access.profile.role } : null;
}

/** Platform frame with the viewer resolved on the server. */
export async function PlatformChrome({ current, children }: { current: PlatformSection; children: ReactNode }) {
  const viewer = await getViewer();
  return (
    <PlatformFrame
      current={current}
      viewer={viewer}
      fontClassName={platformFontClassName}
      signOut={
        <form action={signOut}>
          <button type="submit" className={`${platformStyles.button} ${platformStyles.buttonQuiet}`}>
            Sign out
          </button>
        </form>
      }
    >
      {children}
    </PlatformFrame>
  );
}
