import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInAndWait } from './fixtures';
import { file, webpSize } from './images';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

// Platform sponsors and the default rules are shared by every event, so this
// test notes what was there first and puts it back afterwards.
let superadmin: TestUser;
let before: { sponsorIds: string[]; rules: string };
test.beforeEach(async () => {
  superadmin = await createUser('superadmin', { tag: 'settings-e2e', name: 'Settings superadmin' });
  const db = adminClient();
  const [{ data: sponsors }, { data: settings }] = await Promise.all([
    db.from('platform_sponsors').select('id'),
    db.from('platform_settings').select('default_rules_html').eq('id', true).single(),
  ]);
  before = { sponsorIds: (sponsors ?? []).map((s) => s.id), rules: settings?.default_rules_html ?? '' };
});
test.afterEach(async () => {
  const db = adminClient();
  const { data: added } = await db.from('platform_sponsors').select('id, image_path');
  const extra = (added ?? []).filter((s) => !before.sponsorIds.includes(s.id));
  if (extra.length) {
    await db.storage.from('images').remove(extra.map((s) => s.image_path));
    await db
      .from('platform_sponsors')
      .delete()
      .in(
        'id',
        extra.map((s) => s.id),
      );
  }
  await db.from('platform_settings').update({ default_rules_html: before.rules }).eq('id', true);
  if (superadmin) await deleteUsers([superadmin]);
});

// S-01 and S-02: platform sponsors on every event page, and the rules new events start with.
test('manages platform sponsors and the default rules that new events start with', async ({ page }, info) => {
  const csp: string[] = [];
  await page.exposeFunction('reportCsp', (v: string) => csp.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { reportCsp: (v: string) => void }).reportCsp(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  const db = adminClient();
  const ours = async () =>
    ((await db.from('platform_sponsors').select('id, tier, image_path').order('created_at')).data ?? []).filter(
      (s) => !before.sponsorIds.includes(s.id),
    );
  const stored = async (path: string) =>
    ((await db.storage.from('images').list('platform')).data ?? []).some((f) => `platform/${f.name}` === path);

  await signInAndWait(page, superadmin);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Platform settings' })).toBeVisible();
  const main = page.getByRole('main');

  // Primary: a 2000 x 1000 PNG is shrunk in the browser and stored as WebP in the platform folder.
  await main.getByLabel('Add primary sponsors').setInputFiles(file('primary.png', 2000, 1000));
  await expect(main.getByText('1 primary sponsor added.')).toBeVisible();
  await expect(main.getByRole('img', { name: 'Primary sponsor logo 1' })).toBeVisible();
  const [primary] = await ours();
  expect(primary).toMatchObject({ tier: 'primary' });
  expect(primary!.image_path).toMatch(/^platform\/primary-[0-9a-f-]{36}\.webp$/);
  const { data: blob } = await db.storage.from('images').download(primary!.image_path);
  expect(webpSize(new Uint8Array(await blob!.arrayBuffer()))).toEqual({ width: 1600, height: 800 });

  // Secondary: two at once, then one removed with its file.
  await main.getByLabel('Add secondary sponsors').setInputFiles([file('a.png'), file('b.png')]);
  await expect(main.getByText('2 secondary sponsors added.')).toBeVisible();
  await expect(main.getByRole('img', { name: /^Secondary sponsor logo/ })).toHaveCount(2);
  const secondThere = (await ours()).filter((s) => s.tier === 'secondary')[1]!;
  await main.getByRole('button', { name: 'Remove secondary sponsor 2' }).click();
  await expect(main.getByText('Secondary sponsor removed.')).toBeVisible();
  await expect(main.getByRole('img', { name: /^Secondary sponsor logo/ })).toHaveCount(1);
  await expect(main.getByLabel('Add secondary sponsors')).toBeFocused();
  expect((await ours()).map((s) => s.tier).sort()).toEqual(['primary', 'secondary']);
  await expect.poll(() => stored(secondThere.image_path)).toBe(false);

  // Default rules: written with the toolbar and saved, cleaned on the way in.
  const rules = main.getByRole('textbox', { name: 'Default rules' });
  await rules.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('League rules');
  await main.getByRole('button', { name: 'Heading 2' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Play nice.');
  await expect(main.getByText('Unsaved changes')).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  await main.getByRole('button', { name: 'Save default rules' }).click();
  await expect(main.getByText('Default rules saved. New events will start with them.')).toBeVisible();
  const template = '<h2>League rules</h2><p>Play nice.</p>';
  expect((await db.from('platform_settings').select('default_rules_html').single()).data!.default_rules_html).toBe(
    template,
  );

  // A new event starts with those rules, and its page shows the platform sponsors.
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('link', { name: '+ New event', exact: true }).click();
  await page.getByLabel('Event name', { exact: true }).fill(`Settings ${info.project.name}`);
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]+\?created=1/);
  const eventId = new URL(page.url()).pathname.split('/').pop()!;
  expect((await db.from('events').select('rules_html').eq('id', eventId).single()).data!.rules_html).toBe(template);
  await page.goto(`/events/${eventId}?tab=rules`);
  await expect(page.getByRole('heading', { level: 2, name: 'League rules' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Sponsor logo' })).toHaveCount(2);

  // Only zod's harmless eval probe is expected.
  expect(csp.filter((v) => !v.startsWith('script-src eval'))).toEqual([]);
});
