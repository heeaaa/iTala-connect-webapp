'use client';
import { type RefObject } from 'react';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../admin-workspace.module.css';

/** A button that opens the file picker: the real input stays focusable and takes the label as its name. */
export function ImagePick({
  label,
  multiple,
  inputRef,
  onPick,
}: {
  label: string;
  multiple?: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onPick: (files: File[]) => void;
}) {
  return (
    <label className={`${s.button} ${s.buttonQuiet} ${w.pick}`}>
      {label}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Cleared, so choosing the same file again still counts as a change.
          e.target.value = '';
          if (files.length) onPick(files);
        }}
      />
    </label>
  );
}
