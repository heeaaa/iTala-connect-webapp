import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/server/auth';
import { mobileConfigured, mobileReader } from '@/server/mobile/reader';
import { linkedMobileEvents } from '@/server/mobile/links';
import { TitlePlate, platformStyles as s } from '@/components/platform/platform-frame';
import w from '../admin-workspace.module.css';

export default async function ImportPage({ searchParams }: PageProps<'/admin/import'>) {
  await requireAdmin('/admin/import');
  if (!mobileConfigured) notFound();
  const show = (await searchParams).dropIn === '1';
  let leagues, links;
  try {
    [leagues, links] = await Promise.all([mobileReader().listLeagues(), linkedMobileEvents()]);
  } catch {
    return (
      <>
        <TitlePlate title="Import from iTala mobile" sub="Choose a league" />
        <p role="alert" className={s.error}>
          Can&apos;t reach the iTala mobile app right now. Try again.
        </p>
        <div className={w.actions}>
          <Link className={`${s.button} ${s.buttonTeal}`} href="/admin/import">
            Retry
          </Link>
          <Link href="/admin">Back to events</Link>
        </div>
      </>
    );
  }
  const visible = leagues.filter((l) => show || l.kind !== 'recreational');
  return (
    <>
      <TitlePlate title="Import from iTala mobile" sub="Choose a league" />
      <p className={w.note}>
        Bring a league&apos;s teams and players into a new draft. You can review everything before creating the event.
      </p>
      <form className={w.actions}>
        <label className={w.check}>
          <input type="checkbox" name="dropIn" value="1" defaultChecked={show} />
          Show drop-in spaces
        </label>
        <button className={`${s.button} ${s.buttonQuiet}`}>Apply filter</button>
        <Link href="/admin">Back to events</Link>
      </form>
      {!visible.length ? (
        <p className={s.empty}>No leagues found in the iTala mobile app.</p>
      ) : (
        <ul className={w.stack}>
          {visible.map((league) => (
            <li key={league.id} className={w.league}>
              <div>
                <h2>{league.name}</h2>
                <p className={w.note}>
                  {league.season || 'No season'} · {league.teamCount} {league.teamCount === 1 ? 'team' : 'teams'}
                </p>
                <div className={w.tags}>
                  {league.is_closed && <span className={s.statusBug}>Closed</span>}
                  {league.is_archived && <span className={s.statusBug}>Archived</span>}
                  {league.kind === 'recreational' && <span className={s.statusBug}>Drop-in</span>}
                </div>
                {links
                  .filter((l) => l.leagueId === league.id)
                  .map((l) => (
                    <p key={l.eventId}>
                      <Link href={`/admin/events/${l.eventId}`}>Linked to {l.eventName}</Link>
                    </p>
                  ))}
              </div>
              <Link className={`${s.button} ${s.buttonQuiet}`} href={`/admin/import/${encodeURIComponent(league.id)}`}>
                Preview<span className="sr-only"> {league.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
