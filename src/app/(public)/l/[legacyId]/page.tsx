import { notFound, permanentRedirect } from 'next/navigation';

import { findEventByLegacyId } from '@/server/public/load-event';

/** Old shared link lookup by Firebase id: permanent redirect, or a real 404. */
export default async function LegacyEventLink({ params }: PageProps<'/l/[legacyId]'>) {
  const { legacyId } = await params;
  const eventId = await findEventByLegacyId(legacyId);
  if (!eventId) notFound();
  permanentRedirect(`/events/${eventId}`);
}
