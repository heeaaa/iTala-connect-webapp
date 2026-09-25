import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { fixtures, signIn } from './fixtures';

/*
 * Public pages (phase 4), MIGRATION_PLAN.md section 10:
 *   journey 3  score entry reaches a second browser live; standings and the playoff seed update
 *   journey 6  team filter, tabs in the URL, legacy hash redirect
 *   journey 8  a draft is not visible publicly
 * Runs against the local Supabase stack with data from seed-public-event.ts.
 */

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
}

async function pickTeam(page: Page, name: string) {
  const toggle = page.getByRole('button', { name: 'Find your team' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name, exact: true }).click();
}

test.describe('Home (PRD H-01 to H-05)', () => {
  test('lists published events with dates, never drafts', async ({ page }) => {
    const { publicEvent, events } = fixtures();
    await page.goto('/');
    const card = page.getByRole('link', { name: new RegExp(publicEvent.name) });
    await expect(card).toBeVisible();
    await expect(card).toContainText('1 division');
    await expect(card).toContainText(/\d{2}\/\d{2}\/\d{4} to \d{2}\/\d{2}\/\d{4}/);
    await expect(page.getByText(events.aDraft)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
  });
});

test.describe('Public event page (journey 6)', () => {
  test('tabs live in the URL and every tab is accessible', async ({ page }) => {
    const { publicEvent } = fixtures();
    await page.goto(`/events/${publicEvent.id}`);
    await expect(page.getByRole('heading', { level: 1, name: publicEvent.name })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Court 1' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    for (const [tab, check] of [
      ['Standings', page.getByRole('region', { name: 'Open standings' })],
      ['Teams', page.getByText('Hawks')],
      ['Rules', page.getByRole('heading', { name: 'Timing' })],
    ] as const) {
      await page.getByRole('link', { name: tab, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`tab=${tab.toLowerCase()}`));
      await expect(check.first()).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    }
    // Rules are sanitised: the seeded script never runs (E-71).
    expect(await page.evaluate(() => (window as { __xss?: boolean }).__xss)).toBeUndefined();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Timing' })).toBeVisible();
  });

  test('teams expand to the roster', async ({ page }) => {
    const { publicEvent } = fixtures();
    await page.goto(`/events/${publicEvent.id}?tab=teams`);
    await page.getByText('Hawks').click();
    await expect(page.getByText('Coach: Sam')).toBeVisible();
    await expect(page.getByText('#4')).toBeVisible();
  });

  test('the team filter steps other games back and is remembered', async ({ page }) => {
    const { publicEvent } = fixtures();
    await page.goto(`/events/${publicEvent.id}`);
    await pickTeam(page, 'Hawks');
    await expect(page.getByRole('heading', { name: 'Your team: Hawks' })).toBeVisible();
    await expect(page.locator('article[data-match="false"]')).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your team: Hawks' })).toBeVisible();
  });

  test('old #/event links redirect, unknown ones are a 404', async ({ page }) => {
    const { publicEvent } = fixtures();
    await page.goto(`/#/event/${publicEvent.legacyId}`);
    await expect(page).toHaveURL(new RegExp(`/events/${publicEvent.id}$`));
    const missing = await page.goto('/l/-NdoesNotExist');
    expect(missing?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible();
  });

  test('share previews carry the event name', async ({ page }) => {
    const { publicEvent } = fixtures();
    await page.goto(`/events/${publicEvent.id}`);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', publicEvent.name);
  });
});

test.describe('Drafts (journey 8, PRD A-06, N-04)', () => {
  test('a draft is a 404 to the public and a preview to its owner', async ({ page }) => {
    const { events, users } = fixtures();
    const res = await page.goto(`/events/${events.aDraftId}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible();

    await signIn(page, users.adminA);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto(`/events/${events.aDraftId}`);
    await expect(page.getByText('Draft preview. Only you can see this until the event is published.')).toBeVisible();
  });

  test('a malformed event id is a 404', async ({ page }) => {
    const res = await page.goto('/events/not-an-id');
    expect(res?.status()).toBe(404);
  });
});

test.describe('Live scores (journey 3, PRD P-06 to P-09)', () => {
  test('an owner enters a score; a spectator sees it live, with standings and the final seeded', async ({
    browser,
  }) => {
    test.slow();
    const { publicEvent, users } = fixtures();

    const spectator = await (await browser.newContext()).newPage();
    await spectator.goto(`/events/${publicEvent.id}?tab=standings`);
    const firstRow = spectator.getByRole('row').nth(1);
    await expect(firstRow).toContainText('Hawks');
    await expect(spectator.getByText('Live. Scores update automatically.')).toHaveCount(0); // not on Standings

    const owner = await (await browser.newContext()).newPage();
    await signIn(owner, users.adminA);
    await expect(owner).toHaveURL(/\/admin$/);
    await owner.goto(`/events/${publicEvent.id}`);
    await owner.getByRole('textbox', { name: /^Owls score, 9:00 am/ }).fill('60');
    await owner.getByRole('textbox', { name: /^Lynx score, 9:00 am/ }).fill('30');

    // Realtime: no reload on the spectator's page.
    await expect(firstRow).toContainText('Owls', { timeout: 15_000 });
    await expect(firstRow).toContainText('+30');

    await spectator.goto(`/events/${publicEvent.id}?day=${publicEvent.tomorrow}`);
    const final = spectator.locator('article', { hasText: 'Open - Finals' });
    await expect(final).toContainText('Owls');
    await expect(final).toContainText('Hawks');
  });
});
