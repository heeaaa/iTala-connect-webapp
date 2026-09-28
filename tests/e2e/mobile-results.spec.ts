import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInAndWait } from './fixtures';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

const mobile = 'http://127.0.0.1:3211';
let organiser: TestUser;
test.beforeEach(async ({ request }) => {
  organiser = await createUser('admin', { tag: 'results-e2e', name: 'Results organiser' });
  await request.post(`${mobile}/__control`, { data: { mode: 'normal' } });
});
test.afterEach(async ({ request }) => {
  await request.post(`${mobile}/__control`, { data: { mode: 'normal' } });
  if (organiser) await deleteUsers([organiser]);
});

// Journey 5 (MIGRATION_PLAN.md section 10) and PRD D-02, M-04 to M-07 with the mocked mobile API: an
// imported, published league night's finished games, matched to its one fixture and grouped as the old
// inbox grouped them; approved onto the fixture by team; then changed in the mobile app and kept.
test('shows the linked league’s finished games grouped, read from the mobile app without writing to it', async ({
  page,
  request,
}, info) => {
  const clientMobileRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(mobile)) clientMobileRequests.push(r.url());
  });
  await signInAndWait(page, organiser);
  await page.goto('/admin/import/league-open');
  await page.getByLabel('Event name', { exact: true }).fill(`Results ${info.project.name}`);
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]+\?imported=/);
  const eventId = new URL(page.url()).pathname.split('/').pop()!;
  await page.getByRole('group', { name: 'Choose event dates' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Published with 1 game.');

  // D-02: Results from the dashboard.
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('link', { name: `Results Results ${info.project.name}` }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}/results$`));
  await expect(page.getByRole('heading', { name: 'Pending results', level: 1 })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByText('Linked: Harbour League (Harbour League).')).toBeVisible();

  const headings = main.getByRole('heading', { level: 2 });
  await expect(headings).toHaveText([
    'Ready to approve (1)',
    'Still settling: stats may still be arriving (1)',
    'Needs a look (1)',
    'Team not linked (1)',
  ]);
  const ready = main.getByRole('region', { name: 'Ready to approve (1)' });
  await expect(ready).toContainText('Harbour Hawks 58 - 51 Night Owls');
  await expect(ready).toContainText('Harbour League · finished');
  await expect(ready).toContainText('48 stats');
  await expect(ready).toContainText('Fixture: Harbour Hawks vs Night Owls');
  await expect(ready.getByRole('combobox')).toHaveCount(0);
  await expect(main.getByRole('region', { name: /^Still settling/ })).toContainText(
    'The last stat arrived less than 5 minutes ago.',
  );
  await expect(main.getByRole('region', { name: 'Needs a look (1)' })).toContainText(
    'No stats were recorded for this game.',
  );
  await expect(main.getByRole('region', { name: 'Team not linked (1)' })).toContainText(
    'A team in this game is not linked to a division team.',
  );
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );

  // The mobile app unreachable: the division says so, nothing breaks.
  await request.post(`${mobile}/__control`, { data: { mode: 'unreachable' } });
  await main.getByRole('button', { name: 'Refresh' }).click();
  await expect(main.getByRole('alert')).toHaveText(
    "Could not read Harbour League's finished games from the mobile app. Refresh to try again.",
  );

  // Approve (M-06): the score lands on each team's side, whatever order the fixture lists them in.
  await request.post(`${mobile}/__control`, { data: { mode: 'normal' } });
  await main.getByRole('button', { name: 'Refresh' }).click();
  await expect(main.getByRole('alert')).toHaveCount(0);
  await main.getByRole('button', { name: 'Approve Harbour Hawks 58 - 51 Night Owls' }).click();
  const status = main.locator('p[aria-live="polite"][tabindex="-1"]');
  await expect(status).toContainText('Approved: Harbour Hawks 58 - 51 Night Owls on Harbour Hawks vs Night Owls');
  await expect(status).toBeFocused();
  await expect(main.getByRole('heading', { name: 'Approved (1)' })).toBeVisible();
  await expect(main.getByRole('heading', { name: /^Ready to approve/ })).toHaveCount(0);
  const db = adminClient();
  const { data: stored } = await db
    .from('games')
    .select('id, team1:teams!games_team1_id_fkey(name), game_scores(s1, s2), score_sources(mobile_game_id, method)')
    .eq('event_id', eventId)
    .single();
  const hawksFirst = (stored!.team1 as { name: string } | null)?.name === 'Harbour Hawks';
  expect(stored!.game_scores).toMatchObject(hawksFirst ? { s1: 58, s2: 51 } : { s1: 51, s2: 58 });
  expect(stored!.score_sources).toMatchObject({ mobile_game_id: 'fin-result', method: 'mobile' });

  // The mobile app then changes the result: it is raised, and keeping the published score settles it.
  await request.post(`${mobile}/__control`, { data: { mode: 'changed' } });
  await main.getByRole('button', { name: 'Refresh' }).click();
  const changed = main.getByRole('region', { name: 'Changed since you approved them (1)' });
  await expect(changed).toContainText('Published ');
  await expect(changed).toContainText('the mobile app now says 60-51 (48 to 50 stats)');
  await changed.getByRole('button', { name: 'Keep published score for Harbour Hawks 60 - 51 Night Owls' }).click();
  await expect(status).toContainText('Kept the published score.');
  await main.getByRole('button', { name: 'Refresh' }).click();
  await expect(main.getByRole('heading', { name: 'Approved (1)' })).toBeVisible();
  await expect(main.getByRole('heading', { name: /^Changed since/ })).toHaveCount(0);
  const { data: kept } = await db.from('game_scores').select('s1, s2').eq('game_id', stored!.id).single();
  expect(kept).toMatchObject(hawksFirst ? { s1: 58, s2: 51 } : { s1: 51, s2: 58 });

  // Zero writes to the mobile project, and the browser never talks to it (M-02).
  const requests = (await (await request.get(`${mobile}/__requests`)).json()) as { method: string; path: string }[];
  expect(requests.some((r) => r.path === '/rest/v1/final_game_scores')).toBe(true);
  expect(requests.filter((r) => r.path.startsWith('/rest/')).every((r) => r.method === 'GET')).toBe(true);
  expect(requests.some((r) => r.path.includes('/rpc/'))).toBe(false);
  expect(clientMobileRequests).toEqual([]);
});
