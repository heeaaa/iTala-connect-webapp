import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInAndWait } from './fixtures';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

const mobile = 'http://127.0.0.1:3211';
let organiser: TestUser;
test.beforeEach(async ({ request }) => {
  organiser = await createUser('admin', { tag: 'rosters-e2e', name: 'Rosters organiser' });
  await request.post(`${mobile}/__control`, { data: { mode: 'normal' } });
});
test.afterEach(async () => {
  if (organiser) await deleteUsers([organiser]);
});

// PRD M-11 with the mocked mobile API: a linked division's rosters beside the mobile teams' rosters,
// read only. An imported league starts the same; a change in Connect shows as a difference.
test('compares a linked division’s rosters with the mobile app, read only', async ({ page, request }, info) => {
  const clientMobileRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(mobile)) clientMobileRequests.push(r.url());
  });
  await signInAndWait(page, organiser);
  await page.goto('/admin/import/league-open');
  await page.getByLabel('Event name', { exact: true }).fill(`Rosters ${info.project.name}`);
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]+\?imported=/);
  const eventId = new URL(page.url()).pathname.split('/').pop()!;

  await page.getByRole('link', { name: 'Compare rosters for Harbour League' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}/divisions/[a-f0-9-]+/mobile-rosters$`));
  await expect(page.getByRole('heading', { name: 'Compare “Harbour League” rosters', level: 1 })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByRole('status')).toHaveText('All 2 paired teams are the same in both.');
  const hawks = main.getByRole('region', { name: 'Harbour Hawks' });
  await expect(hawks).toContainText('Same in both (2 players)');
  // Each list by jersey number: 04 before 7.
  for (const list of await hawks.getByRole('table').all())
    await expect(list.getByRole('row')).toHaveText(['NumberPlayer', '04Ari', '7Bea']);
  // The mobile team keeps its own name in its list's heading.
  await expect(hawks.getByRole('heading', { level: 3 })).toHaveText([
    'iTala Connect · 2 players',
    'Mobile app: Harbour Hawks · 2 players',
  ]);
  // Nothing on the page changes data.
  await expect(main.getByRole('button')).toHaveText(['Refresh']);

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );

  // A number changed in Connect: that team now differs; the mobile app is not touched.
  const db = adminClient();
  const { data: teams } = await db
    .from('teams')
    .select('id, name, divisions!inner(event_id)')
    .eq('divisions.event_id', eventId);
  const hawksId = teams!.find((t) => t.name === 'Harbour Hawks')!.id;
  await db.from('players').update({ number: '8' }).eq('team_id', hawksId).eq('name', 'Bea');
  await main.getByRole('button', { name: 'Refresh' }).click();
  await expect(main.getByRole('status')).toHaveText('1 of 2 paired teams differs.');
  await expect(hawks).toContainText('The lists differ (2 in iTala Connect, 2 in the mobile app)');
  await expect(hawks.getByRole('table').first().getByRole('row')).toHaveText(['NumberPlayer', '04Ari', '8Bea']);
  await expect(main.getByRole('region', { name: 'Night Owls' })).toContainText('Same in both (1 player)');

  // Zero writes to the mobile project, and the browser never talks to it (M-02).
  const requests = (await (await request.get(`${mobile}/__requests`)).json()) as { method: string; path: string }[];
  expect(requests.some((r) => r.path === '/rest/v1/players')).toBe(true);
  expect(requests.filter((r) => r.path.startsWith('/rest/')).every((r) => r.method === 'GET')).toBe(true);
  expect(requests.some((r) => r.path.includes('/rpc/'))).toBe(false);
  expect(clientMobileRequests).toEqual([]);
});
