import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fixtures, signInAndWait } from './fixtures';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';
const mobile = 'http://127.0.0.1:3211';
let organiser: TestUser;
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  // Compare with the configured viewport: mobile emulation widens innerWidth to fit overflowing content.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
}
test.beforeEach(async ({ request }) => {
  organiser = await createUser('admin', { tag: 'import-e2e', name: 'Import organiser' });
  await request.post(`${mobile}/__control`, { data: { mode: 'normal' } });
});
test.afterEach(async ({ request }) => {
  await request.post(`${mobile}/__control`, { data: { mode: 'normal' } });
  if (organiser) await deleteUsers([organiser]);
});
test('imports teams and ordered players, edits a linked draft, warns before a second import and never writes to mobile', async ({
  page,
  request,
}, info) => {
  const clientMobileRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(mobile)) clientMobileRequests.push(r.url());
  });
  const path = `.impeccable/review/phase3b/${info.project.name}`;
  mkdirSync(path, { recursive: true });
  await signInAndWait(page, organiser);
  await page.getByRole('link', { name: 'Import from iTala mobile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Harbour League' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Friday Drop-in' })).toHaveCount(0);
  await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  await page.getByLabel('Show drop-in spaces').check();
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(page.getByRole('heading', { name: 'Friday Drop-in' })).toBeVisible();
  await accessible(page);
  await page.getByRole('link', { name: 'Preview Harbour League' }).click();
  await expect(page.getByRole('cell', { name: 'Bea', exact: true })).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toContainText('Bea');
  await expect(page.getByText('0 players · Team only', { exact: false })).toBeVisible();
  await page.getByLabel('Event name', { exact: true }).fill(`Imported ${info.project.name}`);
  await page.getByLabel('Division name', { exact: true }).fill('Community Open');
  await accessible(page);
  await page.screenshot({ path: `${path}/preview.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]+\?imported=/);
  const editorURL = page.url().split('?')[0]!;
  await expect(page.getByRole('status')).toContainText(
    'Event created from Harbour League. Add dates and courts, then publish.',
  );
  await expect(page.getByText('Linked to iTala mobile: Harbour League (2026)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Players (2) · Harbour Hawks' }).click();
  await expect(page.getByLabel('Player 1', { exact: true })).toHaveValue('Bea');
  await page.getByLabel('Player 1', { exact: true }).fill('Bea Updated');
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  await expect(page.getByLabel('Player 1', { exact: true })).toHaveValue('Bea Updated');
  await page.getByLabel('Player 3', { exact: true }).fill('New Player');
  await page.getByLabel('Number 3', { exact: true }).fill('00');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByLabel('Courts', { exact: true }).fill('2');
  await page.getByLabel('Court 2 name', { exact: true }).fill('West court');
  await page.getByLabel('Time zone', { exact: true }).fill('America/Vancouver');
  await page.getByRole('group', { name: 'Choose event dates' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByLabel('Court 2 name')).toHaveValue('West court');
  await expect(page.getByRole('button', { name: 'Players (3) · Harbour Hawks' })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('Court 2 name')).not.toBeVisible();
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await expect(page.getByLabel('Court 2 name')).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: `${path}/editor.png`, fullPage: true, animations: 'disabled' });
  await page.goto('/admin/import/league-open');
  await expect(page.getByText(/This league is already linked to/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Open existing event/ })).toHaveAttribute(
    'href',
    new URL(editorURL).pathname,
  );
  await page.getByRole('button', { name: 'Create anyway', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]+\?imported=/);
  expect(page.url().split('?')[0]).not.toBe(editorURL);
  const requests = (await (await request.get(`${mobile}/__requests`)).json()) as { method: string; path: string }[];
  expect(requests.filter((r) => r.path.startsWith('/rest/')).every((r) => r.method === 'GET')).toBe(true);
  expect(requests.some((r) => r.path.includes('/rpc/'))).toBe(false);
  expect(clientMobileRequests).toEqual([]);
});

test('shows empty, unreachable and small-league states with working recovery', async ({ page, request }) => {
  await signInAndWait(page, organiser);
  await request.post(`${mobile}/__control`, { data: { mode: 'empty' } });
  await page.goto('/admin/import');
  await expect(page.getByText('No leagues found in the iTala mobile app.')).toBeVisible();
  await request.post(`${mobile}/__control`, { data: { mode: 'unreachable' } });
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    "Can't reach the iTala mobile app right now. Try again.",
  );
  await request.post(`${mobile}/__control`, { data: { mode: 'normal' } });
  await page.getByRole('link', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Harbour League' })).toBeVisible();
  await page.getByRole('link', { name: 'Preview New League' }).click();
  await expect(page.getByText("You'll need at least 2 teams before you can publish.")).toBeVisible();
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Event created from New League');
});

test('creates a draft, guards unsaved edits, deletes with confirmation, and refuses another organiser’s editor', async ({
  page,
}, info) => {
  const { events } = fixtures();
  await signInAndWait(page, organiser);
  await page.goto(`/admin/events/${events.aDraftId}`);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.goto('/admin');
  await page.getByRole('link', { name: '+ New event', exact: true }).click();
  const name = `Draft ${info.project.name}`;
  await page.getByLabel('Event name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]+\?created=1/);
  const eventId = new URL(page.url()).pathname.split('/').pop()!;
  const storage = adminClient().storage.from(process.env.SUPABASE_STORAGE_BUCKET ?? 'images');
  const imagePath = `events/${eventId}/nested/logo.png`;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
    'base64',
  );
  expect((await storage.upload(imagePath, png, { contentType: 'image/png' })).error).toBeNull();
  await page.getByLabel('Event name', { exact: true }).fill('Unsaved');
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Discard unsaved changes?');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Event name', { exact: true })).toHaveValue('Unsaved');
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: `Delete ${name}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText("This can't be undone.");
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Delete ${name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Delete event', exact: true }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toHaveCount(0);
  expect((await storage.list(`events/${eventId}/nested`)).data).toEqual([]);
  expect((await adminClient().from('event_image_cleanup').select('event_id').eq('event_id', eventId)).data).toEqual([]);
});

test('guards unsaved edits on sign out and browser Back, but not in-page dialogs or after saving', async ({ page }) => {
  const discard = page.getByRole('dialog').filter({ hasText: 'Discard unsaved changes?' });
  await signInAndWait(page, organiser);
  await page.getByRole('link', { name: '+ New event', exact: true }).click();
  await page.getByLabel('Event name', { exact: true }).fill('Navigation guard');
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]+\?created=1/);
  const editorURL = page.url();
  await page.getByLabel('Event name', { exact: true }).fill('Unsaved navigation');
  // A dialog form that stays on the page must not ask about leaving.
  await page.getByRole('button', { name: '+ Add division', exact: true }).click();
  await page.getByLabel('Division 1 name', { exact: true }).fill('Open');
  await page.getByRole('button', { name: '+ Add team', exact: true }).click();
  await page.getByRole('button', { name: /^Players \(0\)/ }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(discard).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(discard).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  // Back, cancelled twice: the edits and the URL stay.
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => history.back());
    await expect(discard).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page).toHaveURL(editorURL);
    await expect(page.getByLabel('Event name', { exact: true })).toHaveValue('Unsaved navigation');
  }
  await page.evaluate(() => history.back());
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/new$/);
  await page.goForward();
  await expect(page.getByLabel('Event name', { exact: true })).toHaveValue('Navigation guard');
  // After saving, one Back leaves without asking.
  await page.getByLabel('Event name', { exact: true }).fill('Saved navigation');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/admin\/events\/new$/);
  await expect(discard).toHaveCount(0);
  await page.goForward();
  await page.getByLabel('Event name', { exact: true }).fill('Unsaved again');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/localhost:3100\/$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login\?next=/);
});
