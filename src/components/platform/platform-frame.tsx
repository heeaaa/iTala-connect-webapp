import Link from 'next/link';
import { type ReactNode } from 'react';

import { PlatformNav } from './platform-nav';
import styles from './platform.module.css';

/** 'login' hides the bar's own Sign in link; the nav marks the current page from the path. */
export type PlatformSection = 'events' | 'admin' | 'login';

export interface Viewer {
  name: string;
  role: 'superadmin' | 'admin';
}

export interface PlatformFrameProps {
  current: PlatformSection;
  /** Signed-in admin, or null for the public. */
  viewer: Viewer | null;
  /** next/font variable class for the platform face. */
  fontClassName: string;
  /** Sign-out control (a Server Action form), rendered for signed-in admins. */
  signOut?: ReactNode;
  children: ReactNode;
}

/**
 * Network bar and frame for every platform screen (PRD N-01): the iTala
 * mark, Events, then Dashboard, Settings and Admins by role, then the
 * signed-in admin with Sign out, or Sign in. Sticky.
 */
export function PlatformFrame({ current, viewer, fontClassName, signOut, children }: PlatformFrameProps) {
  const isSuper = viewer?.role === 'superadmin';
  return (
    <div className={`${styles.frame} ${fontClassName}`}>
      <header className={styles.bar}>
        <div className={`${styles.wrap} ${styles.barInner}`}>
          <Link href="/" className={styles.brand} aria-label="iTala Connect home">
            {/* The mark ships on its own #0B0F18 ground, which is the page ground. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- a 196 px brand raster, served as is */}
            <img src="/brand/itala-mark.png" alt="" width={40} height={40} className={styles.mark} />
            <span className={styles.wordmark} aria-hidden="true">
              iTala <span>Connect</span>
            </span>
          </Link>
          <PlatformNav role={viewer?.role ?? null} />
          <div className={styles.barEnd}>
            {viewer ? (
              <>
                <span className={styles.who} data-testid="signed-in-as">
                  {viewer.name} <span>({isSuper ? 'Superadmin' : 'Admin'})</span>
                </span>
                {signOut}
              </>
            ) : current === 'login' ? null : (
              <Link href="/login" className={`${styles.button} ${styles.buttonQuiet}`}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

/** 'iTala' in its own casing, even inside plates that CSS sets in capitals (brand commitment). */
export function BrandName() {
  return <span className={styles.brandName}>iTala</span>;
}

/** Lower-third title plate; it wipes in once on load (the platform's signature motion). */
export function TitlePlate({ title, sub, id }: { title: ReactNode; sub?: ReactNode; id?: string }) {
  return (
    <div className={styles.plate}>
      <div className={styles.plateMain}>
        <span className={styles.plateKey} aria-hidden="true" />
        <h1 id={id} className={styles.plateTitle}>
          {title}
        </h1>
      </div>
      {sub ? (
        <div className={styles.plateSubWrap}>
          <p className={styles.plateSub}>{sub}</p>
        </div>
      ) : null}
    </div>
  );
}

export type BugWhen = 'current' | 'upcoming' | 'past' | 'undated';

const BUG_WORDS: Record<BugWhen, string> = {
  current: 'On now',
  upcoming: 'Upcoming',
  past: 'Finished',
  undated: 'Dates TBC',
};

/** Status bug: words carry the state; lime and the pip only mark "On now". */
export function StatusBug({ when }: { when: BugWhen }) {
  return (
    <span className={styles.statusBug} data-when={when}>
      {when === 'current' ? <span className={styles.pip} aria-hidden="true" /> : null}
      {BUG_WORDS[when]}
    </span>
  );
}

export { styles as platformStyles };
