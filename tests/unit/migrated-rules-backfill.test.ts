import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('backfills only the two unchanged imports with complete readable rules', () => {
  const sql = readFileSync('supabase/migrations/20260928000100_format_migrated_rules.sql', 'utf8');
  const updates = [
    ...sql.matchAll(
      /set rules_html = \$rules\$([\s\S]*?)\$rules\$\s*where legacy_firebase_id = '([^']+)'\s*and md5\(rules_html\) = '([a-f0-9]{32})'/g,
    ),
  ];
  expect(updates).toHaveLength(2);
  expect(updates.map((match) => match[2])).toEqual(['-P08tvBDGZKmSa6AGnNm', '-P13BNr-wtp2IdjiL2Hz']);
  const batang = updates[0]?.[1] ?? '';
  const brotherhood = updates[1]?.[1] ?? '';
  expect(batang).toContain('<h2>Open division</h2>');
  expect(batang).toContain('Mythical five');
  expect(batang).not.toContain('<h2><p>');
  expect(brotherhood).toContain('<h2>1. Team line-up</h2>');
  expect(brotherhood).toContain('Quotient = Points for / Points against');
  expect((brotherhood.match(/<h2>/g) ?? []).length).toBeLessThan(30);
  expect(brotherhood).not.toContain('and2026 BROTHERHOOD');
});
