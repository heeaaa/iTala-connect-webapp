'use client';
import { useRef, useId } from 'react';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../admin-workspace.module.css';
import { useModal } from './use-modal';
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
  useModal(ref);
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
          data-autofocus
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
