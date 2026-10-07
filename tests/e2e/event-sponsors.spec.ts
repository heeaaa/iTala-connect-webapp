import { expect, test, type Page } from '@playwright/test';

/*
 * Sponsor logos on the public event page (PRD P-01), with SAMPLE logos on
 * the Today prototype. Runs in Chromium and in WebKit (the engine of Safari
 * and of every iPad and iPhone browser) at phone, tablet and desktop sizes
 * (playwright.config projects). On an iPad (report of 07/10/2026) the logo
 * lists shrank to nothing: WebKit sized each list from its logos rather than
 * from their slots, and a clipped lazy logo never loaded.
 */

/** Every sponsor logo: loaded, its size, and whether its list shows all of it. */
function sponsorLogos(page: Page) {
  return page.getByRole('region', { name: 'Event sponsors' }).evaluate((section) =>
    [...section.querySelectorAll('ul')].flatMap((ul) => {
      const list = ul.getBoundingClientRect();
      return [...ul.querySelectorAll('img')].map((img) => {
        const box = img.getBoundingClientRect();
        return {
          list: ul.getAttribute('aria-label'),
          loaded: img.complete && img.naturalWidth > 0,
          shown: box.width > 0 && box.height > 0 && box.left >= list.left - 0.5 && box.right <= list.right + 0.5,
        };
      });
    }),
  );
}

async function openWithSponsors(page: Page, set: 'one' | 'full') {
  await page.goto(`/prototype/today?sponsors=${set}`);
  const section = page.getByRole('region', { name: 'Event sponsors' });
  // On a phone the logos sit below the schedule; bring them into view like a reader would.
  await section.scrollIntoViewIfNeeded();
  return section;
}

async function noSidewaysScroll(page: Page) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test.describe('Event sponsor logos (sample data)', () => {
  test.beforeEach(async ({ page, browserName }) => {
    // The production CSP ends with upgrade-insecure-requests. WebKit applies it
    // to the plain-http test server (Chromium exempts localhost), so every
    // script, style and logo would be asked for over https and fail. Drop only
    // that directive, and only here.
    if (browserName !== 'webkit') return;
    await page.route('**/prototype/today?**', async (route) => {
      const response = await route.fetch();
      const headers = response.headers();
      const csp = headers['content-security-policy'];
      if (csp) headers['content-security-policy'] = csp.replace(/;\s*upgrade-insecure-requests/, '');
      await route.fulfill({ response, headers });
    });
  });

  test('a lone sponsor logo loads and shows in full beside its heading', async ({ page }) => {
    const section = await openWithSponsors(page, 'one');
    await expect(section.getByRole('heading', { name: 'Sponsors', exact: true })).toBeVisible();
    await expect.poll(() => sponsorLogos(page)).toEqual([{ list: 'Sponsors', loaded: true, shown: true }]);
    await noSidewaysScroll(page);
  });

  test('the major logo and every sponsor logo load and can be seen', async ({ page }) => {
    const section = await openWithSponsors(page, 'full');
    await expect(section.getByRole('heading', { name: 'Major sponsors' })).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Sponsors', exact: true })).toBeVisible();
    await expect(section.getByRole('img', { name: 'Sponsor logo' })).toHaveCount(5);

    // Each list is at least one whole logo slot wide, never squeezed to nothing.
    for (const list of await section.getByRole('list').all()) {
      const { width, slot } = await list.evaluate((ul) => ({
        width: ul.clientWidth,
        slot: ul.querySelector('li')!.getBoundingClientRect().width,
      }));
      expect(slot).toBeGreaterThan(0);
      expect(width).toBeGreaterThanOrEqual(Math.floor(slot));
    }

    // Each logo loads once its slot is in view (a narrow list scrolls sideways to it).
    for (const [index, item] of (await section.locator('li').all()).entries()) {
      await item.scrollIntoViewIfNeeded();
      await expect.poll(async () => (await sponsorLogos(page))[index]).toMatchObject({ loaded: true, shown: true });
    }

    // On a phone (two-column grid) and on wide screens, all five fit with no sideways scrolling.
    const width = page.viewportSize()!.width;
    if (width < 768 || width >= 1100) {
      for (const list of await section.getByRole('list').all()) {
        await list.evaluate((ul) => ul.scrollTo({ left: 0 }));
      }
      expect((await sponsorLogos(page)).every((logo) => logo.loaded && logo.shown)).toBe(true);
    }
    await noSidewaysScroll(page);
  });
});
