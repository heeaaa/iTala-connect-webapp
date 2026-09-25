'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import styles from './event-shell.module.css';
import { EVENT_TABS, type EventTabId } from './tabs';

/** Tabs live in the URL (PRD P-03) so a shared link opens on the same tab. */
export function EventTabs({ current }: { current: EventTabId }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const href = (tab: EventTabId) => {
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    if (tab !== 'schedule') next.delete('day');
    return `${pathname}?${next.toString()}`;
  };
  return (
    <nav className={styles.tabs} aria-label="Event">
      <ul>
        {EVENT_TABS.map((t) => (
          <li key={t.id}>
            <Link href={href(t.id)} scroll={false} aria-current={t.id === current ? 'page' : undefined}>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
