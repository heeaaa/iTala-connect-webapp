import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { NO_ACCESS_MESSAGES, safeNextPath } from '@/server/access';
import { getAccess } from '@/server/auth';
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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Sign in to iTala Connect</h1>
      {notice ? (
        <p role="alert" className="rounded-md border border-brand-border bg-brand-surface p-3 text-sm">
          {notice}
        </p>
      ) : null}
      <LoginForm next={next} />
    </main>
  );
}
