'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEvent } from '@/server/actions/events';
import { platformStyles as s } from '@/components/platform/platform-frame';
import { ConfirmDialog } from './confirm-dialog';
import w from '../admin-workspace.module.css';
export function EventActions({ id, name, published }: { id: string; name: string; published: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <div className={w.actions}>
        <Link className={`${s.button} ${s.buttonQuiet}`} href={`/admin/events/${id}`}>
          Edit<span className="sr-only"> {name}</span>
        </Link>
        {published && (
          <Link className={`${s.button} ${s.buttonQuiet}`} href={`/events/${id}`}>
            View<span className="sr-only"> {name}</span>
          </Link>
        )}
        <button className={w.danger} onClick={() => setConfirm(true)}>
          Delete<span className="sr-only"> {name}</span>
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {confirm && (
        <ConfirmDialog
          title={`Delete "${name}"?`}
          message="This can't be undone. The event, its teams, games and stored images will be deleted."
          confirmLabel="Delete event"
          pending={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            start(async () => {
              const result = await deleteEvent(id);
              if (!result.ok) {
                setError(result.error);
                setConfirm(false);
              } else {
                setConfirm(false);
                router.refresh();
              }
            })
          }
        />
      )}
    </>
  );
}
