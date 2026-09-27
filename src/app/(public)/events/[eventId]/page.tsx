import { type Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { EventShell } from '@/components/event/event-shell';
import { EventMedia, RulesTab, TeamsTab } from '@/components/event/event-tabs-content';
import { LiveEvent } from '@/components/event/live-event';
import { parseEventTab } from '@/components/event/tabs';
import { eventPath } from '@/lib/event-slug';
import { formatDate } from '@/lib/format';
import { isEmptyRules } from '@/lib/rules-html';
import { findPublicEvent, loadPublicEvent } from '@/server/public/load-event';

import { eventFontClassName } from '../../../event-fonts';

/** The segment is an event id, a web address or an old address (P-14); see findPublicEvent. */
type Props = PageProps<'/events/[eventId]'>;

/** The same query string on the event's current address, so ?tab= and ?day= survive the redirect. */
function withQuery(path: string, query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

function dateRange(days: string[]): string {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return '';
  return first === last ? formatDate(first) : `${formatDate(first)} to ${formatDate(last)}`;
}

/** Share previews (P-12): event name, dates and logo. Drafts are never indexed. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId: ref } = await params;
  const found = await findPublicEvent(ref);
  const data = found && (await loadPublicEvent(found.id));
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
  const [{ eventId: ref }, sp] = await Promise.all([params, searchParams]);
  const found = await findPublicEvent(ref);
  if (!found) notFound();
  // An id or an old address shows the current one, which is the link to share.
  if (ref !== found.slug) redirect(withQuery(eventPath(found.slug), sp));
  const data = await loadPublicEvent(found.id);
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
