import Link from 'next/link';

import { BrandName, platformStyles as s, StatusBug, TitlePlate } from '@/components/platform/platform-frame';
import { formatDate } from '@/lib/format';
import { divisionsLabel, type HomeCard } from '@/lib/public-event/home';

/** Home body, shared by the page and the sample-data prototype. */
export function HomeView({ events }: { events: HomeCard[] }) {
  const groups: { label: string; items: HomeCard[] }[] = [
    { label: 'On now and upcoming', items: events.filter((e) => e.when === 'current' || e.when === 'upcoming') },
    { label: 'Earlier this season', items: events.filter((e) => e.when === 'past') },
    { label: 'Dates to be confirmed', items: events.filter((e) => e.when === 'undated') },
  ].filter((g) => g.items.length > 0);
  return (
    <>
      <main className={s.wrap}>
        <TitlePlate title="Events this season" sub="Record. Track. Elevate." />
        <div className={s.layout}>
          <div>
            {groups.length === 0 ? (
              <p className={s.empty}>No events yet. Published tournaments will appear here.</p>
            ) : (
              groups.map((g) => (
                <section key={g.label} className={s.section} aria-labelledby={`group-${g.label}`}>
                  <h2 id={`group-${g.label}`} className={s.sectionLabel}>
                    {g.label}
                  </h2>
                  <ul className={s.rundown}>
                    {g.items.map((e) => (
                      <li key={e.id}>
                        <EventBug event={e} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>

          <aside className={s.promo} aria-labelledby="organisers-heading">
            <h2 id="organisers-heading">
              <span className={s.key} aria-hidden="true" />
              <span>
                Run your league on <BrandName /> Connect
              </span>
            </h2>
            <ul>
              <li>
                <span className={s.tick} aria-hidden="true" />
                Round robins and seeded playoff brackets, built for you.
              </li>
              <li>
                <span className={s.tick} aria-hidden="true" />
                One link with live scores and standings. No app or login for fans.
              </li>
              <li>
                <span className={s.tick} aria-hidden="true" />
                <span>
                  Final scores straight from the <BrandName /> scorekeeper app.
                </span>
              </li>
            </ul>
            <p>Organiser accounts are set up by the iTala team.</p>
            <p>
              <Link href="/login" className={`${s.button} ${s.buttonTeal}`}>
                Organiser sign in
              </Link>
            </p>
          </aside>
        </div>
      </main>
    </>
  );
}

function EventBug({ event: e }: { event: HomeCard }) {
  const range =
    e.firstDay && e.lastDay
      ? e.firstDay === e.lastDay
        ? formatDate(e.firstDay)
        : `${formatDate(e.firstDay)} to ${formatDate(e.lastDay)}`
      : 'dates to be confirmed';
  const first = e.firstDay ? formatDate(e.firstDay) : null;
  return (
    <Link href={`/events/${e.id}`} className={s.bug}>
      <span className={s.bugDate} aria-hidden="true">
        {first ? (
          <>
            <b>{first.slice(0, 5)}</b>
            <small>{first.slice(5)}</small>
          </>
        ) : (
          <b>TBC</b>
        )}
      </span>
      <span className={s.bugBody}>
        {e.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- storage URLs are sized on upload (E-18)
          <img src={e.logoUrl} alt="" className={s.bugLogo} />
        ) : null}
        <span className={s.bugText}>
          <span className={s.bugName}>{e.name || 'Untitled event'}</span>
          <span className={s.bugMeta}>
            {divisionsLabel(e.divisionCount)}, {range}
          </span>
        </span>
      </span>
      {/* Undated events already say so in the date block and the meta line; no third TBC. */}
      {e.when === 'undated' ? null : (
        <span className={s.status}>
          <StatusBug when={e.when} />
        </span>
      )}
    </Link>
  );
}
