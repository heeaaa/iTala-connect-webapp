import { type SupabaseClient } from '@supabase/supabase-js';

import { clockInZone } from '@/lib/event-time';
import { type Database } from '@/lib/supabase/database.types';

/**
 * A published league night for the public page journeys (MIGRATION_PLAN.md
 * section 10, journeys 3, 6 and 8). Seeded with the secret key on the LOCAL
 * stack only, so legacy_firebase_id can be set as the migration would.
 *
 * Today (Pacific/Auckland): Hawks 50-40 Bolts on court 1 (scored),
 * Owls v Lynx on court 2 (unscored). Tomorrow: the final, seed 1 v seed 2,
 * which resolves only once both group games are scored.
 */
export interface PublicEventFixture {
  id: string;
  name: string;
  legacyId: string;
  today: string;
  tomorrow: string;
}

export async function seedPublicEvent(
  admin: SupabaseClient<Database>,
  ownerId: string,
  stamp: number,
): Promise<PublicEventFixture> {
  const today = clockInZone(new Date(), 'Pacific/Auckland').date;
  const t = new Date(`${today}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  const tomorrow = t.toISOString().slice(0, 10);
  const name = `A League Night ${stamp}`;
  const legacyId = `-E2E${stamp}`;

  const must = <T>(r: { data: T; error: unknown }): NonNullable<T> => {
    if (r.error) throw r.error;
    if (r.data === null || r.data === undefined) throw new Error('Seeding returned no row');
    return r.data;
  };

  const event = must(
    await admin
      .from('events')
      .insert({
        owner_id: ownerId,
        name,
        status: 'published',
        published_at: new Date().toISOString(),
        schedule_days: [today, tomorrow],
        courts: 2,
        court_names: ['Court 1', 'Court 2'],
        timezone: 'Pacific/Auckland',
        legacy_firebase_id: legacyId,
        rules_html: '<h2>Timing</h2><p>Four quarters.</p><script>window.__xss = true</script>',
      })
      .select('id')
      .single(),
  );
  const division = must(
    await admin.from('divisions').insert({ event_id: event.id, name: 'Open', color: '#6C63FF' }).select('id').single(),
  );
  const teams = must(
    await admin
      .from('teams')
      .insert(
        ['Hawks', 'Bolts', 'Owls', 'Lynx'].map((n, i) => ({
          division_id: division.id,
          name: `${n}`,
          coach: n === 'Hawks' ? 'Sam' : '',
          sort_order: i,
        })),
      )
      .select('id, name'),
  );
  const id = (n: string) => teams.find((x) => x.name === n)!.id;
  const playersResult = await admin.from('players').insert([
    { team_id: id('Hawks'), name: 'Ari', number: '4', sort_order: 0 },
    { team_id: id('Hawks'), name: 'Bea', number: '7', sort_order: 1 },
  ]);
  if (playersResult.error) throw playersResult.error;
  const games = must(
    await admin
      .from('games')
      .insert([
        {
          event_id: event.id,
          division_id: division.id,
          day: today,
          start_time: '09:00',
          court: 1,
          team1_id: id('Hawks'),
          team2_id: id('Bolts'),
          label: 'Open',
          type: 'group',
          is_playoff: false,
          position: 0,
        },
        {
          event_id: event.id,
          division_id: division.id,
          day: today,
          start_time: '09:00',
          court: 2,
          team1_id: id('Owls'),
          team2_id: id('Lynx'),
          label: 'Open',
          type: 'group',
          is_playoff: false,
          position: 1,
        },
        {
          event_id: event.id,
          division_id: division.id,
          day: tomorrow,
          start_time: '12:00',
          court: 1,
          label: 'Open - Finals',
          type: 'final',
          is_playoff: true,
          bracket_game_id: `po_${division.id}_1`,
          team1_source: { type: 'seed', rank: 1 },
          team2_source: { type: 'seed', rank: 2 },
          playoff_round: 1,
          position: 2,
        },
      ])
      .select('id, position'),
  );
  const first = games.find((g) => g.position === 0)!;
  const scoreResult = await admin.from('game_scores').insert({ game_id: first.id, event_id: event.id, s1: 50, s2: 40 });
  if (scoreResult.error) throw scoreResult.error;
  return { id: event.id, name, legacyId, today, tomorrow };
}
