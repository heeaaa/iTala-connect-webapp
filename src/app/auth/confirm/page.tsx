import type { Metadata } from 'next';

import { BrandName, platformStyles as st, TitlePlate } from '@/components/platform/platform-frame';

import { PlatformChrome } from '../../platform-chrome';
import { ConfirmForm } from './confirm-form';

// The address carries a one-time token: never send it on to another site, never index it.
export const metadata: Metadata = {
  title: 'Set up your account',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

/**
 * Landing page for a set-up link (PRD A-09). Opening it does nothing; the
 * token is used only when the person presses Continue (ConfirmForm).
 */
export default async function ConfirmPage({ searchParams }: PageProps<'/auth/confirm'>) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : '';
  const type = params.type === 'invite' || params.type === 'recovery' ? params.type : null;

  return (
    <PlatformChrome current="login">
      <main className={st.wrap}>
        <TitlePlate
          title={type === 'recovery' ? 'Choose a new password' : 'Set up your account'}
          sub={
            <>
              <BrandName /> Connect organisers
            </>
          }
        />
        <div className="flex flex-col gap-4 pb-12">
          {tokenHash && type ? (
            <ConfirmForm tokenHash={tokenHash} type={type} />
          ) : (
            <p role="alert" className={st.notice}>
              This link is incomplete. Ask a superadmin for a new set-up link.
            </p>
          )}
        </div>
      </main>
    </PlatformChrome>
  );
}
