'use client';
import dynamic from 'next/dynamic';
import { useState, useTransition } from 'react';
import { platformStyles as s } from '@/components/platform/platform-frame';
import { saveDefaultRules } from '@/server/actions/platform';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { useUnsavedGuard } from '../_components/use-unsaved-guard';
import w from '../admin-workspace.module.css';

// ProseMirror loads in the browser only, as in the event editor.
const RulesEditor = dynamic(() => import('../events/[eventId]/rules-editor').then((m) => m.RulesEditor), {
  ssr: false,
  loading: () => <p className={w.note}>Loading the rules editor…</p>,
});

type Status = { tone: 'done' | 'error'; text: string } | null;

/** No visible text: display only (the server decides with the sanitiser). */
const hasNoText = (html: string) => html.replace(/<[^>]*>|&nbsp;|\s/g, '') === '';

/**
 * The default rules template (PRD S-02): what a new event's Rules start as.
 * The old app read it but had no editor. Existing events keep their own
 * rules. When the stored template is empty, new events get the built-in
 * iTala rules, and the editor starts from those.
 */
export function DefaultRules({ stored, builtIn }: { stored: string; builtIn: string }) {
  const start = hasNoText(stored) ? builtIn : stored;
  const [html, setHtml] = useState(start);
  const [saved, setSaved] = useState(start);
  const [status, setStatus] = useState<Status>(null);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const [pending, run] = useTransition();
  const dirty = html !== saved;
  useUnsavedGuard(dirty, (proceed) => setLeave(() => proceed));

  // Save stays focusable while it runs (a disabled button drops keyboard focus); repeat clicks are ignored.
  const save = () => {
    if (pending) return;
    run(async () => {
      const sent = html;
      let result: { ok: true } | { ok: false; error: string };
      try {
        result = await saveDefaultRules(sent);
      } catch {
        result = {
          ok: false,
          error: 'Could not reach the server, so the rules were not saved. Check your connection.',
        };
      }
      if (!result.ok) {
        setStatus({ tone: 'error', text: result.error });
        return;
      }
      setSaved(sent);
      setStatus({
        tone: 'done',
        text: hasNoText(sent)
          ? 'Saved. New events will start with the built-in iTala rules.'
          : 'Default rules saved. New events will start with them.',
      });
    });
  };

  return (
    <div className={w.stack}>
      <p className={w.note}>
        New events start with these rules, and organisers can change them for each event. Events that already exist keep
        their own rules. Save an empty box to go back to the built-in iTala rules.
        {!dirty && saved === builtIn && ' These are the built-in rules.'}
      </p>
      <RulesEditor value={start} label="Default rules" onChange={setHtml} />
      <div className={w.actions}>
        <button type="button" className={`${s.button} ${s.buttonLive}`} aria-disabled={pending} onClick={save}>
          {pending ? 'Saving…' : 'Save default rules'}
        </button>
        {dirty && <span className={w.note}>Unsaved changes</span>}
      </div>
      <p aria-live="polite" className={w.imageStatus} data-tone={status?.tone}>
        {status?.text}
      </p>
      {leave && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          message="Your latest edits to the default rules have not been saved."
          confirmLabel="Continue"
          onCancel={() => setLeave(null)}
          onConfirm={() => {
            leave();
            setLeave(null);
          }}
        />
      )}
    </div>
  );
}
