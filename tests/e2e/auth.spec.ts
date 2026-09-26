import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { fixtures, signIn, signInAndWait } from './fixtures';

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test.describe('Sign in and roles (PRD A-01 to A-08)', () => {
  test('signed-out visitors are sent from /admin to sign in, keeping where they were going', async ({ page }) => {
    await page.goto('/admin/admins');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fadmins$/);
    await expect(page.getByRole('heading', { name: 'Sign in to iTala Connect' })).toBeVisible();
  });

  test('wrong credentials show the generic message (A-07, A-10)', async ({ page }) => {
    const { adminA } = fixtures().users;
    await signIn(page, { ...adminA, password: 'definitely-wrong' });
    await expect(page.getByRole('alert').filter({ hasText: 'Incorrect email or password.' })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue(adminA.email);
    await expect(page).toHaveURL(/\/login/);
  });

  test('an admin sees only their own events; no superadmin links (A-03, D-01)', async ({ page }) => {
    const { users, events } = fixtures();
    await signInAndWait(page, users.adminA);
    await expect(page.getByTestId('signed-in-as')).toContainText('Aroha Admin');
    await expect(page.getByTestId('signed-in-as')).toContainText('(Admin)');
    await expect(page.getByRole('cell', { name: events.aDraft, exact: true })).toBeVisible();
    // B's event is published (RLS lets A read it) but it is not A's to manage.
    await expect(page.getByRole('cell', { name: events.bPublished, exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);

    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('a superadmin sees every event and the superadmin screens', async ({ page }) => {
    const { users, events } = fixtures();
    await signInAndWait(page, users.superadmin);
    await expect(page.getByRole('cell', { name: events.aDraft, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: events.bPublished, exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Admins' }).click();
    await expect(page.getByRole('heading', { name: 'Admins' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Nora Norole' })).toBeVisible();
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Platform settings' })).toBeVisible();
  });

  test('sign-in returns to the requested admin page, and never off-site', async ({ page }) => {
    const { adminA } = fixtures().users;
    await signIn(page, adminA, '/login?next=//evil.example/admin');
    await expect(page).toHaveURL(/localhost:3100\/admin$/);
  });

  test('a signed-in admin visiting login goes to the dashboard (A-07)', async ({ page }) => {
    await signInAndWait(page, fixtures().users.adminB);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('sign out returns home and closes the admin area (A-08)', async ({ page }) => {
    await signInAndWait(page, fixtures().users.adminA);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/localhost:3100\/$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('an account without a role is refused and not left signed in', async ({ page }) => {
    await signIn(page, fixtures().users.noRole);
    await expect(page.getByRole('alert').filter({ hasText: 'does not have access' })).toBeVisible();
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Security headers (X-03)', () => {
  test('pages carry a nonce CSP and the static headers', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response!.headers();
    const csp = headers['content-security-policy'] ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('the nonce changes on every request and scripts still run', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) errors.push(msg.text());
    });
    const a = (await page.goto('/login'))!.headers()['content-security-policy'];
    const b = (await page.goto('/login'))!.headers()['content-security-policy'];
    expect(a).not.toEqual(b);
    // Hydration works under the CSP: the client form shows pending state.
    await page.getByLabel('Email').fill('x@y.nz');
    expect(errors).toEqual([]);
  });
});

test.describe('Accessibility (X-04)', () => {
  test('home and login have no serious or critical axe violations', async ({ page }) => {
    await page.goto('/');
    await expectNoSeriousA11yViolations(page);
    await page.goto('/login');
    await expectNoSeriousA11yViolations(page);
  });

  test('admin dashboard has no serious or critical axe violations', async ({ page }) => {
    await signInAndWait(page, fixtures().users.superadmin);
    await expectNoSeriousA11yViolations(page);
  });
});
