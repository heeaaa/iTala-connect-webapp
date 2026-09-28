'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { eventPath } from '@/lib/event-slug';
import { deleteEvent } from '@/server/actions/events';
import { platformStyles as s } from '@/components/platform/platform-frame';
import { ConfirmDialog } from './confirm-dialog';
import w from '../admin-workspace.module.css';
/** D-02: Edit, View (published only), Results (only with the mobile integration on), Delete. */
export function EventActions({
  id,
  slug,
  name,
  published,
  results = false,
  compact = false,
}: {
  id: string;
  slug: string;
  name: string;
  published: boolean;
  results?: boolean;
  compact?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <div className={`${w.actions} ${compact ? w.dashboardActions : ''}`}>
        <Link className={`${s.button} ${s.buttonQuiet}`} href={`/admin/events/${id}`}>
          Edit<span className="sr-only"> {name}</span>
        </Link>
        {published && (
          <Link className={`${s.button} ${s.buttonQuiet}`} href={eventPath(slug)}>
            View<span className="sr-only"> {name}</span>
          </Link>
        )}
        {results && (
          <Link className={`${s.button} ${s.buttonQuiet}`} href={`/admin/events/${id}/results`}>
            Results<span className="sr-only"> {name}</span>
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
