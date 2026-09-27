import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { defaultEventSlug, slugWords, slugYear } from '@/lib/event-slug';
import { signInAndWait } from './fixtures';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

/*
 * Event web addresses (PRD P-14): chosen when an event is created, changed in
 * the editor, and a draft stays private whichever address is used.
 */

let organiser: TestUser;
test.beforeEach(async () => {
  organiser = await createUser('admin', { tag: 'address-e2e', name: 'Address organiser' });
});
test.afterEach(async () => {
  if (organiser) await deleteUsers([organiser]);
});

const DRAFT_NOTE =
  'The link works once the event is published. While it is a draft, only you and superadmins can open it.';

test('a new event takes its address from the name and year, and a draft stays private', async ({
  page,
  browser,
}, info) => {
  const name = `Address Cup ${info.project.name} ${Date.now()}`;
  const slug = defaultEventSlug(name, slugYear([], new Date(), 'Pacific/Auckland'));
  await signInAndWait(page, organiser);
  await page.goto('/admin/events/new');
  await page.getByLabel('Event name', { exact: true }).fill(name);
  const address = page.getByRole('textbox', { name: 'Web address' });
  await expect(address).toHaveValue(slug);
  await expect(page.getByText('Free to use.')).toBeVisible();
  await expect(page.getByText(DRAFT_NOTE)).toBeVisible();

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );

  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]+\?created=1$/);
  const eventId = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.getByRole('textbox', { name: 'Web address' })).toHaveValue(slug);
  await expect(page.getByText('This is the current address.')).toBeVisible();

  // A draft is a 404 to the public by its address and by its id, and a preview to its owner.
  const visitor = await browser.newContext();
  const anon = await visitor.newPage();
  expect((await anon.goto(`/events/${slug}`))?.status()).toBe(404);
  expect((await anon.goto(`/events/${eventId}`))?.status()).toBe(404);
  await visitor.close();
  await page.goto(`/events/${slug}`);
  await expect(page.getByText('Draft preview. Only you can see this until the event is published.')).toBeVisible();

  // The same name again: the default is taken, so the address moves to the first free one.
  await page.goto('/admin/events/new');
  await page.getByLabel('Event name', { exact: true }).fill(name);
  await expect(page.getByText(`Free to use. Another event already uses ${slug}.`)).toBeVisible();
  await expect(address).toHaveValue(`${slug}-2`);
  // Typing a taken address says so and offers the free one.
  await address.fill(slug);
  await expect(page.getByText('Another event already uses this address.')).toBeVisible();
  await page.getByRole('button', { name: `Use ${slug}-2` }).click();
  await expect(address).toHaveValue(`${slug}-2`);
  await expect(page.getByText('Free to use.')).toBeVisible();
});

test('a published event opens by its address; its id and old addresses lead there', async ({ page, browser }, info) => {
  const stamp = slugWords(`${info.project.name} ${Date.now()}`);
  const name = `Harbour Night ${stamp}`;
  const { data: event, error } = await adminClient()
    .from('events')
    .insert({
      owner_id: organiser.id,
      name,
      status: 'published',
      published_at: new Date().toISOString(),
      schedule_days: ['2026-10-03'],
      slug: `harbour-${stamp}`,
    })
    .select('id, slug')
    .single();
  if (error) throw error;

  const visitor = await browser.newContext();
  const anon = await visitor.newPage();
  // The id keeps working and shows the address, with the tab kept.
  await anon.goto(`/events/${event.id}?tab=teams`);
  await expect(anon).toHaveURL(new RegExp(`/events/harbour-${stamp}\\?tab=teams$`));
  await expect(anon.getByRole('heading', { level: 1, name })).toBeVisible();

  // The owner changes the address in the editor; Save is not involved.
  await signInAndWait(page, organiser);
  await page.goto(`/admin/events/${event.id}`);
  await expect(
    page.getByText('Anyone can open this link. If you change the address, the old one keeps leading here.'),
  ).toBeVisible();
  const address = page.getByRole('textbox', { name: 'Web address' });
  await address.fill(`Harbour Finals ${stamp}`);
  await expect(address).toHaveValue(`harbour-finals-${stamp}`);
  await expect(page.getByText('Free to use.')).toBeVisible();
  await page.getByRole('button', { name: 'Change address' }).click();
  await expect(page.getByText('Address changed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open its public page to enter scores.' })).toHaveAttribute(
    'href',
    `/events/harbour-finals-${stamp}`,
  );

  // The old address, and one typed with capitals, lead to the new one, with the day kept.
  await anon.goto(`/events/harbour-${stamp}?day=2026-10-03`);
  await expect(anon).toHaveURL(new RegExp(`/events/harbour-finals-${stamp}\\?day=2026-10-03$`));
  await anon.goto(`/events/Harbour-Finals-${stamp}`);
  await expect(anon).toHaveURL(new RegExp(`/events/harbour-finals-${stamp}$`));
  await expect(anon.getByRole('heading', { level: 1, name })).toBeVisible();
  // The home page links to the address.
  await anon.goto('/');
  await expect(anon.getByRole('link', { name: new RegExp(name) })).toHaveAttribute(
    'href',
    `/events/harbour-finals-${stamp}`,
  );
  expect((await anon.goto(`/events/no-such-event-${stamp}`))?.status()).toBe(404);
  await visitor.close();
});
