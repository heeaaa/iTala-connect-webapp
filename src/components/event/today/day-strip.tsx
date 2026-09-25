'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { formatDayLabel } from '@/lib/format';

import styles from './today.module.css';

export interface DayStripProps {
  days: string[];
  selected: string;
  today: string;
  /** "Tonight" for evening game days, otherwise "Today". */
  todayWord: string;
}

/** Game days; the chosen day is in the URL so a link opens on it. */
export function DayStrip({ days, selected, today, todayWord }: DayStripProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const href = (day: string) => {
    const next = new URLSearchParams(params);
    next.set('day', day);
    return `${pathname}?${next.toString()}`;
  };
  return (
    <nav className={styles.dayStrip} aria-label="Game days">
      <ul>
        {[...days].sort().map((d) => (
          <li key={d}>
            <Link href={href(d)} scroll={false} aria-current={d === selected ? 'page' : undefined}>
              {d === today ? <span className={styles.dayWord}>{todayWord}</span> : null}
              <span>{formatDayLabel(d)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
