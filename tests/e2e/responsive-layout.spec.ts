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

test('mobile event statuses align to the right edge of their rows', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/prototype/platform?screen=home');
  const first = page.locator('[class*="rundown"] > li').first();
  const row = (await first.getByRole('link').boundingBox())!;
  const status = (await first.locator('[class*="statusBug"]').boundingBox())!;
  expect(Math.abs(row.x + row.width - (status.x + status.width))).toBeLessThan(24);
});

test('desktop dashboard actions sit on one line and keep event rows compact', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/prototype/platform?screen=dashboard');
  const row = page.getByRole('region', { name: 'My events table' }).getByRole('row').nth(1);
  const actions = row.getByRole('cell').last().locator('a, button');
  const tops = await actions.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(5);
  expect((await row.boundingBox())!.height).toBeLessThan(100);

  await page.setViewportSize({ width: 768, height: 844 });
  expect((await row.boundingBox())!.height).toBeLessThan(130);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);
});
