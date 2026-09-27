'use client';
import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Opens a native `dialog` as a modal while the component is mounted. The
 * dialog is removed from the page while still open, so the browser cannot
 * hand focus back itself; the element that had focus when it opened (the
 * button that opened it) takes it back on close (WCAG 2.4.3). When the
 * confirmed action removed that button too (Remove team, Remove division),
 * focus goes to the first control of the nearest part of the page that is
 * still there.
 *
 * The control to start on is marked `data-autofocus` rather than React's
 * autoFocus, which would move focus before the opener is known. Without a
 * mark the browser starts on the dialog's first control.
 */
export function useModal(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const around: HTMLElement[] = [];
    for (let el = opener?.parentElement; el && el !== document.body; el = el.parentElement) around.push(el);
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus();
      else
        around
          .find((el) => el.isConnected)
          ?.querySelector<HTMLElement>(FOCUSABLE)
          ?.focus();
    };
  }, [ref]);
}
