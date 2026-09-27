import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { canEditEvent, requireAdmin } from '@/server/auth';
import { mobileConfigured } from '@/server/mobile/reader';
import { loadInbox } from '@/server/mobile/results';

import { ResultsView } from './results-view';

export const metadata: Metadata = { title: 'Pending results' };

// The results inbox (PRD M-04 to M-09): owner or superadmin, and only when the mobile integration is on (M-01).
export default async function ResultsPage({ params, searchParams }: PageProps<'/admin/events/[eventId]/results'>) {
  const { eventId } = await params;
  const linked = (await searchParams).linked === '1';
  await requireAdmin(`/admin/events/${eventId}/results`);
  if (!mobileConfigured || !z.uuid().safeParse(eventId).success || !(await canEditEvent(eventId))) notFound();
  const inbox = await loadInbox(eventId);
  if (!inbox) notFound();
  return <ResultsView inbox={inbox} linked={linked} />;
}
