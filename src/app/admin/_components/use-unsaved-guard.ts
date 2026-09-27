'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const MARK = '__italaUnsaved';

/**
 * Asks before unsaved edits are lost (PRD E-03): in-app links, forms that
 * leave the page such as Sign out, browser Back, reload and closing the tab.
 * Forms that stay on the page opt out with a `data-keeps-page` attribute.
 *
 * Back cannot be cancelled in the App Router, because Next's own popstate
 * listener always routes. So while the page is dirty an extra history entry
 * for this same URL sits on top of it. Back then lands on this page's own
 * entry, which Next restores in place, and `ask` decides whether to go on
 * past it. Once the edits are saved the extra entry is skipped silently.
 */
export function useUnsavedGuard(dirty: boolean, ask: (proceed: () => void) => void) {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  const askRef = useRef(ask);
  // URL of this page while a guard entry sits on top of it.
  const armed = useRef<string | null>(null);
  // Set once the user chose to leave, so nothing asks twice.
  const leaving = useRef(false);

  useEffect(() => {
    askRef.current = ask;
    dirtyRef.current = dirty;
    if (dirty && !armed.current) {
      armed.current = window.location.href;
      window.history.pushState({ [MARK]: true }, '', armed.current);
    }
  });

  useEffect(() => {
    // Back to a guard entry left by an earlier visit, such as after a reload.
    if (window.history.state?.[MARK]) armed.current = window.location.href;
    const guarding = () => dirtyRef.current && !leaving.current;
    const pop = () => {
      const from = armed.current;
      armed.current = null;
      if (leaving.current || !from || window.location.href !== from) return;
      if (!dirtyRef.current) {
        window.history.back();
        return;
      }
      armed.current = from;
      window.history.pushState({ [MARK]: true }, '', from);
      askRef.current(() => {
        leaving.current = true;
        window.history.go(-2);
      });
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (guarding()) e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      if (!guarding() || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element).closest('a');
      if (!link?.href || link.target === '_blank' || link.hasAttribute('download')) return;
      e.preventDefault();
      e.stopPropagation();
      askRef.current(() => {
        leaving.current = true;
        // Replace the guard entry so Back from the next page skips it.
        if (armed.current) router.replace(link.href);
        else router.push(link.href);
      });
    };
    const submit = (e: SubmitEvent) => {
      const form = e.target;
      if (!guarding() || !(form instanceof HTMLFormElement) || form.hasAttribute('data-keeps-page')) return;
      e.preventDefault();
      e.stopPropagation();
      const submitter = e.submitter;
      askRef.current(() => {
        leaving.current = true;
        form.requestSubmit(submitter);
        // The submit event has been dispatched; if the action fails the user
        // stays here with their edits, so keep guarding.
        leaving.current = false;
      });
    };
    window.addEventListener('popstate', pop, true);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    document.addEventListener('submit', submit, true);
    return () => {
      window.removeEventListener('popstate', pop, true);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
      document.removeEventListener('submit', submit, true);
    };
  }, [router]);
}
