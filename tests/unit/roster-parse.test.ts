import { expect, it } from 'vitest';
import { parsePlayersForTeam } from '@/lib/roster-parse';

it('uses iTala number formats, preserves leading zeros, and skips an optional matching team header', () => {
  const players = parsePlayersForTeam('Kea\nAna Lim #07\n#11 Juan Dela Cruz\nMia Santos-24\n1: Pia Cruz #3', 'Kea');
  expect(players.map(({ name, number }) => [name, number])).toEqual([
    ['Ana Lim', '07'],
    ['Juan Dela Cruz', '11'],
    ['Mia Santos', '24'],
    ['Pia Cruz', '3'],
  ]);
});

it('keeps numberless lines for review instead of dropping them', () => {
  const players = parsePlayersForTeam('Ana Lim #7\nJun\nMaria / Mia\nBen Santos 22');
  expect(players.map((p) => p.name)).toEqual(['Ana Lim', 'Jun', 'Maria / Mia', 'Ben Santos']);
  expect(players[1]?.flag).toMatch(/Possible stray line/);
  expect(players[2]?.flag).toMatch(/Slash in name/);
});

it('flags an unmatched pasted team header instead of silently treating it as a player', () => {
  const players = parsePlayersForTeam('Eagles 2024\nAna #7', 'Eagles');
  expect(players[0]).toMatchObject({ name: 'Eagles 2024', flag: expect.stringMatching(/team header/) });
  expect(players[1]).toMatchObject({ name: 'Ana', number: '7' });
});
