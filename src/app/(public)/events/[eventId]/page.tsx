import { type Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EventShell } from '@/components/event/event-shell';
import { EventMedia, RulesTab, TeamsTab } from '@/components/event/event-tabs-content';
import { LiveEvent } from '@/components/event/live-event';
import { parseEventTab } from '@/components/event/tabs';
import { formatDate } from '@/lib/format';
import { isEmptyRules } from '@/lib/rules-html';
import { loadPublicEvent } from '@/server/public/load-event';

import { eventFontClassName } from '../../../event-fonts';

type Props = PageProps<'/events/[eventId]'>;

function dateRange(days: string[]): string {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return '';
  return first === last ? formatDate(first) : `${formatDate(first)} to ${formatDate(last)}`;
}

/** Share previews (P-12): event name, dates and logo. Drafts are never indexed. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId } = await params;
  const data = await loadPublicEvent(eventId);
  if (!data) return { title: 'Event not found', robots: { index: false } };
  const { model } = data;
  const name = model.name || 'Untitled event';
  const when = dateRange(model.days);
  const description = `Schedule, live scores and standings${when ? `, ${when}` : ''}.`;
  return {
    title: name,
    description,
    robots: model.status === 'draft' ? { index: false, follow: false } : undefined,
    openGraph: {
      title: name,
      description,
      type: 'website',
      ...(model.logoUrl ? { images: [{ url: model.logoUrl, alt: `${name} logo` }] } : {}),
    },
    twitter: { card: 'summary', title: name, description },
  };
}

/** Public event page (PRD P-01 to P-13). Server rendered; scores go live in the client island. */
export default async function EventPage({ params, searchParams }: Props) {
  const [{ eventId }, sp] = await Promise.all([params, searchParams]);
  const data = await loadPublicEvent(eventId);
  if (!data) notFound();

  const { model, rulesHtml, canEdit, loadedAt } = data;
  const tab = parseEventTab(sp.tab);
  const day = typeof sp.day === 'string' ? sp.day : null;

  return (
    <EventShell
      name={model.name || 'Untitled event'}
      days={model.days}
      theme={model.theme}
      tab={tab}
      fontClassName={eventFontClassName}
      notice={model.status === 'draft' ? 'Draft preview. Only you can see this until the event is published.' : null}
      media={<EventMedia logoUrl={model.logoUrl} sponsors={model.sponsors} eventName={model.name} />}
    >
      {tab === 'schedule' || tab === 'standings' ? (
        <LiveEvent model={model} tab={tab} selectedDay={day} canEdit={canEdit} renderedAt={loadedAt} />
      ) : tab === 'teams' ? (
        <TeamsTab divisions={model.divisions} teams={model.teams} />
      ) : (
        <RulesTab html={rulesHtml} empty={isEmptyRules(rulesHtml)} />
      )}
    </EventShell>
  );
}
