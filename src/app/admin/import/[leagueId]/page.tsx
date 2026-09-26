import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/server/auth';
import { mobileConfigured, mobileReader } from '@/server/mobile/reader';
import { linkedMobileEvents } from '@/server/mobile/links';
import { TitlePlate, platformStyles as s } from '@/components/platform/platform-frame';
import { ImportForm } from './import-form';
import w from '../../admin-workspace.module.css';
export default async function PreviewPage({ params }: PageProps<'/admin/import/[leagueId]'>) {
  const { leagueId } = await params;
  await requireAdmin(`/admin/import/${encodeURIComponent(leagueId)}`);
  if (!mobileConfigured) notFound();
  let preview, links;
  try {
    [preview, links] = await Promise.all([mobileReader().preview(leagueId), linkedMobileEvents(leagueId)]);
  } catch {
    return (
      <>
        <TitlePlate title="League preview" sub="Import from iTala mobile" />
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
  return (
    <>
      <TitlePlate title={preview.league.name} sub="Review your import" />
      <p className={w.note}>
        {preview.league.season || 'No season'} · {preview.teams.length} teams ·{' '}
        {preview.teams.reduce((n, t) => n + t.players.length, 0)} players
      </p>
      <ImportForm league={preview.league} links={links} />
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
                      <td>{p.number || '—'}</td>
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
