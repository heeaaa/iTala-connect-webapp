import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
/** Specs that also run at tablet size and in WebKit (the iPad sponsor logos of 07/10/2026). */
const ENGINE_LAYOUT_SPECS = /event-sponsors\.spec\.ts/;

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
    // Tablet sizes and WebKit (Safari, and every browser on an iPad or iPhone)
    // run only the specs that guard layout which differs between engines.
    // The WebKit projects clear launchOptions, which may name a Chromium binary.
    {
      name: 'tablet',
      testMatch: ENGINE_LAYOUT_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } },
    },
    {
      name: 'ipad-webkit',
      testMatch: ENGINE_LAYOUT_SPECS,
      use: {
        ...devices['iPad Pro 11'],
        viewport: { width: 820, height: 1180 },
        launchOptions: {},
      },
    },
    {
      name: 'ipad-landscape-webkit',
      testMatch: ENGINE_LAYOUT_SPECS,
      use: {
        ...devices['iPad Pro 11 landscape'],
        viewport: { width: 1180, height: 820 },
        launchOptions: {},
      },
    },
    {
      name: 'iphone-webkit',
      testMatch: ENGINE_LAYOUT_SPECS,
      use: { ...devices['iPhone 13'], launchOptions: {} },
    },
    {
      name: 'desktop-webkit',
      testMatch: ENGINE_LAYOUT_SPECS,
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 900 },
        launchOptions: {},
      },
    },
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
