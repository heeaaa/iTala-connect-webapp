import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverEnv } from '@/env';
import { clientEnv } from '@/env.client';
import { slugYear } from '@/lib/event-slug';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/server/auth';
import { mobileConfigured, mobileReader } from '@/server/mobile/reader';
import { linkedMobileEvents, mobileLeagueLinkCount } from '@/server/mobile/links';
import { TitlePlate, platformStyles as s } from '@/components/platform/platform-frame';
import { ImportForm } from './import-form';
import { ExistingEventChoice, type EditableEvent } from './existing-event-choice';
import w from '../../admin-workspace.module.css';
export default async function PreviewPage({ params }: PageProps<'/admin/import/[leagueId]'>) {
  const { leagueId } = await params;
  const admin = await requireAdmin(`/admin/import/${encodeURIComponent(leagueId)}`);
  if (!mobileConfigured) notFound();
  let preview, links, linkCount;
  try {
    [preview, links, linkCount] = await Promise.all([
      mobileReader().preview(leagueId),
      linkedMobileEvents(leagueId),
      mobileLeagueLinkCount(leagueId),
    ]);
  } catch {
    return (
      <>
        <TitlePlate title="League preview" sub="Import from the mobile app" />
        <p role="alert" className={s.error}>
          Can&apos;t load this mobile league right now. It may have changed. Try again.
        </p>
        <div className={w.actions}>
          <Link href={`/admin/import/${encodeURIComponent(leagueId)}`} className={`${s.button} ${s.buttonTeal}`}>
            Retry
          </Link>
          <Link href="/admin/import">Back to leagues</Link>
        </div>
      </>
    );
  }
  const db = await createClient();
  let eventQuery = db
    .from('events')
    .select('id, name, status, divisions(id, name, sort_order, created_at)')
    .order('name');
  if (admin.role !== 'superadmin') eventQuery = eventQuery.eq('owner_id', admin.id);
  const { data: eventRows, error: eventsError } = await eventQuery;
  const editableEvents: EditableEvent[] = eventsError
    ? []
    : (eventRows ?? []).map((event) => ({
        id: event.id,
        name: event.name,
        status: event.status,
        divisions: [...event.divisions]
          .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
          .map((division) => ({ id: division.id, name: division.name })),
      }));
  return (
    <>
      <TitlePlate title={preview.league.name} sub="Review your import" />
      <p className={w.note}>
        {preview.league.season || 'No season'} · {preview.teams.length} teams ·{' '}
        {preview.teams.reduce((n, t) => n + t.players.length, 0)} players
      </p>
      {eventsError ? (
        <p role="alert" className={s.error}>
          Could not load your events. Refresh to try again.
        </p>
      ) : (
        <ExistingEventChoice leagueId={leagueId} events={editableEvents} />
      )}
      <ImportForm
        league={preview.league}
        links={links}
        otherLinkCount={Math.max(0, linkCount - links.length)}
        year={slugYear([], new Date(), serverEnv().DEFAULT_EVENT_TIMEZONE)}
        siteUrl={clientEnv().NEXT_PUBLIC_SITE_URL}
      />
      {preview.teams.length < 2 && (
        <p className={w.notice}>You&apos;ll need at least 2 teams before you can publish.</p>
      )}
      <section aria-label="Teams and players" className={w.form}>
        {preview.teams.map((team) => (
          <div key={team.id} className={w.section}>
            <h2>{team.name}</h2>
            <p className={w.note}>
              {team.coach ? `Coach: ${team.coach} · ` : ''}
              {team.players.length} players {team.team_only ? '· Team only' : ''}
            </p>
            {team.players.length > 0 && (
              <table className={w.roster}>
                <caption className="sr-only">{team.name} players</caption>
                <thead>
                  <tr>
                    <th scope="col">Number</th>
                    <th scope="col">Player</th>
                  </tr>
                </thead>
                <tbody>
                  {team.players.map((p) => (
                    <tr key={p.id}>
                      <td>{p.number || <span aria-label="No number">-</span>}</td>
                      <td>{p.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
