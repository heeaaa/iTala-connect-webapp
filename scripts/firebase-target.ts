/**
 * The database side of the Firebase import (Phase 7b and 7c): the secret-key
 * client calling import_legacy_event, the read-back for the verification
 * diff, and the images (old ones fetched by address, new ones uploaded to the
 * images bucket). Used by scripts/migrate-firebase.ts only.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { IMAGE_LIMIT } from '../src/lib/event-images';
import type { Database, Json } from '../src/lib/supabase/database.types';
import type { ImportResult, ImportTarget } from '../src/migration/apply';
import type { StoredEvent } from '../src/migration/read-back';

const EVENT_COLUMNS =
  'id, name, status, schedule_days, time_start, time_end, courts, court_names, timezone, logo_path, theme_primary, theme_bg, theme_text, theme_text_secondary, theme_heading, rules_html';
const GAME_COLUMNS =
  'id, division_id, day, start_time, court, group_id, team1_id, team2_id, label, type, is_playoff, bracket_game_id, team1_source, team2_source, playoff_round, position, legacy_gid, legacy_index';

export function supabaseTarget(url: string, secretKey: string): ImportTarget {
  // Read here, after --env has loaded the file.
  const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'images';
  const db: SupabaseClient<Database> = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  /** The rows, or an error; "none" is an answer only where maybeSingle is asked. */
  const may = <T>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const must = <T>(r: { data: T; error: { message: string } | null }): NonNullable<T> => {
    const data = may(r);
    if (data === null || data === undefined) throw new Error('The database returned nothing.');
    return data as NonNullable<T>;
  };
  return {
    async ownerId(email) {
      for (let page = 1; ; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(error.message);
        const user = data.users.find((u) => u.email?.toLowerCase() === email);
        if (user) {
          const profile = may(await db.from('profiles').select('role, disabled_at').eq('id', user.id).maybeSingle());
          return profile?.role && !profile.disabled_at ? user.id : null;
        }
        if (data.users.length < 200) return null;
      }
    },
    async importEvent(ownerId, payload) {
      const data = must(await db.rpc('import_legacy_event', { p_owner: ownerId, p_event: payload as unknown as Json }));
      return data as unknown as ImportResult;
    },
    async readBack(eventId) {
      const event = must(await db.from('events').select(EVENT_COLUMNS).eq('id', eventId).single());
      const divisions = must(
        await db
          .from('divisions')
          .select('id, name, color, sort_order, created_at, legacy_key')
          .eq('event_id', eventId),
      );
      const ids = divisions.map((d) => d.id);
      const teams = ids.length
        ? must(
            await db
              .from('teams')
              .select('id, division_id, name, coach, sort_order, created_at, legacy_code')
              .in('division_id', ids),
          )
        : [];
      const games = must(await db.from('games').select(GAME_COLUMNS).eq('event_id', eventId));
      const scores = must(await db.from('game_scores').select('game_id, s1, s2').eq('event_id', eventId));
      return { event, divisions, teams, games, scores } satisfies StoredEvent;
    },
    async importPlatform(rules) {
      return Boolean(must(await db.rpc('import_legacy_platform', { p_default_rules_html: rules ?? '' })));
    },
    async fetchImage(address) {
      // Read only: a GET of the old image, with a time limit, stopping past 5 MB.
      const res = await fetch(address, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`the old address answered ${res.status}`);
      if (Number(res.headers.get('content-length') ?? 0) > IMAGE_LIMIT) throw new Error('it is larger than 5 MB');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > IMAGE_LIMIT) throw new Error('it is larger than 5 MB');
        chunks.push(chunk);
      }
      return new Uint8Array(Buffer.concat(chunks));
    },
    async uploadImage(path, bytes, type) {
      const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
      if (error) throw new Error(error.message);
    },
    async removeImages(paths) {
      const { error } = await db.storage.from(BUCKET).remove(paths);
      if (error) throw new Error(error.message);
    },
    async setEventImages(eventId, logoPath, sponsors) {
      const unused = may(
        await db.rpc('set_legacy_event_images', {
          p_event_id: eventId,
          p_logo_path: logoPath as string,
          p_sponsors: sponsors as unknown as Json,
        }),
      );
      return unused ?? [];
    },
    async platformHasSponsors() {
      const { count, error } = await db.from('platform_sponsors').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return (count ?? 0) > 0;
    },
    async setPlatformSponsors(sponsors) {
      return Boolean(may(await db.rpc('set_legacy_platform_sponsors', { p_sponsors: sponsors as unknown as Json })));
    },
  };
}
