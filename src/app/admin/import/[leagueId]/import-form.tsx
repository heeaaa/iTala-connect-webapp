'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { MobileLeague } from '@/lib/mobile-import';
import { importLeague } from '@/server/actions/mobile-import';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../../admin-workspace.module.css';
export function ImportForm({
  league,
  links,
}: {
  league: MobileLeague;
  links: { eventId: string; eventName: string }[];
}) {
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className={w.form}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const result = await importLeague({
            leagueId: league.id,
            eventName: String(data.get('eventName')),
            divisionName: String(data.get('divisionName')),
            allowDuplicate: links.length > 0,
          });
          if (!result.ok) setError(result.error);
          else
            router.push(`/admin/events/${result.data.eventId}?imported=${encodeURIComponent(result.data.leagueName)}`);
        });
      }}
    >
      {links.length > 0 && (
        <div className={w.notice}>
          <p>
            This league is already linked to {links.map((l) => l.eventName).join(', ')}. Creating another event will
            link it twice.
          </p>
          <div className={w.actions}>
            {links.map((l, i) => (
              <Link
                key={l.eventId}
                href={`/admin/events/${l.eventId}`}
                className={`${s.button} ${i === 0 ? s.buttonLive : s.buttonQuiet}`}
              >
                Open existing event<span className="sr-only"> {l.eventName}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className={w.fields}>
        <label className={w.field}>
          <span className={s.label}>Event name</span>
          <input className={s.input} name="eventName" defaultValue={league.name} maxLength={200} required />
        </label>
        <label className={w.field}>
          <span className={s.label}>Division name</span>
          <input
            className={s.input}
            name="divisionName"
            defaultValue={league.name.slice(0, 120)}
            maxLength={120}
            required
          />
        </label>
      </div>
      <p role="alert" className={s.formError}>
        {error}
      </p>
      <div className={w.actions}>
        <button disabled={pending} className={`${s.button} ${links.length ? s.buttonQuiet : s.buttonLive}`}>
          {pending ? 'Creating…' : links.length ? 'Create anyway' : 'Create event'}
        </button>
        <Link href="/admin/import">Back to leagues</Link>
      </div>
    </form>
  );
}
