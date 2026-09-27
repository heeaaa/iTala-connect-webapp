'use server';
import { revalidatePath } from 'next/cache';
import { serverEnv } from '@/env';
import { importChoiceSchema, type ImportChoice } from '@/lib/mobile-import';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin, type ActionResult } from '@/server/auth';
import { DEFAULT_RULES_HTML } from '@/server/event-defaults';
import { mobileConfigured, mobileReader } from '@/server/mobile/reader';

export async function importLeague(
  input: ImportChoice,
): Promise<ActionResult<{ eventId: string; leagueName: string }>> {
  const access = await authorizeAdmin();
  if (!access.ok) return access;
  const parsed = importChoiceSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'Enter an event name (up to 200 characters) and division name (up to 120 characters).' };
  if (!mobileConfigured) return { ok: false, error: 'The mobile integration is not configured.' };
  let preview;
  try {
    preview = await mobileReader().preview(parsed.data.leagueId);
  } catch {
    return { ok: false, error: "Can't reach the iTala mobile app right now. Try again." };
  }
  const db = await createClient();
  const { data, error } = await db.rpc('import_mobile_league', {
    p_event_name: parsed.data.eventName,
    p_division_name: parsed.data.divisionName,
    p_timezone: serverEnv().DEFAULT_EVENT_TIMEZONE,
    p_rules: DEFAULT_RULES_HTML,
    p_league: preview.league,
    p_teams: preview.teams,
    p_allow_duplicate: parsed.data.allowDuplicate,
  });
  if (error)
    return {
      ok: false,
      error:
        error.code === '23505'
          ? 'This league was already imported. Reload the preview to review the existing event and choose Create anyway.'
          : 'Could not create the event. Nothing was imported. Please try again.',
    };
  revalidatePath('/admin');
  return { ok: true, data: { eventId: data, leagueName: preview.league.name } };
}
