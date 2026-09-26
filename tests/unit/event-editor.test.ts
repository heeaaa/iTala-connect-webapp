import { describe, it, expect } from 'vitest';
import { editorSchema } from '@/lib/event-editor';
const id = '10000000-0000-4000-8000-000000000001';
const input = {
  id,
  version: '2026-09-26T00:00:00Z',
  name: 'Open',
  schedule_days: ['2026-10-01'],
  time_start: '09:00',
  time_end: '20:00',
  courts: 1,
  court_names: ['Court 1'],
  timezone: 'America/Vancouver',
  theme_primary: '#FFCC00',
  theme_bg: '#0D0D0D',
  theme_text: '#E0E0E0',
  theme_text_secondary: '#888888',
  theme_heading: '#FFFFFF',
  divisions: [],
};
describe('Draft validation', () => {
  it('accepts a valid draft, strips forbidden fields and trims names', () => {
    expect(editorSchema.parse({ ...input, name: ' Open ', status: 'published', owner_id: 'someone' })).toEqual(input);
  });
  it.each([
    { name: ' ' },
    { schedule_days: ['2026-10-01', '2026-10-01'] },
    { schedule_days: ['2026-02-30'] },
    { time_start: '25:00' },
    { time_end: '08:00' },
    { time_end: '09:00' },
    { courts: 1.5 },
    { courts: 11 },
    { court_names: [] },
    { timezone: 'Invalid/Zone' },
    { theme_primary: 'red' },
  ])('refuses invalid event details: %j', (patch) => {
    expect(editorSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it('rejects reused entity ids and fractional game counts', () => {
    const d = {
      id,
      name: 'Division',
      color: '#123456',
      bracket_count: 1,
      custom_games_per_team: true,
      games_per_team: 2,
      teams: [],
    };
    expect(editorSchema.safeParse({ ...input, divisions: [d, { ...d, name: 'Duplicate' }] }).success).toBe(false);
    expect(editorSchema.safeParse({ ...input, divisions: [{ ...d, games_per_team: 2.5 }] }).success).toBe(false);
    expect(editorSchema.safeParse({ ...input, divisions: [d] }).success).toBe(true);
  });
});
