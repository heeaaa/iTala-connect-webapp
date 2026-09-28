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
  // Compare with the configured viewport: mobile emulation widens innerWidth to fit overflowing content.
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test.describe('Today screen prototype (sample data)', () => {
  test('score fields stay inside game cards with long team names on a phone', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile');
    await page.goto('/prototype/today?owner=1');
    await page.locator('[class*="cellTeamName"]').evaluateAll((names) => {
      for (const [index, name] of names.entries()) {
        name.textContent = index % 2 === 0 ? 'GENTLEMEN’S BASKETBALL CLUB' : 'DENTIO DENTAL ALLIANCE 35+';
      }
    });
    const fields = page.getByRole('textbox', { name: /score,/ });
    expect(await fields.count()).toBeGreaterThan(0);
    for (const field of await fields.all()) {
      const dimensions = await field.evaluate((input) => {
        const card = input.closest('article')!;
        return { fieldRight: input.getBoundingClientRect().right, cardRight: card.getBoundingClientRect().right };
      });
      expect(dimensions.fieldRight).toBeLessThanOrEqual(dimensions.cardRight);
    }
    await noSidewaysScroll(page);
  });

  test('mobile dates have a neutral scrollbar and final game cells stay compact', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile');
    await page.goto('/prototype/today?owner=1&day=2026-09-11');
    const strip = page.getByRole('navigation', { name: 'Game days' }).locator('ul');
    const scrollbar = await strip.evaluate((element) => getComputedStyle(element).scrollbarColor);
    const muted = await strip.evaluate((element) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ev-muted)';
      element.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(scrollbar.startsWith(muted)).toBe(true);

    const first = page.getByRole('region', { name: 'Games by time and court' }).locator('article').first();
    expect((await first.boundingBox())!.height).toBeLessThan(170);
    const locked = first.getByRole('textbox', { name: /score,/ }).first();
    expect(await locked.evaluate((input) => getComputedStyle(input).borderTopWidth)).toBe('1px');
    expect((await locked.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await locked.evaluate((input: HTMLInputElement) => {
      input.disabled = true;
    });
    expect(await locked.evaluate((input) => getComputedStyle(input).borderTopWidth)).toBe('0px');
  });

  test('event tabs fit without a vertical scrollbar at both viewports', async ({ page }) => {
    await page.goto('/prototype/today');
    const tabs = page.getByRole('navigation', { name: 'Event', exact: true }).locator('ul');
    expect(await tabs.evaluate((element) => element.scrollHeight)).toBeLessThanOrEqual(
      await tabs.evaluate((element) => element.clientHeight),
    );
    expect(await tabs.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
      await tabs.evaluate((element) => element.clientWidth),
    );
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await tabs.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
      await tabs.evaluate((element) => element.clientWidth),
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

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
