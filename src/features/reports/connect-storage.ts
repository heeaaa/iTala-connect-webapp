import 'server-only';

import { createClient } from '@/lib/supabase/server';

import { presetUrl } from './presets';
import { reportDefinitionSchema } from './schema';

export async function listReportPresets(eventId: string): Promise<{ id: string; name: string; url: string }[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('report_presets')
    .select('id, name, definition')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false });
  if (error) return null;
  return (data ?? []).flatMap((row) => {
    const parsed = reportDefinitionSchema.safeParse(row.definition);
    return parsed.success && parsed.data.eventId === eventId
      ? [{ id: row.id, name: row.name, url: presetUrl(parsed.data) }]
      : [];
  });
}
