import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // One retry in CI so a flaky test shows up as "flaky" in the report
  // instead of hiding; never retry locally.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-NZ',
    timezoneId: 'Pacific/Auckland',
    // Optional override for machines with a preinstalled Chromium; CI and
    // normal setups use `npx playwright install chromium`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: 'node tests/support/mobile-server.mjs',
      url: 'http://127.0.0.1:3211/health',
      reuseExistingServer: false,
    },
    {
      // Tests run against the production build (npm run build first).
      command: `npx next start -p ${PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SITE_URL: baseURL,
        ENABLE_PROTOTYPES: '1',
        MOBILE_SUPABASE_URL: 'http://127.0.0.1:3211',
        MOBILE_SUPABASE_PUBLISHABLE_KEY: 'fixture-mobile-publishable-key-only',
      },
    },
  ],
});
