'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createEvent } from '@/server/actions/events';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../../admin-workspace.module.css';
export function NewEventForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  return (
    <form
      className={s.formPanel}
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get('name'));
        start(async () => {
          const result = await createEvent(name);
          if (!result.ok) setError(result.error);
          else router.push(`/admin/events/${result.data}?created=1`);
        });
      }}
    >
      <label className={s.field}>
        <span className={s.label}>Event name</span>
        <input name="name" required maxLength={200} className={s.input} />
      </label>
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
