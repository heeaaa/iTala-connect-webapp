import { type ReactNode } from 'react';
import Link from 'next/link';

import { formatDate } from '@/lib/format';

import { EventTabs } from './event-tabs';
import { type EventTabId } from './tabs';
import styles from './event-shell.module.css';
import { type EventTheme, eventThemeVars } from './theme';

export interface EventShellProps {
  name: string;
  days: string[];
  theme: EventTheme;
  tab: EventTabId;
  bannerUrl?: string | null;
  bannerFocus?: 'left' | 'center' | 'right';
  /** next/font variable classes, applied by the route. */
  fontClassName: string;
  /** Logo and sponsor rows (P-01), shown under the event name. */
  media?: ReactNode;
  /** Shown above everything, e.g. the draft preview notice (A-06). */
  notice?: ReactNode;
  children: ReactNode;
}

/**
 * Public event page frame (PRD P-01 to P-03). The organiser's colours are
 * set here as --ev-* tokens and nothing inside reads --brand-*.
 */
export function EventShell({
  name,
  days,
  theme,
  tab,
  bannerUrl,
  bannerFocus = 'center',
  fontClassName,
  media,
  notice,
  children,
}: EventShellProps) {
  const sorted = [...days].sort();
  const first = sorted[0];
  const last = sorted.at(-1);
  return (
    <div className={`${styles.root} ${fontClassName}`} style={eventThemeVars(theme)}>
      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}
      <div className={styles.hero}>
        <Link href="/" className={styles.allEvents} aria-label="All events" title="All events">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 5h4v4H5zM15 5h4v4h-4zM5 15h4v4H5zM15 15h4v4h-4z" />
          </svg>
          <span>All events</span>
        </Link>
        {bannerUrl ? (
          <div className={styles.banner}>
            {/* Plain img: event banners are already resized on upload. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bannerUrl} alt="" data-focus={bannerFocus} />
          </div>
        ) : null}
        <header className={`${styles.header} ${bannerUrl ? styles.headerWithBanner : ''}`}>
          <h1 className={styles.name}>{name}</h1>
          {first && last ? (
            <p className={styles.dates}>
              {first === last ? formatDate(first) : `${formatDate(first)} to ${formatDate(last)}`}
            </p>
          ) : null}
        </header>
      </div>
      {media}
      <EventTabs current={tab} />
      <main className={styles.content}>{children}</main>
      <footer className={styles.footer}>
        <p>Powered by iTala Connect</p>
      </footer>
    </div>
  );
}
