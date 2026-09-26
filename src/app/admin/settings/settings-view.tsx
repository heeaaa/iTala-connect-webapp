import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';
import type { PlatformTier } from '@/lib/event-images';
import w from '../admin-workspace.module.css';
import { DefaultRules } from './default-rules';
import { PlatformSponsors, type PlatformSponsor } from './platform-sponsors';

export type { PlatformSponsor };

/** Settings body (PRD S-01, S-02), shared by the page and the sample-data prototype. */
export function SettingsView({
  error,
  sponsors,
  rules,
  builtInRules,
}: {
  error: boolean;
  sponsors: Record<PlatformTier, PlatformSponsor[]>;
  /** The stored default rules template, sanitised; empty means the built-in rules. */
  rules: string;
  builtInRules: string;
}) {
  return (
    <section aria-labelledby="settings-title">
      <TitlePlate id="settings-title" title="Platform settings" sub="Sponsors and default rules" />
      {error ? (
        <p role="alert" className={s.error}>
          Could not load the settings. Please refresh the page.
        </p>
      ) : (
        <>
          <section aria-labelledby="platform-sponsors" className={w.section}>
            <h2 id="platform-sponsors">Platform sponsors</h2>
            <PlatformSponsors sponsors={sponsors} />
          </section>
          <section aria-labelledby="default-rules" className={w.section}>
            <h2 id="default-rules">Default rules</h2>
            <DefaultRules stored={rules} builtIn={builtInRules} />
          </section>
        </>
      )}
    </section>
  );
}
