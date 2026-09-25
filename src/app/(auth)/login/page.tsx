import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { NO_ACCESS_MESSAGES, safeNextPath } from '@/server/access';
import { BrandName, platformStyles as st, TitlePlate } from '@/components/platform/platform-frame';
import { getAccess } from '@/server/auth';

import { PlatformChrome } from '../../platform-chrome';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const NOTICE_KEYS = ['no-profile', 'no-role', 'disabled'] as const;

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : undefined);

  // A-07: a signed-in admin goes straight to the dashboard.
  const access = await getAccess();
  if (access.kind === 'admin') redirect(next);

  const errorKey = NOTICE_KEYS.find((k) => k === params.error);
  const notice = errorKey ? NO_ACCESS_MESSAGES[errorKey] : undefined;

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
        </div>
      </main>
    </PlatformChrome>
  );
}
