import { z } from 'zod';

import { exportCsvZip, exportPdf, exportXlsx } from '@/features/reports/exports';
import { reportDocumentSchema } from '@/features/reports/schema';
import { createClient } from '@/lib/supabase/server';
import { getAccess } from '@/server/auth';

export const runtime = 'nodejs';

const formats = {
  pdf: { contentType: 'application/pdf', extension: 'pdf' },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
  csv: { contentType: 'application/zip', extension: 'zip' },
} as const;

export async function GET(request: Request, { params }: { params: Promise<{ snapshotId: string }> }) {
  const access = await getAccess();
  if (access.kind !== 'admin') return new Response('Not found', { status: 404 });
  const { snapshotId } = await params;
  if (!z.uuid().safeParse(snapshotId).success) return new Response('Not found', { status: 404 });
  const format = new URL(request.url).searchParams.get('format');
  if (format !== 'pdf' && format !== 'xlsx' && format !== 'csv') return new Response('Invalid format', { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.from('report_snapshots').select('document').eq('id', snapshotId).maybeSingle();
  if (error || !data) return new Response('Not found', { status: 404 });
  const parsed = reportDocumentSchema.safeParse(data.document);
  if (!parsed.success) return new Response('Report unavailable', { status: 422 });

  let bytes: Uint8Array;
  try {
    bytes =
      format === 'pdf'
        ? await exportPdf(parsed.data)
        : format === 'xlsx'
          ? await exportXlsx(parsed.data)
          : exportCsvZip(parsed.data);
  } catch {
    return new Response('Could not generate the download', { status: 500 });
  }
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': formats[format].contentType,
      'Content-Disposition': `attachment; filename="itala-report-${snapshotId}.${formats[format].extension}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
