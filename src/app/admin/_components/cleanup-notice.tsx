'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { retryImageCleanup } from '@/server/actions/events';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../admin-workspace.module.css';
export function CleanupNotice({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const router = useRouter();
  return (
    <div className={w.notice}>
      <p>
        {count} deleted {count === 1 ? 'event still has' : 'events still have'} images waiting for removal.
      </p>
      <div className={w.actions}>
        <button
          disabled={pending}
          className={`${s.button} ${s.buttonQuiet}`}
          onClick={() =>
            start(async () => {
              const result = await retryImageCleanup();
              setError(result.ok ? '' : result.error);
              router.refresh();
            })
          }
        >
          {pending ? 'Removing images…' : 'Retry image removal'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
