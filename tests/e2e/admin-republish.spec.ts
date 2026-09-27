import { expect, test } from '@playwright/test';
import { clockInZone } from '@/lib/event-time';
import { signInAndWait } from './fixtures';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

let organiser: TestUser;
test.beforeEach(async () => {
  organiser = await createUser('admin', { tag: 'republish-e2e', name: 'Republish organiser' });
});
test.afterEach(async () => {
  if (organiser) await deleteUsers([organiser]);
});

// Journey 4 (MIGRATION_PLAN.md section 10), PRD E-62: an event that was published before comes
// back as a draft with a recorded score (as an imported event can). Publishing warns that the
// score will be cleared; declining changes nothing; going ahead rebuilds the schedule.
test('warns before a re-publish clears scores, changes nothing on Cancel, and rebuilds on Continue', async ({
  page,
}, info) => {
  const db = adminClient();
  const day = clockInZone(new Date(), 'Pacific/Auckland').date;
  const must = <T>(r: { data: T; error: unknown }): NonNullable<T> => {
    if (r.error) throw r.error;
    return r.data!;
  };
  const event = must(
    await db
      .from('events')
      .insert({
        owner_id: organiser.id,
        name: `Republish ${info.project.name}`,
        status: 'draft',
        published_at: new Date(Date.now() - 86_400_000).toISOString(),
        schedule_days: [day],
        courts: 1,
        court_names: ['Court 1'],
        timezone: 'Pacific/Auckland',
      })
      .select('id')
      .single(),
  );
  const division = must(
    await db.from('divisions').insert({ event_id: event.id, name: 'Open', color: '#6C63FF' }).select('id').single(),
  );
  const teams = must(
    await db
      .from('teams')
      .insert(['Hawks', 'Bolts', 'Owls'].map((name, i) => ({ division_id: division.id, name, sort_order: i })))
      .select('id, name'),
  );
  const team = (n: string) => teams.find((t) => t.name === n)!.id;
  const [scored] = must(
    await db
      .from('games')
      .insert({
        event_id: event.id,
        division_id: division.id,
        day,
        start_time: '09:00',
        court: 1,
        team1_id: team('Hawks'),
        team2_id: team('Bolts'),
        label: 'Open',
        type: 'group',
        is_playoff: false,
        position: 0,
      })
      .select('id'),
  );
  must(
    await db.from('game_scores').insert({ game_id: scored!.id, event_id: event.id, s1: 50, s2: 40 }).select('game_id'),
  );
  const state = async () => {
    const [{ data: e }, { data: games }, { data: scores }] = await Promise.all([
      db.from('events').select('status').eq('id', event.id).single(),
      db.from('games').select('id').eq('event_id', event.id),
      db.from('game_scores').select('game_id, s1, s2').eq('event_id', event.id),
    ]);
    return { status: e!.status, games: (games ?? []).map((g) => g.id).sort(), scores };
  };
  const before = await state();

  await signInAndWait(page, organiser);
  await page.goto(`/admin/events/${event.id}`);
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Publish', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Re-publish this event?' });
  await expect(dialog).toContainText(
    'Re-publishing rebuilds the whole schedule from scratch. 1 recorded score will be cleared. Continue?',
  );

  // Declining changes nothing: same status, same games, the score kept.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Publish', exact: true })).toBeFocused();
  expect(await state()).toEqual(before);
  expect(before.scores).toEqual([{ game_id: scored!.id, s1: 50, s2: 40 }]);

  // Going ahead rebuilds from scratch: published, a full round robin for 3 teams, no scores left.
  await main.getByRole('button', { name: 'Publish', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Re-publish this event?' })
    .getByRole('button', { name: 'Continue', exact: true })
    .click();
  await expect(main.getByRole('status')).toHaveText('Published with 3 games.');
  const after = await state();
  expect(after.status).toBe('published');
  expect(after.scores).toEqual([]);
  expect(after.games).toHaveLength(3);
  expect(after.games).not.toContain(scored!.id);
  const { data: audit } = await db
    .from('audit_log')
    .select('action')
    .eq('event_id', event.id)
    .eq('action', 'event.republish');
  expect(audit).toHaveLength(1);
});
