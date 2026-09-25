import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';
import { formatDate } from '@/lib/format';

export interface DashboardEvent {
  id: string;
  name: string;
  status: string;
  schedule_days: string[];
}

/**
 * Dashboard body (PRD D-01): the organiser's events as a rundown, with
 * table semantics kept for screen readers. Rows link to the editor once it
 * exists (phase 5); until then they are not links.
 */
export function DashboardView({
  events,
  error,
  superadmin,
}: {
  events: DashboardEvent[] | null;
  error: boolean;
  superadmin: boolean;
}) {
  return (
    <section aria-labelledby="events-title">
      <TitlePlate
        id="events-title"
        title="My events"
        sub={superadmin ? 'Every event on the platform' : 'Events you run'}
      />
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
