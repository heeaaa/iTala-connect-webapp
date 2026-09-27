'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { defaultEventSlug, eventAddress, normaliseSlug, SLUG_MAX, slugProblem, typedSlug } from '@/lib/event-slug';
import { checkEventSlug } from '@/server/actions/events';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../admin-workspace.module.css';

export type SlugStatus =
  | { kind: 'invalid'; message: string }
  | { kind: 'checking' }
  | { kind: 'free' }
  /** The default was taken, so the address already shown is the first free one. */
  | { kind: 'adjusted'; taken: string }
  | { kind: 'current' }
  | { kind: 'taken'; suggestion: string }
  | { kind: 'unknown'; message: string };

const CHECK_DELAY_MS = 300;
const UNCHECKED = 'Could not check this address. It is checked again when you save.';

/**
 * Whether a web address is free (P-14), checked a moment after typing stops.
 * The server checks again when the address is saved, so this is only a guide.
 */
export function useSlugStatus(value: string, { eventId, current }: { eventId?: string; current?: string } = {}) {
  const slug = normaliseSlug(value);
  const problem = slugProblem(slug);
  const skip = problem !== null || slug === current;
  const [checked, setChecked] = useState<{ slug: string; status: SlugStatus } | null>(null);
  useEffect(() => {
    if (skip) return;
    let live = true;
    const timer = setTimeout(() => {
      void checkEventSlug(slug, eventId)
        .catch(() => null)
        .then((r) => {
          if (!live) return;
          const status: SlugStatus = !r
            ? { kind: 'unknown', message: UNCHECKED }
            : !r.ok
              ? { kind: 'unknown', message: r.error }
              : r.data.free
                ? { kind: 'free' }
                : { kind: 'taken', suggestion: r.data.suggestion };
          setChecked({ slug, status });
        });
    }, CHECK_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [slug, skip, eventId]);
  const status: SlugStatus = problem
    ? { kind: 'invalid', message: problem }
    : slug === current
      ? { kind: 'current' }
      : checked?.slug === slug
        ? checked.status
        : { kind: 'checking' };
  return { slug, status };
}

/**
 * A new event's address (P-14): the name and year until the organiser types
 * their own. While it follows the name, a default another event has becomes
 * the first free one, so an organiser who never touched it is not stopped by it.
 */
export function useEventAddress(name: string, year: number) {
  const [chosen, setChosen] = useState<string | null>(null);
  const auto = name.trim() ? defaultEventSlug(name, year) : '';
  const { slug, status } = useSlugStatus(chosen ?? auto);
  if (chosen === null && status.kind === 'taken') {
    const adjusted: SlugStatus = { kind: 'adjusted', taken: slug };
    return { value: status.suggestion, slug: status.suggestion, status: adjusted, setChosen };
  }
  return { value: chosen ?? auto, slug, status, setChosen };
}

const MESSAGE: Record<SlugStatus['kind'], string> = {
  invalid: '',
  checking: 'Checking…',
  free: 'Free to use.',
  adjusted: '',
  current: 'This is the current address.',
  taken: 'Another event already uses this address.',
  unknown: '',
};

/**
 * The web address field for creating and editing events: the address as typed
 * (capitals and spaces become an address as you go), the full link below it,
 * whether it is free, and when the link starts to work.
 */
export function SlugField({
  value,
  onChange,
  status,
  siteUrl,
  published = false,
  currentText = MESSAGE.current,
  error = '',
  onEnter,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  status: SlugStatus;
  /** The site's own address, for the link preview. */
  siteUrl: string;
  /** A published event's link already works; a draft's does not yet. */
  published?: boolean;
  /** What the status says when the address is the stored one. */
  currentText?: string;
  /** Why saving the address failed; shown in place of the status. */
  error?: string;
  /** Enter applies the address instead of submitting the surrounding form. */
  onEnter?: () => void;
  /** Controls beside the status, such as Change address. */
  children?: ReactNode;
}) {
  const id = useId();
  const slug = normaliseSlug(value);
  const message = error
    ? error
    : status.kind === 'invalid' || status.kind === 'unknown'
      ? status.message
      : status.kind === 'current'
        ? currentText
        : status.kind === 'adjusted'
          ? `Free to use. Another event already uses ${status.taken}.`
          : MESSAGE[status.kind];
  const problem = Boolean(error) || status.kind === 'invalid' || status.kind === 'taken';
  // A confirmation (such as "Address changed.") reads as good news, like "Free to use.".
  const confirmed = status.kind === 'current' && currentText !== MESSAGE.current;
  const tone = problem
    ? w.slugProblem
    : status.kind === 'free' || status.kind === 'adjusted' || confirmed
      ? w.slugFree
      : w.slugQuiet;
  return (
    <div className={w.field}>
      <label htmlFor={id} className={s.label}>
        Web address
      </label>
      <input
        id={id}
        name="slug"
        className={s.input}
        value={value}
        maxLength={SLUG_MAX}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={problem}
        aria-describedby={`${id}-link ${id}-status ${id}-note`}
        onChange={(e) => {
          // Keep the caret where it was, though spaces and capitals change as they are typed. React puts
          // the value back after this handler (and moves the caret to the end), so restore the caret in a
          // microtask: after React, before the next key.
          const input = e.target;
          const caret = typedSlug(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
          onChange(typedSlug(input.value));
          queueMicrotask(() => {
            if (document.activeElement === input) input.setSelectionRange(caret, caret);
          });
        }}
        onBlur={() => {
          if (slug && slug !== value) onChange(slug);
        }}
        onKeyDown={
          onEnter &&
          ((e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            onEnter();
          })
        }
      />
      <p id={`${id}-link`} className={w.slugLink}>
        {eventAddress(siteUrl, '')}
        <strong>{slug}</strong>
      </p>
      <div className={w.slugStatus}>
        {/* A polite live region, not role="status": the page keeps its own status for saves. */}
        <p id={`${id}-status`} aria-live="polite" aria-atomic="true" className={tone}>
          {message}
        </p>
        {status.kind === 'taken' && (
          // A text button, so the address keeps its lower case and wraps on a phone.
          <button type="button" className={w.slugUse} onClick={() => onChange(status.suggestion)}>
            Use {status.suggestion}
          </button>
        )}
        {children}
      </div>
      <p id={`${id}-note`} className={w.slugNote}>
        {published
          ? 'Anyone can open this link. If you change the address, the old one keeps leading here.'
          : 'The link works once the event is published. While it is a draft, only you and superadmins can open it.'}
      </p>
    </div>
  );
}
