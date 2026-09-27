import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { loginNoticeMessage, safeNextPath } from '@/server/access';
import { BrandName, platformStyles as st, TitlePlate } from '@/components/platform/platform-frame';
import { getAccess } from '@/server/auth';
import { googleSignInEnabled } from '@/server/auth-providers';

import { PlatformChrome } from '../../platform-chrome';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : undefined);

  // A-07: a signed-in admin goes straight to the dashboard.
  const access = await getAccess();
  if (access.kind === 'admin') redirect(next);

  const notice = loginNoticeMessage(params.error);
  const google = await googleSignInEnabled();

  return (
    <PlatformChrome current="login">
      <main className={st.wrap}>
        <TitlePlate
          title={
            <>
              Sign in to <BrandName /> Connect
            </>
          }
          sub="Organisers only. Fans never need an account."
        />
        <div className="flex flex-col gap-4 pb-12">
          {notice ? (
            <p role="alert" className={st.notice}>
              {notice}
            </p>
          ) : null}
          <LoginForm next={next} />
          {google ? (
            <div className={st.formPanel}>
              <p className="text-brand-muted">Or use the Google account you use in the iTala app.</p>
              {/* A plain link: a prefetching Link would start a Google sign-in on its own. */}
              <a href={`/auth/google?next=${encodeURIComponent(next)}`} className={`${st.button} ${st.buttonQuiet}`}>
                Continue with Google
              </a>
            </div>
          ) : null}
        </div>
      </main>
    </PlatformChrome>
  );
}
