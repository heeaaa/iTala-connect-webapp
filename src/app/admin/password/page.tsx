import type { Metadata } from 'next';

import { TitlePlate } from '@/components/platform/platform-frame';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/server/auth';

import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Password' };

// Where a set-up link lands (PRD A-09), and where any admin changes their own password.
export default async function PasswordPage({ searchParams }: PageProps<'/admin/password'>) {
  const admin = await requireAdmin('/admin/password');
  const welcome = (await searchParams).welcome === '1';
  const { data } = await (await createClient()).auth.getClaims();
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : '';

  return (
    <section aria-labelledby="password-title">
      <TitlePlate
        id="password-title"
        title={welcome ? 'Choose your password' : 'Change your password'}
        sub={welcome ? `Welcome, ${admin.display_name}` : admin.display_name}
      />
      <PasswordForm email={email} welcome={welcome} />
    </section>
  );
}
