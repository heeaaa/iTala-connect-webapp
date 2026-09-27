'use client';
import { useState, useRef } from 'react';
import { formatDate } from '@/lib/format';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../admin-workspace.module.css';
export function DatePicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (days: string[]) => void;
  disabled?: boolean;
}) {
  const [month, setMonth] = useState(() => {
    const d = value[0] ? new Date(`${value[0]}T12:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const grid = useRef<HTMLDivElement>(null);
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const toggle = (day: string) =>
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort());
  return (
    <div className={w.calendar}>
      <h3>Event dates ({value.length} selected)</h3>
      <div className={w.actions}>
        <button
          type="button"
          className={`${s.button} ${s.buttonQuiet}`}
          aria-label="Previous month"
          disabled={disabled}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          Previous
        </button>
        <span aria-live="polite">{month.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })}</span>
        <button
          type="button"
          className={`${s.button} ${s.buttonQuiet}`}
          aria-label="Next month"
          disabled={disabled}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          Next
        </button>
      </div>
      <div className={w.week} aria-hidden="true">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div
        ref={grid}
        className={w.week}
        role="group"
        aria-label="Choose event dates"
        onKeyDown={(e) => {
          const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 } as Record<string, number>)[e.key];
          if (!step) return;
          const buttons = Array.from(grid.current!.querySelectorAll('button'));
          const index = buttons.indexOf(e.target as HTMLButtonElement);
          const next = buttons[index + step];
          if (next) {
            e.preventDefault();
            next.focus();
          }
        }}
      >
        {Array.from({ length: month.getDay() }, (_, i) => (
          <span key={`blank${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const day = `${prefix}-${String(i + 1).padStart(2, '0')}`;
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              aria-label={formatDate(day)}
              aria-pressed={value.includes(day)}
              onClick={() => toggle(day)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <ul className={w.dates}>
        {value.map((day) => (
          <li key={day}>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove ${formatDate(day)}`}
              onClick={() => toggle(day)}
            >
              {formatDate(day)} · Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
