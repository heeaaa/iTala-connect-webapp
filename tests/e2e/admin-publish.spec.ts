import { expect, test } from '@playwright/test';
import { signInAndWait } from './fixtures';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

let organiser: TestUser;
test.beforeEach(async () => {
  organiser = await createUser('admin', { tag: 'publish-e2e', name: 'Publish organiser' });
});
test.afterEach(async () => {
  if (organiser) await deleteUsers([organiser]);
});

// Journey 1: create an event, add a division and teams, publish, see the schedule.
test('creates an event, refuses an incomplete publish, then publishes and shows the schedule', async ({
  page,
}, info) => {
  const name = `Publish ${info.project.name}`;
  await signInAndWait(page, organiser);
  await page.getByRole('link', { name: '+ New event', exact: true }).click();
  await page.getByLabel('Event name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]+\?created=1/);
  const eventId = new URL(page.url()).pathname.split('/').pop()!;

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Please select at least one event date on the calendar.',
  );

  await page.getByRole('group', { name: 'Choose event dates' }).getByRole('button').first().click();
  await page.getByRole('button', { name: '+ Add division', exact: true }).click();
  await page.getByLabel('Division 1 name', { exact: true }).fill('Open');
  await page.getByRole('button', { name: '+ Add team', exact: true }).click();
  await page.getByLabel('Team 1 name', { exact: true }).fill('Hawks');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Each division needs at least 2 teams. Add teams to: Open.',
  );

  await page.getByRole('button', { name: '+ Add team', exact: true }).click();
  await page.getByLabel('Team 2 name', { exact: true }).fill('Rats');
  await expect(page.getByRole('region', { name: 'Open matchups' })).toContainText('Rats');
  // Publish saves the unsaved teams first, then publishes the saved event.
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Published with 1 game.');
  await expect(page.getByText('Published event', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Open summary' })).toContainText('1 game');

  const { data: games } = await adminClient().from('games').select('team1_id, team2_id, label').eq('event_id', eventId);
  expect(games).toHaveLength(1);
  expect(games![0]!.label).toBe('Open');

  // Published editing: hours autosave (E-05) and the moved game is reported (E-14).
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await page.getByLabel('Daily start time', { exact: true }).fill('10:00');
  await expect(page.getByRole('status')).toHaveText(
    "Saved. 1 game moved to Unscheduled because it no longer fits the event's days, hours or courts.",
  );
  const { data: moved } = await adminClient().from('games').select('day, court').eq('event_id', eventId).single();
  expect(moved).toEqual({ day: null, court: null });
  // Team edits need Save, and reach the public page.
  await page.getByLabel('Team 2 name', { exact: true }).fill('Harbour Rats');
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');

  await page.goto(`/events/${eventId}?tab=teams`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText('Hawks')).toBeVisible();
  await expect(page.getByText('Harbour Rats')).toBeVisible();
});

// E-44 to E-49: the game dialog on a published schedule, with the stored result checked.
test('adds, validates, edits and deletes games on the published schedule', async ({ page }, info) => {
  await signInAndWait(page, organiser);
  await page.getByRole('link', { name: '+ New event', exact: true }).click();
  await page.getByLabel('Event name', { exact: true }).fill(`Schedule ${info.project.name}`);
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]+\?created=1/);
  const eventId = new URL(page.url()).pathname.split('/').pop()!;
  await page.getByRole('group', { name: 'Choose event dates' }).getByRole('button').first().click();
  await page.getByRole('button', { name: '+ Add division', exact: true }).click();
  await page.getByLabel('Division 1 name', { exact: true }).fill('Open');
  for (const [i, team] of ['Hawks', 'Owls', 'Kea'].entries()) {
    await page.getByRole('button', { name: '+ Add team', exact: true }).click();
    await page.getByLabel(`Team ${i + 1} name`, { exact: true }).fill(team);
  }
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Published with 3 games.');
  const main = page.getByRole('main');
  const unscheduled = main.getByRole('region', { name: 'Unscheduled games' });

  // Add an unscheduled game.
  await main.getByRole('button', { name: '+ Add game', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Add game' });
  await dialog.getByLabel('Day').selectOption({ label: 'Unscheduled' });
  await dialog.getByLabel('Team 1').selectOption({ label: 'Hawks (Open)' });
  await dialog.getByLabel('Team 2').selectOption({ label: 'Hawks (Open)' });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText("A team can't play itself. Pick two different teams.");
  await dialog.getByLabel('Team 2').selectOption({ label: 'Kea (Open)' });
  await dialog.getByLabel('Label').fill('Friendly');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Game added.');
  await expect(unscheduled).toContainText('FriendlyHawks vs Kea');

  // Moving it onto a taken slot is refused with the slot named.
  const { data: taken } = await adminClient()
    .from('games')
    .select('day, start_time, court')
    .eq('event_id', eventId)
    .not('day', 'is', null)
    .order('position')
    .limit(1)
    .single();
  await unscheduled.getByRole('button', { name: /^Edit/ }).click();
  dialog = page.getByRole('dialog', { name: 'Edit game' });
  await dialog.getByLabel('Day').selectOption(taken!.day!);
  await dialog.getByLabel('Time').fill(taken!.start_time!.slice(0, 5));
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('is already taken.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  // Delete it, with confirmation.
  await unscheduled.getByRole('button', { name: /^Edit/ }).click();
  dialog = page.getByRole('dialog', { name: 'Edit game' });
  await dialog.getByRole('button', { name: 'Delete game', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete this game?' })
    .getByRole('button', { name: 'Delete game', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Game deleted.');
  await expect(unscheduled).toContainText('Drop a game here to clear its time slot.');
  const { count } = await adminClient()
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);
  expect(count).toBe(3);
});
