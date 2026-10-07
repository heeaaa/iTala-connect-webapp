import type { Metadata } from 'next';
import { z } from 'zod';

import { TitlePlate, platformStyles } from '@/components/platform/platform-frame';
import { clockInZone } from '@/lib/event-time';
import { buildReport, ReportInputError } from '@/features/reports/build';
import { listReportEvents, loadConnectReportSource } from '@/features/reports/connect-source';
import {
  definitionFromQuery,
  readReportSources,
  stateFromQuery,
  type BuilderOptions,
} from '@/features/reports/builder-options';
import { listReportPresets } from '@/features/reports/connect-storage';
import { enrichReportSourceWithMobile } from '@/features/reports/mobile-source';
import type { ReportDefinition, ReportDocument } from '@/features/reports/model';
import { ReportPreview } from '@/features/reports/preview';
import { ReportBuilder } from '@/features/reports/report-builder';
import { reportDefinitionSchema } from '@/features/reports/schema';
import { createReportSnapshot } from '@/server/actions/report-snapshots';
import { deleteReportPreset, saveReportPreset } from '@/server/actions/report-presets';
import { canEditEvent, requireAdmin } from '@/server/auth';

import styles from '@/features/reports/reports.module.css';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Reports' };

function one(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin('/admin/reports');
  const query = await searchParams;
  const events = await listReportEvents(admin);
  const eventId = one(query.event);
  const eventSelected = z.uuid().safeParse(eventId).success && events.some((e) => e.id === eventId);
  const canRead = eventSelected && (await canEditEvent(eventId));
  let options: BuilderOptions | null = null;
  let report: ReportDocument | null = null;
  const initial = stateFromQuery(query);
  let selectedDefinition: ReportDefinition | null = null;
  let presets: { id: string; name: string; url: string }[] | null = [];
  let error: string | null = null;
  if (one(query.snapshotError)) {
    error =
      one(query.snapshotError) === 'storage'
        ? 'Report storage is not available yet. Your preview was not saved.'
        : 'Could not save that report. Please check your selection and try again.';
  }
  if (eventId && !canRead) error = 'That event is unavailable for your account.';
  if (one(query.presetError)) error = 'Could not save those filters. Please try again.';
  if (canRead) {
    presets = await listReportPresets(eventId);
    try {
      const connect = await loadConnectReportSource(eventId);
      const wanted = definitionFromQuery(query, connect.event.id);
      let today = '';
      try {
        today = clockInZone(new Date(), connect.event.timezone).date;
      } catch {
        today = '';
      }
      const read = await readReportSources(connect, wanted, enrichReportSourceWithMobile, today);
      const source = read.source;
      options = read.options;
      if (one(query.preview) === '1') {
        selectedDefinition = reportDefinitionSchema.parse(wanted);
        report = buildReport(source, selectedDefinition, new Date().toISOString());
      }
    } catch (cause) {
      error = cause instanceof ReportInputError ? cause.message : 'Could not prepare the report. Please try again.';
    }
  }
  return (
    <>
      <TitlePlate title="Reports" sub="Results and statistics from the events you manage" />
      <div className={styles.intro}>
        <p>
          Choose an event, a report and the games, then show the report. Scores come from Connect; player stats appear
          when a game&apos;s result was approved from the mobile app.
        </p>
      </div>
      {events.length ? (
        <ReportBuilder
          key={JSON.stringify([canRead ? eventId : '', initial])}
          events={events.map((event) => ({ id: event.id, name: event.name }))}
          eventId={canRead ? eventId : ''}
          options={options}
          initial={initial}
        />
      ) : (
        <p className={styles.empty}>No events are available to manage.</p>
      )}
      {canRead ? (
        <section className={styles.presets} aria-labelledby="saved-filters-title">
          <h2 id="saved-filters-title">Saved filters</h2>
          {presets === null ? (
            <p>Saved filters are unavailable right now.</p>
          ) : presets.length ? (
            <ul>
              {presets.map((preset) => (
                <li key={preset.id}>
                  <Link href={preset.url}>{preset.name}</Link>
                  <form action={deleteReportPreset}>
                    <input type="hidden" name="id" value={preset.id} />
                    <input type="hidden" name="event" value={eventId} />
                    <button type="submit">Delete</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p>No saved filters for this event.</p>
          )}
        </section>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {report ? (
        <>
          <ReportPreview report={report} />
          {selectedDefinition ? (
            <>
              <form action={createReportSnapshot} className={styles.snapshotForm}>
                <input type="hidden" name="definition" value={JSON.stringify(selectedDefinition)} />
                <button type="submit" className={`${platformStyles.button} ${platformStyles.buttonTeal}`}>
                  Create fixed report and downloads
                </button>
                <p>
                  Scores are read again when saved. Review the fixed report before sharing; it expires after seven days.
                </p>
              </form>
              <form action={saveReportPreset} className={styles.presetForm}>
                <input type="hidden" name="definition" value={JSON.stringify(selectedDefinition)} />
                <label>
                  <span className={platformStyles.label}>Filter name</span>
                  <input
                    name="name"
                    className={platformStyles.input}
                    maxLength={80}
                    required
                    placeholder="e.g. Saturday box scores"
                  />
                </label>
                <button type="submit" className={`${platformStyles.button} ${platformStyles.buttonQuiet}`}>
                  Save filters
                </button>
              </form>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
