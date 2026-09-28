import { expect, test } from '@playwright/test';

test('the signed-in header and dashboard events fit a phone without horizontal scrolling', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/prototype/platform?screen=dashboard');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();
  expect(await nav.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await nav.evaluate((element) => element.clientWidth),
  );
  const events = page.getByTestId('dashboard-mobile-list');
  await expect(events).toBeVisible();
  expect(await events.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await events.evaluate((element) => element.clientWidth),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await expect(events.locator('strong', { hasText: 'Eastside Friday League' })).toBeVisible();
  await expect(events.getByRole('link', { name: 'Edit Eastside Friday League' })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 844 });
  expect(await nav.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await nav.evaluate((element) => element.clientWidth),
  );
  expect(await events.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await events.evaluate((element) => element.clientWidth),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
