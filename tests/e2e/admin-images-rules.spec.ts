import { expect, test } from '@playwright/test';
import { signInAndWait } from './fixtures';
import { file, webpSize } from './images';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

let organiser: TestUser;
test.beforeEach(async () => {
  organiser = await createUser('admin', { tag: 'images-e2e', name: 'Images organiser' });
});
test.afterEach(async () => {
  if (organiser) await deleteUsers([organiser]);
});

// E-15 to E-18 and E-70, E-71: images and rules on an event, stored and shown on its page.
test('uploads the logo and sponsors, writes the rules, and shows them on the event page', async ({ page }, info) => {
  // Violations are sent to the test as they happen, so none are lost when the page navigates.
  const csp: string[] = [];
  await page.exposeFunction('reportCsp', (v: string) => csp.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { reportCsp: (v: string) => void }).reportCsp(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  const name = `Images ${info.project.name}`;
  await signInAndWait(page, organiser);
  await page.getByRole('link', { name: '+ New event', exact: true }).click();
  await page.getByLabel('Event name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]+\?created=1/);
  const eventId = new URL(page.url()).pathname.split('/').pop()!;
  const main = page.getByRole('main');
  const db = adminClient();
  const stored = async () => (await db.from('events').select('logo_path, rules_html').eq('id', eventId).single()).data!;
  const files = async () =>
    ((await db.storage.from('images').list(`events/${eventId}`)).data ?? []).map((f) => f.name).sort();

  // Logo: a 2000 x 1000 PNG is shrunk in the browser to 1600 px and stored as WebP in the event's folder.
  await main.getByLabel('Upload logo').setInputFiles(file('logo.png', 2000, 1000));
  await expect(main.getByText('Logo saved.')).toBeVisible();
  await expect(main.getByRole('img', { name: 'Event logo' })).toBeVisible();
  const first = (await stored()).logo_path!;
  expect(first).toMatch(new RegExp(`^events/${eventId}/logo-[0-9a-f-]{36}\\.webp$`));
  const { data: blob } = await db.storage.from('images').download(first);
  const bytes = new Uint8Array(await blob!.arrayBuffer());
  expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WEBP');
  expect(webpSize(bytes)).toEqual({ width: 1600, height: 800 });

  // Replacing it deletes the old file.
  await main.getByLabel('Replace logo').setInputFiles(file('logo2.png'));
  await expect(main.getByText('Logo saved.')).toBeVisible();
  await expect.poll(async () => (await stored()).logo_path).not.toBe(first);
  await expect.poll(files).not.toContain(first.split('/').pop());

  // Sponsors: a major one and two minor ones, then one minor removed.
  await main.getByLabel('Upload major sponsor').setInputFiles(file('major.png'));
  await expect(main.getByText('Major sponsor saved.')).toBeVisible();
  await main.getByLabel('Add minor sponsors').setInputFiles([file('a.png'), file('b.png')]);
  await expect(main.getByText('2 minor sponsors added.')).toBeVisible();
  await expect(main.getByRole('img', { name: /^Minor sponsor logo/ })).toHaveCount(2);
  await main.getByRole('button', { name: 'Remove minor sponsor 2' }).click();
  await expect(main.getByText('Minor sponsor removed.')).toBeVisible();
  await expect(main.getByRole('img', { name: /^Minor sponsor logo/ })).toHaveCount(1);
  const { data: sponsors } = await db.from('event_sponsors').select('tier').eq('event_id', eventId);
  expect(sponsors!.map((s) => s.tier).sort()).toEqual(['major', 'minor']);
  await expect.poll(async () => (await files()).length).toBe(3);

  // Rules: formatted with the toolbar, saved with the event, cleaned on the way in.
  const rules = main.getByRole('textbox', { name: 'Event rules' });
  await rules.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Fouls');
  await main.getByRole('button', { name: 'Heading 2' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Five fouls and you sit.');
  await expect(main.getByText('Unsaved changes')).toBeVisible();
  await main.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(main.getByRole('status')).toHaveText('Saved');
  expect((await stored()).rules_html).toBe('<h2>Fouls</h2><p>Five fouls and you sit.</p>');

  // The event page (the owner's draft preview) shows all of it.
  await page.goto(`/events/${eventId}?tab=rules`);
  await expect(page.getByRole('heading', { level: 2, name: 'Fouls' })).toBeVisible();
  await expect(page.getByText('Five fouls and you sit.')).toBeVisible();
  await expect(page.getByRole('img', { name: `${name} logo` })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Sponsor logo' })).toHaveCount(2);

  // Removing the logo deletes its file too.
  await page.goto(`/admin/events/${eventId}`);
  await main.getByRole('button', { name: 'Remove logo', exact: true }).click();
  await expect(main.getByText('Logo removed.')).toBeVisible();
  expect((await stored()).logo_path).toBeNull();
  await expect.poll(async () => (await files()).length).toBe(2);
  // Only zod's harmless eval probe is expected.
  expect(csp.filter((v) => !v.startsWith('script-src eval'))).toEqual([]);
});
