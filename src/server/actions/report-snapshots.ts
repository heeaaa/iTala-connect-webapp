'use server';

import { redirect } from 'next/navigation';

import { buildReport } from '@/features/reports/build';
import { loadConnectReportSource } from '@/features/reports/connect-source';
import { enrichReportSourceWithMobile } from '@/features/reports/mobile-source';
import { reportDefinitionSchema, reportDocumentSchema } from '@/features/reports/schema';
import type { Json } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin, canEditEvent } from '@/server/auth';

/** Rebuild from authorised source reads; never accept a report document from the browser. */
export async function createReportSnapshot(formData: FormData): Promise<void> {
  const auth = await authorizeAdmin();
  if (!auth.ok) redirect('/login?next=%2Fadmin%2Freports');

  const raw = formData.get('definition');
  if (typeof raw !== 'string' || raw.length > 16384) redirect('/admin/reports?snapshotError=invalid');
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    redirect('/admin/reports?snapshotError=invalid');
  }
  const parsed = reportDefinitionSchema.safeParse(input);
  if (!parsed.success) redirect('/admin/reports?snapshotError=invalid');
  const definition = parsed.data;
  if (!(await canEditEvent(definition.eventId))) redirect('/admin/reports?snapshotError=access');

  let document;
  try {
    const connectSource = await loadConnectReportSource(definition.eventId);
    const source = await enrichReportSourceWithMobile(connectSource, definition);
    document = reportDocumentSchema.parse(buildReport(source, definition, new Date().toISOString()));
  } catch {
    redirect(`/admin/reports?event=${definition.eventId}&snapshotError=source`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('report_snapshots')
    .insert({
      owner_id: auth.data.id,
      event_id: definition.eventId,
      template: definition.template,
      document: document as Json,
    })
    .select('id')
    .single();
  if (error || !data) redirect(`/admin/reports?event=${definition.eventId}&snapshotError=storage`);
  redirect(`/admin/reports/snapshots/${data.id}`);
}
