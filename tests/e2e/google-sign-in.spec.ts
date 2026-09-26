import { expect, test } from '@playwright/test';

// A-11 on the local stack, where the Google provider is off (no secrets in CI).
// The real Google round trip is a manual check against a configured project.
test('hides Google sign-in when the provider is off and fails safely on its routes', async ({ page }) => {
  const notice = page.getByRole('main').getByRole('alert').filter({ hasText: "Google sign-in didn't work" });
  await page.goto('/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0);

  await page.goto('/auth/google?next=/admin/events');
  await expect(page).toHaveURL(/\/login\?error=google&next=%2Fadmin%2Fevents$/);
  await expect(notice).toBeVisible();

  await page.goto('/auth/callback?error=access_denied&error_description=Signups+not+allowed&next=//evil.example');
  await expect(page).toHaveURL(/\/login\?error=google&next=%2Fadmin$/);
  await expect(notice).toBeVisible();
  await expect(page.getByText('Signups not allowed')).toHaveCount(0);
});
