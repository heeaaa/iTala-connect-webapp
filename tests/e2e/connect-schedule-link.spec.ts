import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { clockInZone } from '@/lib/event-time';
import { signIn } from './fixtures';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

const mobile = 'http://127.0.0.1:3211';
let owner: TestUser;
let other: TestUser;
test.beforeEach(async ({ request }) => {
  owner = await createUser('admin', { tag: 'csi-owner' });
  other = await createUser('admin', { tag: 'csi-other' });
  await request.post(`${mobile}/__control`, { data: { mode: 'normal' } });
});
test.afterEach(async () => {
  await deleteUsers([owner, other]);
});

test('deep link survives sign-in, links an editable division, publishes, and confirms replacement', async ({
  page,
  request,
}) => {
  const db = adminClient();
  const day = clockInZone(new Date(), 'Pacific/Auckland').date;
  const makeEvent = async (ownerId: string, name: string) => {
    const { data: event, error } = await db
      .from('events')
      .insert({
        owner_id: ownerId,
        name,
        status: 'draft',
        schedule_days: [day],
        courts: 1,
        court_names: ['Court 1'],
        timezone: 'Pacific/Auckland',
      })
      .select('id')
      .single();
    if (error || !event) throw error;
    const { data: division, error: dError } = await db
      .from('divisions')
      .insert({ event_id: event.id, name: 'Open', color: '#6C63FF' })
      .select('id')
      .single();
    if (dError || !division) throw dError;
    return { eventId: event.id, divisionId: division.id };
  };
  const own = await makeEvent(owner.id, 'Own league night');
  const privateEvent = await makeEvent(other.id, 'Private league night');
  const { error: teamsError } = await db.from('teams').insert([
    { division_id: own.divisionId, name: 'Harbour Hawks', sort_order: 0 },
    { division_id: own.divisionId, name: 'Night Owls', sort_order: 1 },
  ]);
  if (teamsError) throw teamsError;

  const clientMobileRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(mobile)) clientMobileRequests.push(r.url());
  });
  await signIn(page, owner, '/admin/import/league-open');
  await expect(page).toHaveURL(/\/admin\/import\/league-open$/);
  await expect(page.getByRole('heading', { name: 'Link to an existing event' })).toBeVisible();
  const choice = page.getByRole('combobox', { name: 'Event and division' });
  await expect(choice.locator('optgroup[label="Own league night (draft)"]')).toHaveCount(1);
  await expect(choice.locator('optgroup[label="Private league night (draft)"]')).toHaveCount(0);
  await choice.selectOption(`${own.eventId}/${own.divisionId}`);
  await page.getByRole('link', { name: 'Review team pairs' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/events/${own.eventId}/divisions/${own.divisionId}/mobile-link\\?league=league-open$`),
  );
  await expect(page.getByLabel('Mobile app league')).toHaveValue('league-open');
  expect((await db.from('division_mobile_links').select('division_id').eq('division_id', own.divisionId)).data).toEqual(
    [],
  );
  await expect(page.getByText(/Publish this event before its schedule appears/)).toBeVisible();
  await page.getByRole('button', { name: 'Save link' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${own.eventId}/results\\?linked=1$`));
  expect(
    (await db.from('division_mobile_links').select('league_id').eq('division_id', own.divisionId).single()).data,
  ).toMatchObject({ league_id: 'league-open' });

  await page.goto(`/admin/events/${own.eventId}`);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText('Published with 1 game.');
  await page.goto(`/admin/events/${own.eventId}/divisions/${own.divisionId}/mobile-link?league=league-small`);
  await expect(page.getByText(/The linked published schedule can appear/)).toBeVisible();
  await page.getByRole('button', { name: 'Save link' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Harbour League');
  await expect(dialog).toContainText('New League');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(
    (await db.from('division_mobile_links').select('league_id').eq('division_id', own.divisionId).single()).data,
  ).toMatchObject({ league_id: 'league-open' });
  await page.getByRole('button', { name: 'Save link' }).click();
  await dialog.getByRole('button', { name: 'Replace link' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${own.eventId}/results\\?linked=1$`));
  expect(
    (await db.from('division_mobile_links').select('league_id').eq('division_id', own.divisionId).single()).data,
  ).toMatchObject({ league_id: 'league-small' });

  await page.goto(
    `/admin/events/${privateEvent.eventId}/divisions/${privateEvent.divisionId}/mobile-link?league=league-open`,
  );
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  const requests = (await (await request.get(`${mobile}/__requests`)).json()) as { method: string; path: string }[];
  expect(requests.filter((r) => r.path.startsWith('/rest/')).every((r) => r.method === 'GET')).toBe(true);
  expect(requests.some((r) => r.path.includes('/rpc/'))).toBe(false);
  expect(clientMobileRequests).toEqual([]);
  await page.goto(`/admin/events/${own.eventId}/results`);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
