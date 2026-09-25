import { type Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PlatformFrame, platformStyles as s } from '@/components/platform/platform-frame';
import { serverEnv } from '@/env';
import { type HomeCard } from '@/lib/public-event/home';

import { DashboardView } from '../../admin/dashboard-view';
import { SettingsView } from '../../admin/settings/settings-view';
import { HomeView } from '../../(public)/home-view';
import { platformFontClassName } from '../../platform-fonts';

export const metadata: Metadata = { title: 'Platform prototype', robots: { index: false, follow: false } };

/* SAMPLE DATA only: invented events and a sample admin, to review the platform look without a database. */
const SAMPLE_EVENTS: HomeCard[] = [
  {
    id: 'sample-1',
    name: 'Eastside Friday League',
    logoUrl: null,
    divisionCount: 2,
    firstDay: '2026-09-11',
    lastDay: '2026-10-09',
    when: 'current',
  },
  {
    id: 'sample-2',
    name: 'Harbour Fall Classic',
    logoUrl: null,
    divisionCount: 4,
    firstDay: '2026-10-17',
    lastDay: '2026-10-18',
    when: 'upcoming',
  },
  {
    id: 'sample-3',
    name: 'Kits Youth Shootout',
    logoUrl: '/brand/itala-mark.png',
    divisionCount: 1,
    firstDay: '2026-11-07',
    lastDay: '2026-11-07',
    when: 'upcoming',
  },
  {
    id: 'sample-4',
    name: 'Summer Hoops Invitational',
    logoUrl: null,
    divisionCount: 3,
    firstDay: '2026-07-18',
    lastDay: '2026-07-19',
    when: 'past',
  },
  {
    id: 'sample-5',
    name: 'Co-ed Winter League',
    logoUrl: null,
    divisionCount: 2,
    firstDay: null,
    lastDay: null,
    when: 'undated',
  },
];

const SCREENS = ['home', 'dashboard', 'settings', 'empty'] as const;

/** Returns 404 unless ENABLE_PROTOTYPES=1. */
export default async function PlatformPrototype({ searchParams }: PageProps<'/prototype/platform'>) {
  if (!serverEnv().ENABLE_PROTOTYPES) notFound();
  const sp = await searchParams;
  const screen = SCREENS.find((x) => x === sp.screen) ?? 'home';
  const signedIn = screen === 'dashboard' || screen === 'settings';

  return (
    <>
      <p className="bg-brand-live px-4 py-2 text-sm font-semibold text-brand-accent-text">
        Prototype with sample data. Not real events.{' '}
        {SCREENS.map((x) => (
          <Link key={x} href={`?screen=${x}`} className="mr-3 underline underline-offset-4">
            {x}
          </Link>
        ))}
      </p>
      <PlatformFrame
        current={signedIn ? 'admin' : 'events'}
        viewer={signedIn ? { name: 'Sample Organiser', role: 'superadmin' } : null}
        fontClassName={platformFontClassName}
        signOut={
          <button type="button" className={`${s.button} ${s.buttonQuiet}`}>
            Sign out
          </button>
        }
      >
        {screen === 'home' ? <HomeView events={SAMPLE_EVENTS} /> : null}
        {screen === 'empty' ? <HomeView events={[]} /> : null}
        {screen === 'dashboard' ? (
          <main className={`${s.wrap} pb-12`}>
            <DashboardView
              superadmin
              error={false}
              events={[
                {
                  id: 'a',
                  name: 'Eastside Friday League',
                  status: 'published',
                  schedule_days: ['2026-09-11', '2026-10-09'],
                },
                { id: 'b', name: 'Harbour Fall Classic', status: 'draft', schedule_days: ['2026-10-17'] },
                { id: 'c', name: '', status: 'draft', schedule_days: [] },
              ]}
            />
          </main>
        ) : null}
        {screen === 'settings' ? (
          <main className={`${s.wrap} pb-12`}>
            <SettingsView />
          </main>
        ) : null}
      </PlatformFrame>
    </>
  );
}
