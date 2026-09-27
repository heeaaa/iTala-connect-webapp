'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createEvent } from '@/server/actions/events';
import { platformStyles as s } from '@/components/platform/platform-frame';
import { SlugField, useEventAddress } from '../../_components/slug-field';
import w from '../../admin-workspace.module.css';

/** Name and web address of a new draft (P-14): the address follows the name until the organiser edits it. */
export function NewEventForm({ year, siteUrl }: { year: number; siteUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const { value, slug, status, setChosen } = useEventAddress(name, year);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  return (
    <form
      className={s.formPanel}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await createEvent({ name, slug });
          if (!result.ok) setError(result.error);
          else router.push(`/admin/events/${result.data}?created=1`);
        });
      }}
    >
      <label className={s.field}>
        <span className={s.label}>Event name</span>
        <input
          name="name"
          required
          maxLength={200}
          className={s.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <SlugField value={value} onChange={setChosen} status={status} siteUrl={siteUrl} />
      <p role="alert" className={s.formError}>
        {error}
      </p>
      <div className={w.actions}>
        <button disabled={pending} className={`${s.button} ${s.buttonLive}`}>
          {pending ? 'Creating…' : 'Create event'}
        </button>
        <Link href="/admin">Cancel</Link>
      </div>
    </form>
  );
}
