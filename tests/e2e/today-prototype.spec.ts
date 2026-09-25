import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * Today screen prototype (public event page, Schedule tab) with SAMPLE data.
 * Runs at 390 px and 1440 px (playwright.config projects). The real
 * /events/[eventId] journey replaces this in phase 4.
 */

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('#prototype-controls')
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Today screen prototype (sample data)', () => {
  test("a spectator finds tonight's courts, picks their team, and it is remembered", async ({ page }) => {
    await page.goto('/prototype/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Eastside Friday League' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Tonight/ })).toHaveAttribute('aria-current', 'page');

    const court1 = page.getByRole('region', { name: 'Court 1' });
    await expect(court1.getByText('On court')).toBeVisible();
    await expect(court1).toBeInViewport({ ratio: 0.3 });
    await noSidewaysScroll(page);
    await expectNoSeriousA11yViolations(page);

    const toggle = page.getByRole('button', { name: 'Find your team' });
    if (await toggle.isVisible()) await toggle.click();
    await page.getByRole('button', { name: 'Kits Ravens' }).click();
    await expect(page.getByRole('heading', { name: 'Your team: Kits Ravens' })).toBeVisible();
    await expect(page.getByText('Next: 8:00 pm')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your team: Kits Ravens' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByRole('heading', { name: /Your team/ })).toHaveCount(0);
  });

  test('another day is one tap away and stays in the URL', async ({ page }) => {
    await page.goto('/prototype/today');
    await page.getByRole('link', { name: 'Fri 09/10/2026' }).click();
    await expect(page).toHaveURL(/day=2026-10-09/);
    await expect(page.getByRole('heading', { name: 'Games on Fri 09/10/2026' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Court 1' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Games on Fri 09/10/2026' })).toBeVisible();
  });

  test("another organiser's colours, four courts and score entry stay accessible", async ({ page }) => {
    await page.goto('/prototype/today?theme=light&courts=4&owner=1');
    await expect(page.getByRole('region', { name: 'Court 4' })).toBeAttached();
    await expect(page.getByRole('textbox', { name: /score, 6:00 pm/ }).first()).toBeVisible();
    await noSidewaysScroll(page);
    await expectNoSeriousA11yViolations(page);
  });

  test('before games and when scores may be stale', async ({ page }) => {
    await page.goto('/prototype/today?at=17:30&feed=reconnecting');
    await expect(page.getByRole('status')).toHaveText('Reconnecting. Scores may be out of date.');
    await expect(page.getByRole('region', { name: 'Court 1' }).getByText('Up next')).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
