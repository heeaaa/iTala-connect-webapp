import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { clockInZone } from '@/lib/event-time';
import { DUPLICATE } from '@/lib/mobile-link';
import { signInAndWait } from './fixtures';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

const mobile = 'http://127.0.0.1:3211';
let organiser: TestUser;
test.beforeEach(async ({ request }) => {
  organiser = await createUser('admin', { tag: 'link-e2e', name: 'Link organiser' });
  await request.post(`${mobile}/__control`, { data: { mode: 'normal' } });
});
test.afterEach(async () => {
  if (organiser) await deleteUsers([organiser]);
});

// PRD M-03 with the mocked mobile API: a division made by hand is linked to a mobile league from the
// editor. Names fill the pairs in, a duplicate is refused, and the saved pairs bring its results in.
test('links a hand-made division to a mobile league, then shows its results', async ({ page, request }, info) => {
  const clientMobileRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(mobile)) clientMobileRequests.push(r.url());
  });
  const db = adminClient();
  const day = clockInZone(new Date(), 'Pacific/Auckland').date;
  const must = <T>(r: { data: T; error: unknown }): NonNullable<T> => {
    if (r.error) throw r.error;
    return r.data!;
  };
  const event = must(
    await db
      .from('events')
      .insert({
        owner_id: organiser.id,
        name: `Link ${info.project.name}`,
        status: 'draft',
        schedule_days: [day],
        courts: 1,
        court_names: ['Court 1'],
        timezone: 'Pacific/Auckland',
      })
      .select('id')
      .single(),
  );
  const division = must(
    await db.from('divisions').insert({ event_id: event.id, name: 'Open', color: '#6C63FF' }).select('id').single(),
  );
  const teams = must(
    await db
      .from('teams')
      .insert(
        ['Harbour Hawks', 'Night Owls', 'Kea'].map((name, i) => ({ division_id: division.id, name, sort_order: i })),
      )
      .select('id, name'),
  );
  const team = (n: string) => teams.find((t) => t.name === n)!.id;
  must(
    await db.from('games').insert({
      event_id: event.id,
      division_id: division.id,
      day,
      start_time: '19:00',
      court: 1,
      team1_id: team('Night Owls'),
      team2_id: team('Harbour Hawks'),
      label: 'Open',
      type: 'group',
      is_playoff: false,
      position: 0,
    }),
  );

  await signInAndWait(page, organiser);
  await page.goto(`/admin/events/${event.id}`);
  await page.getByRole('link', { name: 'Link to mobile app for Open' }).click();
  await expect(page.getByRole('heading', { name: 'Link “Open” to the mobile app', level: 1 })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByRole('table')).toHaveCount(0);

  // Choosing a league changes nothing until its teams are asked for.
  await main.getByLabel('Mobile app league').selectOption({ label: 'Harbour League (2026)' });
  await expect(main.getByRole('table')).toHaveCount(0);
  await main.getByRole('button', { name: 'Show its teams' }).click();
  await expect(page).toHaveURL(/\?league=league-open$/);
  const pick = (name: string) => main.getByLabel(`Mobile team for ${name}`);
  await expect(pick('Harbour Hawks')).toHaveValue('team-hawks');
  await expect(pick('Night Owls')).toHaveValue('team-owls');
  await expect(pick('Kea')).toHaveValue('');
  await expect(
    main.getByText('1 team not paired. Results involving them will be listed but cannot be approved.'),
  ).toBeVisible();

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );

  // Two teams on one mobile team is refused before anything is saved.
  await pick('Kea').selectOption({ label: 'Harbour Hawks' });
  const save = main.getByRole('button', { name: 'Save link' });
  await save.click();
  await expect(main.getByRole('alert')).toHaveText(DUPLICATE);
  await expect(save).toBeFocused();
  await pick('Kea').selectOption({ label: 'Not in the mobile app' });
  await save.click();

  await expect(page).toHaveURL(new RegExp(`/admin/events/${event.id}/results\\?linked=1$`));
  const status = main.locator('p[aria-live="polite"][tabindex="-1"]');
  await expect(status).toHaveText('Linked. Results for this division will now appear in Pending results.');
  await expect(status).toBeFocused();
  await expect(main.getByText('Linked: Open (Harbour League).')).toBeVisible();
  await expect(main.getByRole('region', { name: 'Ready to approve (1)' })).toContainText(
    'Fixture: Night Owls vs Harbour Hawks',
  );

  const { data: link } = await db
    .from('division_mobile_links')
    .select('league_id, league_name, season, division_mobile_team_links(team_id, mobile_team_id)')
    .eq('division_id', division.id)
    .single();
  expect(link).toMatchObject({ league_id: 'league-open', league_name: 'Harbour League', season: '2026' });
  expect(
    [...link!.division_mobile_team_links].sort((a, b) => a.mobile_team_id.localeCompare(b.mobile_team_id)),
  ).toEqual([
    { team_id: team('Harbour Hawks'), mobile_team_id: 'team-hawks' },
    { team_id: team('Night Owls'), mobile_team_id: 'team-owls' },
  ]);
  const { data: audit } = await db.from('audit_log').select('action, actor_id').eq('event_id', event.id);
  expect(audit).toContainEqual({ action: 'division.mobile_link', actor_id: organiser.id });

  // Back in the editor the division shows its league, and the wizard opens on the saved pairs.
  await page.goto(`/admin/events/${event.id}`);
  await page.getByRole('link', { name: 'Mobile: Harbour League for Open' }).click();
  await expect(main.getByLabel('Mobile app league')).toHaveValue('league-open');
  await expect(pick('Harbour Hawks')).toHaveValue('team-hawks');
  await expect(pick('Kea')).toHaveValue('');

  // Zero writes to the mobile project, and the browser never talks to it (M-02).
  const requests = (await (await request.get(`${mobile}/__requests`)).json()) as { method: string; path: string }[];
  expect(requests.some((r) => r.path === '/rest/v1/teams')).toBe(true);
  expect(requests.filter((r) => r.path.startsWith('/rest/')).every((r) => r.method === 'GET')).toBe(true);
  expect(requests.some((r) => r.path.includes('/rpc/'))).toBe(false);
  expect(clientMobileRequests).toEqual([]);
});
