import { readFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

import type { TestUser } from '../support/supabase';
import type { PublicEventFixture } from './seed-public-event';

export const FIXTURE_FILE = 'test-results/e2e-fixtures.json';

export interface E2EFixtures {
  users: { superadmin: TestUser; adminA: TestUser; adminB: TestUser; noRole: TestUser };
  events: { aDraft: string; bPublished: string; aDraftId: string };
  publicEvent: PublicEventFixture;
}

export function fixtures(): E2EFixtures {
  return JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')) as E2EFixtures;
}

export async function signIn(page: Page, user: TestUser, path = '/login') {
  await page.goto(path);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function signInAndWait(page: Page, user: TestUser) {
  await signIn(page, user);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'My events' })).toBeVisible();
}
