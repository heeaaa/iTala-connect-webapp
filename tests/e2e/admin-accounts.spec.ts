import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { signInAndWait } from './fixtures';
import { adminClient, createUser, deleteUsers, type TestUser } from '../support/supabase';

let superadmin: TestUser;
let name = '';
let email = '';
test.beforeEach(async () => {
  name = `Pat Kim ${randomUUID().slice(0, 6)}`;
  email = `pat-${randomUUID().slice(0, 8)}@itala.test`;
  superadmin = await createUser('superadmin', { tag: 'accounts-e2e', name: 'Accounts superadmin' });
});
test.afterEach(async () => {
  const db = adminClient();
  const { data } = await db.from('profiles').select('id').eq('display_name', name);
  for (const p of data ?? []) await db.auth.admin.deleteUser(p.id);
  if (superadmin) await deleteUsers([superadmin]);
});

/** The link as shown on screen, opened on this test server (the origin may be built in). */
async function linkPath(page: Page) {
  const link = new URL(await page.getByLabel('Set-up link', { exact: true }).inputValue());
  expect(link.pathname).toBe('/auth/confirm');
  expect(link.searchParams.get('token_hash')).toMatch(/^[0-9a-f]{56}$/);
  return { path: `${link.pathname}${link.search}`, type: link.searchParams.get('type') };
}

/** CSP violations are sent to the test as they happen, from every page the browser opens. */
async function watchCsp(page: Page, into: string[]) {
  await page.exposeFunction('reportCsp', (v: string) => into.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { reportCsp: (v: string) => void }).reportCsp(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
}

/** Someone else's browser: no shared cookies with the superadmin's. */
async function freshPage(browser: Browser, csp: string[]) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await watchCsp(page, csp);
  return page;
}

async function expectAccessible(page: Page) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}

/** Role changes ask first (A-09 review): choose, then confirm in the dialog. */
async function changeRole(page: Page, row: ReturnType<Page['getByRole']>, name: string, role: 'admin' | 'superadmin') {
  await row.getByRole('combobox', { name: `Role for ${name}` }).selectOption(role);
  await page
    .getByRole('dialog', { name: `Make ${name} ${role === 'superadmin' ? 'a superadmin' : 'an admin'}?` })
    .getByRole('button', { name: 'Change role' })
    .click();
}

// A-09: a superadmin creates an account and hands over a set-up link; the person sets a password;
// roles change; a disabled account loses access; a fresh link resets a password.
test('creates an account with a set-up link, then changes its role, disables and re-enables it', async ({
  page,
  browser,
}) => {
  const csp: string[] = [];
  await watchCsp(page, csp);
  await signInAndWait(page, superadmin);
  await page.getByRole('link', { name: 'Admins' }).click();
  await expect(page.getByRole('heading', { name: 'Admins', level: 1 })).toBeVisible();
  const main = page.getByRole('main');

  await main.getByLabel('Name', { exact: true }).fill(name);
  await main.getByLabel('Email', { exact: true }).fill(email);
  await main.getByRole('button', { name: 'Create account' }).click();
  await expect(main.getByRole('heading', { name: `Set-up link for ${name}` })).toBeFocused();
  const invite = await linkPath(page);
  expect(invite.type).toBe('invite');
  await expectAccessible(page);
  await main.getByRole('button', { name: 'Done' }).click();
  const row = main.getByRole('row', { name: new RegExp(name) });
  await expect(row).toContainText(email);
  await expect(row).toContainText('Not signed in yet');

  // The person opens the link in their own browser. Opening it uses nothing; Continue does.
  const person = await freshPage(browser, csp);
  await person.goto(invite.path);
  await expect(person.getByRole('heading', { name: 'Set up your account' })).toBeVisible();
  await expectAccessible(person);
  await person.getByRole('button', { name: 'Continue' }).click();
  await expect(person).toHaveURL(/\/admin\/password\?welcome=1$/);
  await expect(person.getByRole('heading', { name: 'Choose your password' })).toBeVisible();
  await expectAccessible(person);
  const password = `Pw-${randomUUID()}`;
  await person.getByLabel('New password').fill('too short');
  await person.getByLabel('Type it again').fill('too short');
  await person.getByRole('button', { name: 'Save password' }).click();
  await expect(person.getByRole('alert').filter({ hasText: 'Use at least 10 characters.' })).toBeVisible();
  await person.getByLabel('New password').fill(password);
  await person.getByLabel('Type it again').fill(password);
  await person.getByRole('button', { name: 'Save password' }).click();
  await expect(person.getByText('Password saved. Next time, sign in with your email and this password.')).toBeVisible();
  await person.getByRole('link', { name: 'Go to the dashboard' }).click();
  await expect(person.getByTestId('signed-in-as')).toContainText(`${name} (Admin)`);

  // The link worked once.
  const again = await freshPage(browser, csp);
  await again.goto(invite.path);
  await again.getByRole('button', { name: 'Continue' }).click();
  await expect(
    again.getByText('This link has expired or has already been used. Ask a superadmin for a new set-up link.'),
  ).toBeVisible();
  await again.context().close();

  // Role and access, from the superadmin's side.
  await page.reload();
  await expect(row).not.toContainText('Not signed in yet');
  await changeRole(page, row, name, 'superadmin');
  await expect(main.getByText(`${name} is now a superadmin.`)).toBeVisible();
  await changeRole(page, row, name, 'admin');
  await expect(main.getByText(`${name} is now an admin.`)).toBeVisible();
  await row.getByRole('button', { name: `Disable ${name}` }).click();
  await page
    .getByRole('dialog', { name: `Disable ${name}?` })
    .getByRole('button', { name: 'Disable account' })
    .click();
  await expect(main.getByText(`${name} is disabled.`)).toBeVisible();
  await expect(row.getByRole('button', { name: `New set-up link for ${name}` })).toHaveCount(0);

  // The disabled person loses access on their next page.
  await person.goto('/admin');
  await expect(person).toHaveURL(/\/login\?error=disabled/);
  await expect(person.getByText('This account has been disabled.', { exact: false })).toBeVisible();

  // Enabled again, a fresh link lets them choose a new password.
  await row.getByRole('button', { name: `Enable ${name}` }).click();
  await expect(main.getByText(`${name} is enabled.`)).toBeVisible();
  await row.getByRole('button', { name: `New set-up link for ${name}` }).click();
  const reset = await linkPath(page);
  expect(reset.type).toBe('recovery');
  await person.goto(reset.path);
  await expect(person.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await person.getByRole('button', { name: 'Continue' }).click();
  await expect(person).toHaveURL(/\/admin\/password\?welcome=1$/);
  await person.context().close();

  // Only zod's harmless eval probe is expected.
  expect(csp.filter((v) => !v.startsWith('script-src eval'))).toEqual([]);
});
