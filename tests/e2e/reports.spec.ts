import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { signInAndWait } from './fixtures';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

/*
 * The Reports tab on a real event (local Supabase): an organiser picks the event, the league,
 * a day on the calendar and all its games or one game, reads the box scores, and saves a fixed
 * report. Scores only here: player stats need the mobile reports reader, which is not set up in
 * tests, so each side shows its final score. The prototype spec covers player lines and totals.
 */

let organiser: TestUser;
test.beforeEach(async () => {
  organiser = await createUser('admin', { tag: 'reports-e2e', name: 'Reports organiser' });
});
test.afterEach(async () => {
  if (organiser) await deleteUsers([organiser]);
});

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
}

test('an organiser builds a day of box scores, one game, and a fixed report', async ({ page }, info) => {
  const db = adminClient();
  const must = <T>(r: { data: T; error: unknown }): NonNullable<T> => {
    if (r.error) throw r.error;
    return r.data!;
  };
  const name = `Reports ${info.project.name}`;
  const event = must(
    await db
      .from('events')
      .insert({
        owner_id: organiser.id,
        name,
        status: 'draft',
        schedule_days: ['2026-10-03', '2026-10-10'],
        courts: 2,
        court_names: ['Court 1', 'Court 2'],
        timezone: 'Pacific/Auckland',
      })
      .select('id')
      .single(),
  );
  const divisions = must(
    await db
      .from('divisions')
      .insert([
        { event_id: event.id, name: 'Open', color: '#6C63FF' },
        { event_id: event.id, name: 'Women', color: '#2BBF8A' },
      ])
      .select('id, name'),
  );
  const division = (n: string) => divisions.find((d) => d.name === n)!.id;
  const teams = must(
    await db
      .from('teams')
      .insert([
        ...['Aces', 'Blues', 'Comets'].map((n, i) => ({ division_id: division('Open'), name: n, sort_order: i })),
        ...['Tūī', 'Kea'].map((n, i) => ({ division_id: division('Women'), name: n, sort_order: i })),
      ])
      .select('id, name'),
  );
  const team = (n: string) => teams.find((t) => t.name === n)!.id;
  const slot = (d: string, day: string, time: string, court: number, a: string, b: string) => ({
    event_id: event.id,
    division_id: division(d),
    day,
    start_time: time,
    court,
    team1_id: team(a),
    team2_id: team(b),
    label: d,
    type: 'group',
    is_playoff: false,
  });
  const games = must(
    await db
      .from('games')
      .insert([
        slot('Open', '2026-10-03', '18:00', 1, 'Aces', 'Blues'),
        slot('Open', '2026-10-03', '19:00', 1, 'Comets', 'Aces'),
        slot('Women', '2026-10-03', '18:00', 2, 'Tūī', 'Kea'),
        slot('Open', '2026-10-10', '18:00', 1, 'Blues', 'Comets'),
      ])
      .select('id, team1_id, start_time, day'),
  );
  const game = (home: string, day = '2026-10-03') => games.find((g) => g.team1_id === team(home) && g.day === day)!.id;
  must(
    await db
      .from('game_scores')
      .insert([
        { game_id: game('Aces'), event_id: event.id, s1: 50, s2: 40 },
        { game_id: game('Comets'), event_id: event.id, s1: 30, s2: 45 },
        { game_id: game('Tūī'), event_id: event.id, s1: 33, s2: 35 },
      ])
      .select('game_id'),
  );

  await signInAndWait(page, organiser);
  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible();
  await expect(page.getByText('Choose an event to see its leagues, teams and games.')).toBeVisible();

  // The event's leagues, teams and games load as soon as it is chosen, with no submit.
  await page.getByRole('combobox', { name: 'Event' }).selectOption({ label: name });
  await expect(page).toHaveURL(new RegExp(`/admin/reports\\?template=results&event=${event.id}$`));
  await page.getByRole('combobox', { name: 'Report' }).selectOption({ label: 'Game Box Score Book' });
  await page.getByRole('combobox', { name: 'League / division' }).selectOption({ label: 'Open' });
  const teamOptions = page.getByRole('combobox', { name: 'Team' }).locator('option');
  await expect(teamOptions).toHaveCount(4);
  await expect(page.getByRole('combobox', { name: 'Team' })).not.toContainText('Kea');

  // One day: the calendar opens on the latest day with scores and narrows the games.
  await page.getByText('One day', { exact: true }).click();
  const calendar = page.getByRole('group', { name: 'Choose a day' });
  await expect(calendar.getByRole('button', { name: 'Sat 03/10/2026, 2 games' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('combobox', { name: 'Game' }).locator('option')).toHaveText([
    'All 2 games on Sat 03/10/2026',
    '6:00 pm · Aces 50 - 40 Blues',
    '7:00 pm · Comets 30 - 45 Aces',
  ]);
  await expect(page).not.toHaveURL(/preview=1/);
  await expectNoSeriousA11yViolations(page);

  // All games on the day.
  await page.getByRole('button', { name: 'Show report' }).click();
  await expect(page).toHaveURL(/preview=1/);
  await expect(page.getByRole('heading', { name: 'Game Box Score Book' })).toBeVisible();
  await expect(page.getByText(`${name} · 2 games`)).toBeVisible();
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'Sat 03/10/2026 · 6:00 pm · Open: Aces 50 - 40 Blues',
    'Sat 03/10/2026 · 7:00 pm · Open: Comets 30 - 45 Aces',
  ]);
  const first = page.getByRole('region', { name: 'Sat 03/10/2026 · 6:00 pm · Open: Aces 50 - 40 Blues table' });
  await expect(first.locator('thead th')).toHaveText(['Player', 'Points', '2PT made', '3PT made', 'FT made']);
  // Scores only: each team's block holds its final score.
  await expect(first.getByRole('row')).toHaveText([
    'PlayerPoints2PT made3PT madeFT made',
    'Aces',
    'Final score50---',
    'Blues',
    'Final score40---',
  ]);
  await expectNoSeriousA11yViolations(page);

  // A day whose only game has no score yet says so.
  await calendar.getByRole('button', { name: 'Sat 10/10/2026, 1 game' }).click();
  await expect(page.getByRole('combobox', { name: 'Game' }).locator('option')).toHaveText([
    'All 1 game on Sat 10/10/2026',
    '6:00 pm · Blues vs Comets (no score yet)',
  ]);
  await page.getByRole('button', { name: 'Show report' }).click();
  await expect(page).toHaveURL(/dates=2026-10-10/);
  await expect(page.getByText(`${name} · 0 games · 1 left out`)).toBeVisible();
  await expect(page.getByText('No games with a score match this selection. Try other dates or games.')).toBeVisible();

  // One game, then a fixed report with its downloads.
  await page
    .getByRole('group', { name: 'Choose a day' })
    .getByRole('button', { name: 'Sat 03/10/2026, 2 games' })
    .click();
  await page.getByRole('combobox', { name: 'Game' }).selectOption({ label: '7:00 pm · Comets 30 - 45 Aces' });
  await page.getByRole('button', { name: 'Show report' }).click();
  await expect(page).toHaveURL(new RegExp(`game=${game('Comets')}`));
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'Sat 03/10/2026 · 7:00 pm · Open: Comets 30 - 45 Aces',
  ]);
  await page.getByRole('button', { name: 'Create fixed report and downloads' }).click();
  await expect(page.getByRole('heading', { name: 'Saved report', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'Sat 03/10/2026 · 7:00 pm · Open: Comets 30 - 45 Aces',
  ]);
  const pdf = await page.request.get(
    await page.getByRole('link', { name: 'Download PDF' }).getAttribute('href').then(String),
  );
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
});
