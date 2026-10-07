import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * The Reports form and box scores on SAMPLE data (/prototype/reports): the real form and report
 * builder, with player stats as approved mobile results carry them. Runs at 390 px and 1440 px.
 * The same form on /admin/reports with a database is covered by reports.spec.ts.
 */

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
}

async function noSidewaysScroll(page: Page) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

const options = (page: Page, name: string) => page.getByRole('combobox', { name }).locator('option');

test('an organiser picks a league, a day and its games, and reads each box score with team totals', async ({
  page,
}) => {
  await page.goto('/prototype/reports');
  await expect(page.getByText('Choose an event to see its leagues, teams and games.')).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Choosing the event loads its leagues, teams and games straight away.
  await page.getByRole('combobox', { name: 'Event' }).selectOption({ label: 'Te Whānau League 2026' });
  await expect(page).toHaveURL(/\/prototype\/reports\?template=results&event=/);
  await expect(page.getByRole('combobox', { name: 'League / division' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Report' }).selectOption({ label: 'Game Box Score Book' });
  await page.getByRole('combobox', { name: 'League / division' }).selectOption({ label: 'Open' });
  await expect(options(page, 'Team')).toHaveText([
    'All teams',
    'Kōwhai Warriors',
    'Te Kapa Rangi',
    'Harbour Hawks',
    'Night Owls',
  ]);

  // One day: the calendar opens on the latest day with scores, and the games follow the day chosen.
  await page.getByText('One day', { exact: true }).click();
  const calendar = page.getByRole('group', { name: 'Choose a day' });
  await expect(calendar.getByRole('button', { name: 'Sat 10/10/2026, 2 games' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await calendar.getByRole('button', { name: 'Sat 03/10/2026, 2 games' }).click();
  await expect(page.getByText('Sat 03/10/2026 · 2 games')).toBeVisible();
  await expect(options(page, 'Game')).toHaveText([
    'All 2 games on Sat 03/10/2026',
    '6:00 pm · Kōwhai Warriors 38 - 35 Te Kapa Rangi',
    '7:00 pm · Harbour Hawks 34 - 28 Night Owls',
  ]);
  // Nothing was built yet: only "Show report" does that.
  await expect(page).not.toHaveURL(/preview=1/);
  await expect(page.getByRole('heading', { name: 'Game Box Score Book' })).toHaveCount(0);
  await noSidewaysScroll(page);
  await expectNoSeriousA11yViolations(page);

  // All games on the day.
  await page.getByRole('button', { name: 'Show report' }).click();
  await expect(page).toHaveURL(/preview=1/);
  await expect(page).toHaveURL(/dateMode=day/);
  await expect(page).toHaveURL(/dates=2026-10-03/);
  await expect(page.getByRole('heading', { name: 'Game Box Score Book' })).toBeVisible();
  await expect(page.getByText('Te Whānau League 2026 · 2 games')).toBeVisible();
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'Player totals · 2 games',
    'Sat 03/10/2026 · 6:00 pm · Open: Kōwhai Warriors 38 - 35 Te Kapa Rangi',
    'Sat 03/10/2026 · 7:00 pm · Open: Harbour Hawks 34 - 28 Night Owls',
  ]);
  const first = page.getByRole('region', {
    name: 'Sat 03/10/2026 · 6:00 pm · Open: Kōwhai Warriors 38 - 35 Te Kapa Rangi table',
  });
  // Each team heads its own block; the player column stays in view while the stats scroll.
  await expect(first.locator('thead th')).toHaveText(['Player', 'Points', '2PT made', '3PT made', 'FT made']);
  await expect(first.getByRole('row')).toHaveText([
    'PlayerPoints2PT made3PT madeFT made',
    'Kōwhai Warriors',
    'Māia Te Aroha21623',
    'Ari Ngata11410',
    'Sam Tipene6202',
    'Team total381235',
    'Te Kapa Rangi',
    'Rua Parata14511',
    'Hemi Walker12320',
    'Tāne Rewi8204',
    'Team (no player)1001',
    'Team total351036',
  ]);
  await expect(first.getByRole('cell', { name: 'Māia Te Aroha' })).toHaveCSS('position', 'sticky');
  // The form stays filled in with what was shown.
  await expect(page.getByRole('combobox', { name: 'League / division' })).toHaveValue(/.+/);
  await expect(page.getByRole('radio', { name: 'One day' })).toBeChecked();
  await noSidewaysScroll(page);
  await expectNoSeriousA11yViolations(page);

  // One game.
  await page
    .getByRole('combobox', { name: 'Game' })
    .selectOption({ label: '7:00 pm · Harbour Hawks 34 - 28 Night Owls' });
  await page.getByRole('button', { name: 'Show report' }).click();
  await expect(page).toHaveURL(/game=/);
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'Sat 03/10/2026 · 7:00 pm · Open: Harbour Hawks 34 - 28 Night Owls',
  ]);
  await expect(page.getByRole('row', { name: /^Bea Cooper 19/ })).toBeVisible();
});

test('a recorded total that differs from the official score shows the final score under it', async ({ page }) => {
  await page.goto('/prototype/reports');
  await page.getByRole('combobox', { name: 'Event' }).selectOption({ label: 'Te Whānau League 2026' });
  await expect(page.getByRole('combobox', { name: 'League / division' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Report' }).selectOption({ label: 'Game Box Score Book' });
  await page.getByText('One day', { exact: true }).click();
  await expect(page.getByText('Sat 10/10/2026 · 3 games')).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Game' })
    .selectOption({ label: '7:00 pm · Open · Te Kapa Rangi 34 - 25 Night Owls' });
  await page.getByRole('button', { name: 'Show report' }).click();
  const box = page.getByRole('region', {
    name: 'Sat 10/10/2026 · 7:00 pm · Open: Te Kapa Rangi 34 - 25 Night Owls table',
  });
  const rangi = box.locator('tbody').filter({ hasText: 'Te Kapa Rangi' });
  await expect(rangi.getByRole('row', { name: /^Team total 32/ })).toBeVisible();
  await expect(rangi.getByRole('row', { name: /^Final score \(2 not in player stats\) 34/ })).toBeVisible();
  // Night Owls' recorded total matches their score, so they have no extra line.
  await expect(box.getByRole('row', { name: /^Final score/ })).toHaveCount(1);
});

test('a team report asks for a team before building, and a range is chosen in two clicks', async ({ page }) => {
  await page.goto('/prototype/reports');
  await page.getByRole('combobox', { name: 'Event' }).selectOption({ label: 'Te Whānau League 2026' });
  await expect(page.getByRole('combobox', { name: 'League / division' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Report' }).selectOption({ label: 'Cumulative Team Statistics' });
  await page.getByRole('button', { name: 'Show report' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a team for team statistics.' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Team' })).toBeFocused();
  await expect(page).not.toHaveURL(/preview=1/);

  await page.getByRole('combobox', { name: 'Team' }).selectOption({ label: 'Kea' });
  await page.getByText('Date range', { exact: true }).click();
  const range = page.getByRole('group', { name: 'Choose the first and last day' });
  await range.getByRole('button', { name: 'Sat 10/10/2026, 1 game' }).click();
  await range.getByRole('button', { name: 'Sat 03/10/2026, 1 game' }).click();
  await expect(page.getByText('Sat 03/10/2026 to Sat 10/10/2026 · 2 games')).toBeVisible();
  await page.getByRole('button', { name: 'Show report' }).click();
  await expect(page).toHaveURL(/dates=2026-10-03%2C2026-10-10/);
  await expect(page.getByRole('heading', { name: 'Cumulative Team Statistics' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Team summary table' }).getByRole('row', { name: /^Kea 2 78/ }),
  ).toBeVisible();
  await noSidewaysScroll(page);
});
