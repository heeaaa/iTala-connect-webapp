'use client';
import { useRef, useState } from 'react';

import { platformStyles as s } from '@/components/platform/platform-frame';
import { formatDayLabel } from '@/lib/format';

import type { GameDay } from './builder-options';
import styles from './reports.module.css';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10" for the month a day is in, or this month when there is no day. */
function monthOf(day: string): { year: number; month: number } {
  if (/^\d{4}-\d{2}/.test(day)) return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1 };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

/**
 * The report's date selector: the platform's month calendar (DESIGN.md, multi-date calendar
 * picker) with each game day marked, so an organiser sees where the games are. Chosen days are
 * solid teal (`aria-pressed`); days inside a chosen range are a raised plate. Every day button
 * says its full DD/MM/YYYY date and how many games it has. Arrow keys move by a day or a week.
 */
export function ReportCalendar({
  id,
  label,
  start,
  gameDays,
  isChosen,
  inRange,
  onPick,
  describedBy,
}: {
  id: string;
  label: string;
  /** The day the calendar opens on (its month). */
  start: string;
  gameDays: readonly GameDay[];
  isChosen: (day: string) => boolean;
  inRange: (day: string) => boolean;
  onPick: (day: string) => void;
  describedBy?: string;
}) {
  const [{ year, month }, setMonth] = useState(() => monthOf(start));
  const grid = useRef<HTMLDivElement>(null);
  const games = new Map(gameDays.map((d) => [d.date, d.games]));
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const step = (by: number) =>
    setMonth(({ year: y, month: m }) => ({ year: y + Math.floor((m + by) / 12), month: (((m + by) % 12) + 12) % 12 }));
  return (
    <div className={styles.calendar}>
      <div className={styles.calendarBar}>
        <button
          type="button"
          className={`${s.button} ${s.buttonQuiet}`}
          aria-label="Previous month"
          onClick={() => step(-1)}
        >
          Previous
        </button>
        <span className={styles.month} aria-live="polite">
          {MONTHS[month]} {year}
        </span>
        <button
          type="button"
          className={`${s.button} ${s.buttonQuiet}`}
          aria-label="Next month"
          onClick={() => step(1)}
        >
          Next
        </button>
      </div>
      <div className={styles.week} aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div
        ref={grid}
        id={id}
        tabIndex={-1}
        className={styles.week}
        role="group"
        aria-label={label}
        aria-describedby={describedBy}
        onKeyDown={(e) => {
          const by = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 } as Record<string, number>)[e.key];
          if (!by) return;
          const buttons = Array.from(grid.current!.querySelectorAll('button'));
          const next = buttons[buttons.indexOf(e.target as HTMLButtonElement) + by];
          if (next) {
            e.preventDefault();
            next.focus();
          }
        }}
      >
        {Array.from({ length: first }, (_, i) => (
          <span key={`blank${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const day = `${year}-${pad(month + 1)}-${pad(i + 1)}`;
          const n = games.get(day) ?? 0;
          return (
            <button
              key={day}
              type="button"
              aria-label={`${formatDayLabel(day)}, ${n ? `${n} game${n === 1 ? '' : 's'}` : 'no games'}`}
              aria-pressed={isChosen(day)}
              data-games={n > 0 || undefined}
              data-range={(inRange(day) && !isChosen(day)) || undefined}
              onClick={() => onPick(day)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <p className={styles.calendarKey}>
        <span aria-hidden="true" className={styles.keySwatch} /> Days with games
      </p>
    </div>
  );
}
