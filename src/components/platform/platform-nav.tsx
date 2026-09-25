'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import styles from './platform.module.css';

/** Which section a path belongs to, for aria-current in the network bar. */
export function sectionOf(pathname: string): 'events' | 'dashboard' | 'settings' | 'admins' | null {
  if (pathname === '/') return 'events';
  if (pathname.startsWith('/admin/settings')) return 'settings';
  if (pathname.startsWith('/admin/admins')) return 'admins';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'dashboard';
  return null;
}

export function PlatformNav({ role }: { role: 'superadmin' | 'admin' | null }) {
  const current = sectionOf(usePathname());
  const link = (section: ReturnType<typeof sectionOf>, href: string, label: string) => (
    <Link href={href} className={styles.navLink} aria-current={current === section ? 'page' : undefined}>
      {label}
    </Link>
  );
  return (
    // data-count lets phones drop a strip that would only repeat the logo link.
    <nav aria-label="Main" className={styles.nav} data-count={role ? undefined : 1}>
      {link('events', '/', 'Events')}
      {role ? link('dashboard', '/admin', 'Dashboard') : null}
      {role === 'superadmin' ? link('settings', '/admin/settings', 'Settings') : null}
      {role === 'superadmin' ? link('admins', '/admin/admins', 'Admins') : null}
    </nav>
  );
}
