'use client';
import { useEffect, useRef, useId } from 'react';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../admin-workspace.module.css';
export function ConfirmDialog({
  title,
  message,
  pending,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  pending?: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={w.dialog}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 id={id}>{title}</h2>
      <p>{message}</p>
      <div className={w.actions}>
        <button
          autoFocus
          type="button"
          className={`${s.button} ${s.buttonQuiet}`}
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
        <button type="button" className={`${s.button} ${s.buttonTeal}`} onClick={onConfirm} disabled={pending}>
          {pending ? 'Please wait…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
