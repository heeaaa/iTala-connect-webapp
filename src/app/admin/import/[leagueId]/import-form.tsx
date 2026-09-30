'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { MobileLeague } from '@/lib/mobile-import';
import { importLeague } from '@/server/actions/mobile-import';
import { platformStyles as s } from '@/components/platform/platform-frame';
import { SlugField, useEventAddress } from '../../_components/slug-field';
import w from '../../admin-workspace.module.css';
export function ImportForm({
  league,
  links,
  otherLinkCount,
  year,
  siteUrl,
}: {
  league: MobileLeague;
  links: { eventId: string; eventName: string; divisionId: string }[];
  otherLinkCount: number;
  /** The year a default web address uses (P-14). */
  year: number;
  siteUrl: string;
}) {
  const [eventName, setEventName] = useState(league.name);
  const { value, slug, status, setChosen } = useEventAddress(eventName, year);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const hasLinks = links.length + otherLinkCount > 0;
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
            eventName,
            divisionName: String(data.get('divisionName')),
            slug,
            allowDuplicate: hasLinks,
          });
          if (!result.ok) setError(result.error);
          else
            router.push(`/admin/events/${result.data.eventId}?imported=${encodeURIComponent(result.data.leagueName)}`);
        });
      }}
    >
      <h2>Create a new event</h2>
      {hasLinks && (
        <div className={w.notice}>
          <p>
            {links.length
              ? `This league is already linked to ${[...new Set(links.map((l) => l.eventName))].join(', ')}. `
              : ''}
            {otherLinkCount
              ? `It is linked to ${otherLinkCount} other division${otherLinkCount === 1 ? '' : 's'} you cannot edit. `
              : ''}
            Creating another event will link it again.
          </p>
          <div className={w.actions}>
            {links.map((l, i) => (
              <Link
                key={l.divisionId}
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
          <input
            className={s.input}
            name="eventName"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            maxLength={200}
            required
          />
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
      <SlugField value={value} onChange={setChosen} status={status} siteUrl={siteUrl} />
      <p role="alert" className={s.formError}>
        {error}
      </p>
      <div className={w.actions}>
        <button disabled={pending} className={`${s.button} ${hasLinks ? s.buttonQuiet : s.buttonLive}`}>
          {pending ? 'Creating…' : hasLinks ? 'Create anyway' : 'Create event'}
        </button>
        <Link href="/admin/import">Back to leagues</Link>
      </div>
    </form>
  );
}
