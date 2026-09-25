// Review captures for the Today prototype. Run from the project root:
//   node .impeccable/review/capture.mjs [outDir]
import { mkdirSync } from 'node:fs';

import { chromium } from '@playwright/test';

const base = 'http://localhost:3100/prototype/today';
const out = process.argv[2] ?? '.impeccable/review';
mkdirSync(out, { recursive: true });

const shots = [
  ['desktop', { width: 1440, height: 900 }, '', true],
  ['mobile', { width: 390, height: 844 }, '', true],
  ['mobile-first-viewport', { width: 390, height: 844 }, '', false],
  ['desktop-first-viewport', { width: 1440, height: 900 }, '', false],
  ['mobile-before', { width: 390, height: 844 }, '?at=17:30', false],
  ['mobile-finished', { width: 390, height: 844 }, '?at=22:30', false],
  ['mobile-light-4courts', { width: 390, height: 844 }, '?theme=light&courts=4', true],
  ['desktop-light-owner', { width: 1440, height: 900 }, '?theme=light&owner=1', true],
  ['mobile-playoffs', { width: 390, height: 844 }, '?day=2026-10-09', true],
  ['mobile-360', { width: 360, height: 780 }, '', true],
];

const browser = await chromium.launch();
const problems = [];
for (const [name, viewport, query, fullPage] of shots) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  page.on('console', (m) => m.type() === 'error' && problems.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  await page.goto(base + query, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) problems.push(`${name}: page scrolls sideways by ${overflow}px`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
  await page.close();
}

// Team filter state: pick a team, reload, and check it is remembered.
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
await page.goto(base, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Find your team' }).click();
await page.screenshot({ path: `${out}/mobile-finder-open.png` });
await page.getByRole('button', { name: 'Kits Ravens' }).click();
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${out}/mobile-team.png`, fullPage: true });
await browser.close();

console.log(problems.length ? problems.join('\n') : 'no console errors, no sideways scroll');
