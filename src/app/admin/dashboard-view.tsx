import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';
import { formatDate } from '@/lib/format';
import Link from 'next/link';
import { EventActions } from './_components/dashboard-actions';
import w from './admin-workspace.module.css';

export interface DashboardEvent {
  id: string;
  name: string;
  status: string;
  schedule_days: string[];
  divisions?: { count: number }[];
}

/**
 * Dashboard body (PRD D-01): the organiser's events as a rundown, with
 * table semantics kept for screen readers, with draft editing and event actions.
 */
export function DashboardView({
  events,
  error,
  superadmin,
  mobileEnabled = false,
}: {
  events: DashboardEvent[] | null;
  error: boolean;
  superadmin: boolean;
  mobileEnabled?: boolean;
}) {
  return (
    <section aria-labelledby="events-title">
      <TitlePlate
        id="events-title"
        title="My events"
        sub={superadmin ? 'Every event on the platform' : 'Events you run'}
      />
      <div className={w.actions}>
        <Link href="/admin/events/new" className={`${s.button} ${s.buttonLive}`}>
          + New event
        </Link>
        {mobileEnabled && (
          <Link href="/admin/import" className={`${s.button} ${s.buttonQuiet}`}>
            Import from <span className={s.brandName}>iTala</span> mobile
          </Link>
        )}
      </div>
      {error ? (
        <p role="alert" className={s.error}>
          Could not load events. Please refresh the page.
        </p>
      ) : !events || events.length === 0 ? (
        <p className={s.empty}>No events yet. Create your first tournament or league.</p>
      ) : (
        <div className={s.tableScroll} tabIndex={0} role="region" aria-label="My events">
          <table className={s.rundownTable}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col">Divisions</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const first = [...event.schedule_days].sort()[0];
                const date = first ? formatDate(first) : null;
                const published = event.status === 'published';
                return (
                  <tr key={event.id}>
                    <td className={s.dateCell}>
                      <span className={s.bugDate}>
                        {date ? (
                          <>
                            <b>{date.slice(0, 5)}</b>
                            <small>{date.slice(5)}</small>
                          </>
                        ) : (
                          <>
                            <b>TBC</b>
                            <span className="sr-only">No dates</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className={s.bugName}>{event.name || 'Untitled event'}</td>
                    <td>
                      <span className={s.statusBug} data-status={published ? 'published' : 'draft'}>
                        {published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td>{event.divisions?.[0]?.count ?? 0}</td>
                    <td>
                      <EventActions id={event.id} name={event.name} published={published} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
