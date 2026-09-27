import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { canEditEvent, requireAdmin } from '@/server/auth';
import { mobileConfigured } from '@/server/mobile/reader';
import { loadRosterComparison } from '@/server/mobile/rosters';

import { RostersView } from './rosters-view';

export const metadata: Metadata = { title: 'Compare rosters' };

// Compare rosters (PRD M-11), read only: owner or superadmin, and only when the mobile integration is on (M-01).
export default async function MobileRostersPage({
  params,
}: PageProps<'/admin/events/[eventId]/divisions/[divisionId]/mobile-rosters'>) {
  const { eventId, divisionId } = await params;
  await requireAdmin(`/admin/events/${eventId}/divisions/${divisionId}/mobile-rosters`);
  const ids = z.object({ eventId: z.uuid(), divisionId: z.uuid() });
  if (!mobileConfigured || !ids.safeParse({ eventId, divisionId }).success || !(await canEditEvent(eventId)))
    notFound();
  const comparison = await loadRosterComparison(eventId, divisionId);
  if (!comparison) notFound();
  return <RostersView comparison={comparison} />;
}
