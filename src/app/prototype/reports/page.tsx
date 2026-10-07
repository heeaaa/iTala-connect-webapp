import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PlatformFrame, TitlePlate, platformStyles } from '@/components/platform/platform-frame';
import { serverEnv } from '@/env';
import { buildReport, ReportInputError } from '@/features/reports/build';
import { builderOptions, definitionFromQuery, stateFromQuery } from '@/features/reports/builder-options';
import type { ReportDocument } from '@/features/reports/model';
import { ReportPreview } from '@/features/reports/preview';
import { ReportBuilder } from '@/features/reports/report-builder';
import { reportDefinitionSchema } from '@/features/reports/schema';
import { SAMPLE_REPORT_EVENT, sampleReportSource } from '@/prototype/report-sample';

import styles from '@/features/reports/reports.module.css';
import { platformFontClassName } from '../../platform-fonts';

export const metadata: Metadata = { title: 'Reports sample', robots: { index: false, follow: false } };

/**
 * The real report form and report builder on SAMPLE DATA, with player stats as an approved
 * mobile result would carry them, for visual review and browser tests without a database.
 */
export default async function ReportsPrototype({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!serverEnv().ENABLE_PROTOTYPES) notFound();
  const query = await searchParams;
  const source = sampleReportSource();
  const chosen = query.event === SAMPLE_REPORT_EVENT;
  const initial = stateFromQuery(query);
  let report: ReportDocument | null = null;
  let error = '';
  if (chosen && query.preview === '1') {
    try {
      const definition = reportDefinitionSchema.parse(definitionFromQuery(query, SAMPLE_REPORT_EVENT));
      report = buildReport(source, definition, '2026-10-17T07:00:00.000Z');
    } catch (cause) {
      error = cause instanceof ReportInputError ? cause.message : 'Could not prepare the report. Please try again.';
    }
  }
  return (
    <PlatformFrame
      current="admin"
      viewer={{ name: 'Sample admin', role: 'admin' }}
      fontClassName={platformFontClassName}
      signOut={<button type="button">Sign out</button>}
    >
      <main className={`${platformStyles.wrap} pb-12`}>
        <TitlePlate title="Reports" sub="Sample data for visual review" />
        <ReportBuilder
          events={[{ id: SAMPLE_REPORT_EVENT, name: source.event.name }]}
          eventId={chosen ? SAMPLE_REPORT_EVENT : ''}
          options={chosen ? builderOptions(source, [], { today: '2026-10-17' }) : null}
          initial={initial}
          basePath="/prototype/reports"
        />
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        {report ? <ReportPreview report={report} /> : null}
      </main>
    </PlatformFrame>
  );
}
