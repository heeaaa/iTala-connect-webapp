'use client';
import { useState } from 'react';
import { changeEventSlug } from '@/server/actions/events';
import { platformStyles as s } from '@/components/platform/platform-frame';
import { SlugField, useSlugStatus } from '../../_components/slug-field';

type Result = { ok: true; data: { slug: string; version: string } } | { ok: false; error: string };
/** Runs a change after any save in progress and adopts the event's new version (see RunImageTask). */
export type RunAddressTask = (task: (version: string) => Promise<Result>) => Promise<Result>;

/**
 * The event's web address in the editor (P-14). It changes only with Change
 * address, never with Save or autosave, and the old address keeps leading here.
 */
export function EventAddress({
  eventId,
  slug,
  siteUrl,
  published,
  run,
  onChanged,
}: {
  eventId: string;
  /** The stored address. */
  slug: string;
  siteUrl: string;
  published: boolean;
  run: RunAddressTask;
  onChanged: (slug: string) => void;
}) {
  const [value, setValue] = useState(slug);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [justChanged, setJustChanged] = useState(false);
  const { slug: next, status } = useSlugStatus(value, { eventId, current: slug });
  const changed = next !== slug;
  const apply = () => {
    if (busy || !changed || status.kind === 'invalid') return;
    setBusy(true);
    setError('');
    void run(() => changeEventSlug(eventId, next))
      .catch(() => ({ ok: false as const, error: 'Could not reach the server, so the address was not changed.' }))
      .then((result) => {
        setBusy(false);
        if (!result.ok) return setError(result.error);
        setValue(result.data.slug);
        setJustChanged(true);
        onChanged(result.data.slug);
      });
  };
  return (
    <SlugField
      value={value}
      onChange={(v) => {
        setValue(v);
        setError('');
        setJustChanged(false);
      }}
      status={status}
      siteUrl={siteUrl}
      published={published}
      error={error}
      currentText={justChanged ? 'Address changed.' : undefined}
      onEnter={apply}
    >
      {changed && (
        <>
          <button type="button" aria-disabled={busy} className={`${s.button} ${s.buttonTeal}`} onClick={apply}>
            {busy ? 'Changing…' : 'Change address'}
          </button>
          <button
            type="button"
            className={`${s.button} ${s.buttonQuiet}`}
            onClick={() => {
              setValue(slug);
              setError('');
            }}
          >
            Cancel
          </button>
        </>
      )}
    </SlugField>
  );
}
