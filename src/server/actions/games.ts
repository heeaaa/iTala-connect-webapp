'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formatDate, formatTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdmin, canEditEvent, type ActionResult } from '@/server/auth';

const time = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .refine((v) => Number(v.slice(0, 2)) < 24 && Number(v.slice(3)) < 60, 'Enter a valid time.');

const gameSchema = z.object({
  eventId: z.uuid(),
  id: z.uuid().optional(),
  day: z.iso.date().nullable(),
  time: time.nullable(),
  court: z.number().int().min(1).max(10),
  divisionId: z.uuid().nullable(),
  label: z.string().trim().max(120),
  team1Id: z.uuid().nullable(),
  team2Id: z.uuid().nullable(),
  type: z.enum(['group', 'semi', 'final']),
  /** Detach a playoff game from its bracket so hand-picked teams stay (E-50). */
  detach: z.boolean().default(false),
});
export type GameInput = z.input<typeof gameSchema>;

const SAME_TEAM = "A team can't play itself. Pick two different teams.";

function refresh(eventId: string) {
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/events/${eventId}`);
}

/**
 * Add or edit one game (PRD E-46 to E-48, E-50). A blank day or time keeps
 * the game Unscheduled. The slot index is the final guard against two games
 * in one slot. Never writes scores (E-06).
 */
export async function saveGame(input: GameInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = gameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the game details and try again.' };
  const g = parsed.data;
  if (g.team1Id && g.team1Id === g.team2Id) return { ok: false, error: SAME_TEAM };
  if (!(await canEditEvent(g.eventId))) return { ok: false, error: 'You can only edit your own events.' };
  const db = await createClient();
  const { data: event } = await db.from('events').select('courts, court_names').eq('id', g.eventId).single();
  if (!event) return { ok: false, error: 'Could not load the event. Please try again.' };
  if (g.court > event.courts) return { ok: false, error: `Choose a court from 1 to ${event.courts}.` };

  const scheduled = Boolean(g.day && g.time);
  const fields = {
    day: scheduled ? g.day : null,
    start_time: scheduled ? g.time : null,
    court: scheduled ? g.court : null,
    division_id: g.divisionId,
    label: g.label,
    team1_id: g.team1Id,
    team2_id: g.team2Id,
    type: g.type,
    ...(g.detach
      ? { is_playoff: false, bracket_game_id: null, team1_source: null, team2_source: null, playoff_round: null }
      : {}),
  };
  let result;
  if (g.id) {
    result = await db.from('games').update(fields).eq('id', g.id).eq('event_id', g.eventId).select('id').single();
  } else {
    const { data: last } = await db
      .from('games')
      .select('position')
      .eq('event_id', g.eventId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    result = await db
      .from('games')
      .insert({ ...fields, event_id: g.eventId, position: (last?.position ?? -1) + 1 })
      .select('id')
      .single();
  }
  if (result.error || !result.data) {
    if (result.error?.code === '23505' && scheduled) {
      const court = event.court_names[g.court - 1] || `Court ${g.court}`;
      return {
        ok: false,
        error: `That slot (${formatDate(g.day!)} ${formatTime(g.time!)} ${court}) is already taken.`,
      };
    }
    if (result.error?.code === '23514' && g.team1Id && g.team1Id === g.team2Id) return { ok: false, error: SAME_TEAM };
    return { ok: false, error: 'Could not save the game. Refresh and try again.' };
  }
  refresh(g.eventId);
  return { ok: true, data: { id: result.data.id } };
}

/** Delete a game and, with it, its score and any mobile provenance (E-49). */
export async function deleteGame(eventId: string, gameId: string): Promise<ActionResult> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  if (!z.uuid().safeParse(eventId).success || !z.uuid().safeParse(gameId).success || !(await canEditEvent(eventId)))
    return { ok: false, error: 'You can only edit your own events.' };
  const db = await createClient();
  const { data, error } = await db
    .from('games')
    .delete()
    .eq('id', gameId)
    .eq('event_id', eventId)
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: 'Could not delete the game. Refresh and try again.' };
  refresh(eventId);
  return { ok: true, data: undefined };
}

const slotSchema = z.object({
  day: z.iso.date().nullable(),
  time: time.nullable(),
  court: z.number().int().min(1).max(10).nullable(),
});
type Slot = z.infer<typeof slotSchema>;
const sameSlot = (row: { day: string | null; start_time: string | null; court: number | null }, slot: Slot) =>
  row.day === slot.day && (row.start_time?.slice(0, 5) ?? null) === slot.time && row.court === slot.court;

const dropSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('move'),
    eventId: z.uuid(),
    gameId: z.uuid(),
    day: z.iso.date(),
    time,
    court: z.number().int().min(1).max(10),
  }),
  z.object({
    kind: z.literal('swap'),
    eventId: z.uuid(),
    gameId: z.uuid(),
    otherId: z.uuid(),
    /** The slots the organiser saw: a swap exchanges them, so both must still hold. */
    gameSlot: slotSchema,
    otherSlot: slotSchema,
  }),
  z.object({ kind: z.literal('unschedule'), eventId: z.uuid(), gameId: z.uuid() }),
]);
export type DropInput = z.input<typeof dropSchema>;

const STALE = 'The schedule changed in another window. It has been refreshed; try again.';

/**
 * Drag and drop (PRD E-45): move a game to a free slot, swap the slots of
 * two games, or clear a game's slot. Each runs one atomic database function
 * (move_game, swap_games, unschedule_game) through the session client, so
 * RLS, the editor check and the slot index all apply. Never writes scores
 * (E-06). A refused move refreshes the page so the grid shows what is stored.
 */
export async function dropGame(input: DropInput): Promise<ActionResult> {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth;
  const parsed = dropSchema.safeParse(input);
  if (!parsed.success || (parsed.data.kind === 'swap' && parsed.data.otherId === parsed.data.gameId))
    return { ok: false, error: 'Check the game details and try again.' };
  const d = parsed.data;
  if (!(await canEditEvent(d.eventId))) return { ok: false, error: 'You can only edit your own events.' };
  const db = await createClient();
  const ids = d.kind === 'swap' ? [d.gameId, d.otherId] : [d.gameId];
  const { data: found } = await db
    .from('games')
    .select('id, day, start_time, court')
    .eq('event_id', d.eventId)
    .in('id', ids);
  const row = (id: string) => found?.find((g) => g.id === id);
  const stale =
    found?.length !== ids.length ||
    (d.kind === 'swap' && !(sameSlot(row(d.gameId)!, d.gameSlot) && sameSlot(row(d.otherId)!, d.otherSlot)));
  if (stale) {
    refresh(d.eventId);
    return { ok: false, error: STALE };
  }
  let result;
  if (d.kind === 'move') {
    const { data: event } = await db.from('events').select('courts, court_names').eq('id', d.eventId).single();
    if (!event) return { ok: false, error: 'Could not load the event. Please try again.' };
    if (d.court > event.courts) return { ok: false, error: `Choose a court from 1 to ${event.courts}.` };
    result = await db.rpc('move_game', { p_game_id: d.gameId, p_day: d.day, p_start_time: d.time, p_court: d.court });
    if (result.error?.code === '23505') {
      refresh(d.eventId);
      const court = event.court_names[d.court - 1] || `Court ${d.court}`;
      return {
        ok: false,
        error: `That slot (${formatDate(d.day)} ${formatTime(d.time)} ${court}) is already taken. The schedule has been refreshed.`,
      };
    }
  } else if (d.kind === 'swap') {
    result = await db.rpc('swap_games', { p_a: d.gameId, p_b: d.otherId });
  } else {
    result = await db.rpc('unschedule_game', { p_game_id: d.gameId });
  }
  refresh(d.eventId);
  if (result.error) return { ok: false, error: 'Could not move the game. The schedule has been refreshed; try again.' };
  return { ok: true, data: undefined };
}
