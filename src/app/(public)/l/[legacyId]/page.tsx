import { notFound, redirect } from 'next/navigation';

import { eventPath } from '@/lib/event-slug';
import { findEventByLegacyId } from '@/server/public/load-event';

/**
 * Old shared link lookup by Firebase id: to the event's web address, or a real
 * 404. Not a permanent redirect, since the address can change (P-14).
 */
export default async function LegacyEventLink({ params }: PageProps<'/l/[legacyId]'>) {
  const { legacyId } = await params;
  const slug = await findEventByLegacyId(legacyId);
  if (!slug) notFound();
  redirect(eventPath(slug));
}
