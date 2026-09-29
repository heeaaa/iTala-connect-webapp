'use client';
import Link from 'next/link';
import { useState } from 'react';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../../admin-workspace.module.css';

export interface EditableEvent {
  id: string;
  name: string;
  status: string;
  divisions: { id: string; name: string }[];
}

export function ExistingEventChoice({ leagueId, events }: { leagueId: string; events: EditableEvent[] }) {
  const [choice, setChoice] = useState('');
  const options = events.flatMap((event) =>
    event.divisions.map((division) => ({
      key: `${event.id}/${division.id}`,
      event,
      division,
    })),
  );
  const selected = options.find((option) => option.key === choice);
  const href = selected
    ? `/admin/events/${selected.event.id}/divisions/${selected.division.id}/mobile-link?league=${encodeURIComponent(leagueId)}`
    : null;
  return (
    <section className={w.section} aria-labelledby="existing-event-heading">
      <h2 id="existing-event-heading">Link to an existing event</h2>
      <p className={w.note}>
        Choose a division you can edit, then review the one-to-one team pairs. A draft schedule appears in the mobile
        app only after you publish; only paired teams can start its games.
      </p>
      {options.length ? (
        <div>
          <label className={w.field}>
            <span className={s.label}>Event and division</span>
            <select name="eventDivision" className={s.input} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Choose an event and division…</option>
              {events.map((event) => (
                <optgroup key={event.id} label={`${event.name} (${event.status})`}>
                  {event.divisions.map((division) => (
                    <option key={division.id} value={`${event.id}/${division.id}`}>
                      {division.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className={w.actions}>
            {href ? (
              <Link className={`${s.button} ${s.buttonTeal}`} href={href}>
                Review team pairs
              </Link>
            ) : (
              <button className={`${s.button} ${s.buttonTeal}`} type="button" disabled>
                Review team pairs
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className={w.note}>No editable divisions yet. Create an event and add a division first.</p>
      )}
    </section>
  );
}
