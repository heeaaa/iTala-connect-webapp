import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { TitlePlate, platformStyles } from '@/components/platform/platform-frame';
import { ReportPreview } from '@/features/reports/preview';
import { reportDocumentSchema } from '@/features/reports/schema';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/server/auth';

import styles from '@/features/reports/reports.module.css';

export const metadata: Metadata = { title: 'Saved report' };

export default async function SnapshotPage({ params }: { params: Promise<{ snapshotId: string }> }) {
  await requireAdmin('/admin/reports');
  const { snapshotId } = await params;
  if (!z.uuid().safeParse(snapshotId).success) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('report_snapshots')
    .select('document, expires_at')
    .eq('id', snapshotId)
    .maybeSingle();
  if (error || !data) notFound();
  const parsed = reportDocumentSchema.safeParse(data.document);
  if (!parsed.success) notFound();
  const report = parsed.data;
  return (
    <>
      <TitlePlate title="Saved report" sub="A fixed preview with matching downloads" />
      <p className={styles.savedMeta}>
        Available until{' '}
        <time dateTime={data.expires_at}>
          {new Date(data.expires_at).toISOString().slice(0, 16).replace('T', ' ')} UTC
        </time>
        .
      </p>
      <div className={styles.downloads} aria-label="Report downloads">
        <a href={`/admin/reports/snapshots/${snapshotId}/export?format=pdf`} className={platformStyles.button}>
          Download PDF
        </a>
        <a href={`/admin/reports/snapshots/${snapshotId}/export?format=xlsx`} className={platformStyles.button}>
          Download XLSX
        </a>
        <a href={`/admin/reports/snapshots/${snapshotId}/export?format=csv`} className={platformStyles.button}>
          Download CSV ZIP
        </a>
        <Link href="/admin/reports" className={platformStyles.button}>
          New report
        </Link>
      </div>
      <ReportPreview report={report} saved />
    </>
  );
}
