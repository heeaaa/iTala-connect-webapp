import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';

/** Settings body (PRD S-01, S-02 placeholder), shared by the page and the sample-data prototype. */
export function SettingsView() {
  return (
    <section aria-labelledby="settings-title">
      <TitlePlate id="settings-title" title="Platform settings" sub="Sponsors and default rules" />
      <div className={s.placeholder}>
        <p className={s.placeholderTag}>Not built yet</p>
        <p>
          This is where a superadmin will manage the primary and secondary sponsors shown on every event, and the
          default rules that new events start with.
        </p>
      </div>
    </section>
  );
}
