import { expect, test, type Locator, type Page } from '@playwright/test';
import { formatTime } from '@/lib/format';
import { signInAndWait } from './fixtures';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

// On a published event the schedule's drag and drop adds dnd-kit's own live
// region (role="status") to <body>, so status checks look inside main.

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
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Published with 1 game.');
  await expect(page.getByText('Published event', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Open summary' })).toContainText('1 game');

  const { data: games } = await adminClient().from('games').select('team1_id, team2_id, label').eq('event_id', eventId);
  expect(games).toHaveLength(1);
  expect(games![0]!.label).toBe('Open');

  // Published editing: hours autosave (E-05) and the moved game is reported (E-14).
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await page.getByLabel('Daily start time', { exact: true }).fill('10:00');
  await expect(page.getByRole('main').getByRole('status')).toHaveText(
    "Saved. 1 game moved to Unscheduled because it no longer fits the event's days, hours or courts.",
  );
  const { data: moved } = await adminClient().from('games').select('day, court').eq('event_id', eventId).single();
  expect(moved).toEqual({ day: null, court: null });
  // Team edits need Save, and reach the public page.
  await page.getByLabel('Team 2 name', { exact: true }).fill('Harbour Rats');
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Saved');

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
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Published with 3 games.');
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
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Game added.');
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
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Game deleted.');
  await expect(unscheduled).toContainText('Drop a game here to clear its time slot.');
  const { count } = await adminClient()
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);
  expect(count).toBe(3);
});

async function mouseDrag(page: Page, handle: Locator, target: Locator) {
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await target.scrollIntoViewIfNeeded();
  const to = (await target.boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  // dnd-kit's injected styles move the lifted card; if the CSP blocked them (a stale nonce after a
  // client-side navigation or a refresh), translate stays none and the card no longer follows.
  await expect(page.locator('[data-dnd-dragging]')).not.toHaveCSS('translate', 'none');
  await page.mouse.up();
}

// E-45: keyboard and mouse drag and drop on a published schedule, with the stored result checked.
test('moves, swaps and unschedules games by drag and drop, warning about short rest', async ({ page }, info) => {
  await signInAndWait(page, organiser);
  await page.getByRole('link', { name: '+ New event', exact: true }).click();
  await page.getByLabel('Event name', { exact: true }).fill(`Drag ${info.project.name}`);
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
  const main = page.getByRole('main');
  await expect(main.getByRole('status')).toHaveText('Published with 3 games.');

  const db = adminClient();
  const { data: teams } = await db
    .from('teams')
    .select('id, name, divisions!inner(event_id)')
    .eq('divisions.event_id', eventId);
  const teamName = new Map(teams!.map((t) => [t.id, t.name]));
  const stored = async () =>
    (await db.from('games').select('id, day, start_time, court, team1_id, team2_id').eq('event_id', eventId)).data!;
  const before = (await stored()).sort((a, b) => a.start_time!.localeCompare(b.start_time!));
  // Three teams: every pair of games shares a team, so the scheduler keeps them at least 2 hours apart.
  const [first, second, third] = before;
  const matchup = (g: (typeof before)[number]) => `${teamName.get(g.team1_id!)} vs ${teamName.get(g.team2_id!)}`;
  const moveButton = (g: (typeof before)[number]) =>
    main.getByRole('button', { name: `Move ${matchup(g)}`, exact: true });
  const grid = main.getByRole('region', { name: / schedule$/ });
  const cell = (time: string) =>
    grid
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: formatTime(time.slice(0, 5)), exact: true }) })
      .getByRole('cell')
      .first();
  const status = main.locator('p[aria-live="polite"]');
  const hour = (g: (typeof before)[number], add: number) =>
    `${String(Number(g.start_time!.slice(0, 2)) + add).padStart(2, '0')}:00`;
  const oneHourLater = hour(first!, 1);
  // Precondition for the rest warning: the second game follows two hours after the first.
  expect(second!.start_time).toBe(`${hour(first!, 2)}:00`);

  // Keyboard: Tab mid-drag cancels rather than dropping.
  await moveButton(first!).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(moveButton(first!)).toBeFocused();
  await expect(cell(first!.start_time!)).toContainText(matchup(first!));

  // Keyboard: pick up, one row down to the free slot an hour later, drop.
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await expect(cell(oneHourLater)).toHaveAttribute('data-drop-target', 'true');
  await page.keyboard.press('Space');
  await expect(status).toContainText(`Moved ${matchup(first!)} (Open) to `);
  // One hour from the second game, which shares a team: moved anyway, with a warning.
  await expect(status).toContainText('Rest warning:');
  await expect(moveButton(first!)).toBeFocused();
  await expect(cell(oneHourLater)).toContainText(matchup(first!));
  let now = await stored();
  expect(now.find((g) => g.id === first!.id)).toMatchObject({ start_time: `${oneHourLater}:00`, court: 1 });

  // Mouse: drop the third game on the first one, and they swap slots.
  await mouseDrag(page, moveButton(third!), cell(oneHourLater));
  await expect(status).toContainText(`Swapped ${matchup(third!)} (Open) and ${matchup(first!)} (Open).`);
  now = await stored();
  expect(now.find((g) => g.id === third!.id)).toMatchObject({ start_time: `${oneHourLater}:00` });
  expect(now.find((g) => g.id === first!.id)).toMatchObject({ start_time: third!.start_time });

  // Mouse: drop the second game on Unscheduled.
  const unscheduled = main.getByRole('region', { name: 'Unscheduled games' });
  await mouseDrag(page, moveButton(second!), unscheduled.getByRole('heading'));
  await expect(status).toContainText(`Moved ${matchup(second!)} (Open) to Unscheduled.`);
  await expect(unscheduled).toContainText(matchup(second!));
  now = await stored();
  expect(now.find((g) => g.id === second!.id)).toMatchObject({ day: null, start_time: null, court: null });

  // Drag and drop never touches scores, and the page never scrolls sideways.
  const { count } = await db
    .from('game_scores')
    .select('game_id', { count: 'exact', head: true })
    .eq('event_id', eventId);
  expect(count).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});
