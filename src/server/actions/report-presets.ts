'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { reportDefinitionSchema } from '@/features/reports/schema';
import type { Json } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin, canEditEvent } from '@/server/auth';

export async function saveReportPreset(formData: FormData): Promise<void> {
  const auth = await authorizeAdmin();
  if (!auth.ok) redirect('/login?next=%2Fadmin%2Freports');
  const name = z.string().trim().min(1).max(80).safeParse(formData.get('name'));
  const raw = formData.get('definition');
  if (!name.success || typeof raw !== 'string' || raw.length > 16384) redirect('/admin/reports?presetError=invalid');
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    redirect('/admin/reports?presetError=invalid');
  }
  const parsed = reportDefinitionSchema.safeParse(input);
  if (!parsed.success) redirect('/admin/reports?presetError=invalid');
  const definition = parsed.data;
  if (!(await canEditEvent(definition.eventId))) redirect('/admin/reports?presetError=access');
  const supabase = await createClient();
  const { error } = await supabase.from('report_presets').insert({
    owner_id: auth.data.id,
    event_id: definition.eventId,
    name: name.data,
    definition: definition as Json,
  });
  if (error) redirect(`/admin/reports?event=${definition.eventId}&presetError=storage`);
  redirect(`/admin/reports?event=${definition.eventId}`);
}

export async function deleteReportPreset(formData: FormData): Promise<void> {
  const auth = await authorizeAdmin();
  if (!auth.ok) redirect('/login?next=%2Fadmin%2Freports');
  const id = z.uuid().safeParse(formData.get('id'));
  const event = z.uuid().safeParse(formData.get('event'));
  if (!id.success || !event.success || !(await canEditEvent(event.data))) redirect('/admin/reports?presetError=access');
  const supabase = await createClient();
  const { error } = await supabase
    .from('report_presets')
    .delete()
    .eq('id', id.data)
    .eq('event_id', event.data)
    .eq('owner_id', auth.data.id);
  if (error) redirect(`/admin/reports?event=${event.data}&presetError=storage`);
  redirect(`/admin/reports?event=${event.data}`);
}
