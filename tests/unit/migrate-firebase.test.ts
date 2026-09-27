import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import exportJson from '../fixtures/firebase-export.json';
import { loadLegacyCode } from '../../scripts/firebase-legacy';
import {
  child,
  entries,
  firebaseKeyCompare,
  inFirebaseOrder,
  pushIdTime,
  text,
  values,
} from '@/migration/firebase-tree';
import { planImport } from '@/migration/import-plan';
import { canonicalTimeZone, imageSource, mapEvent, parseOldTime, type EventPlan } from '@/migration/map-event';
import { formatReport, groupIssues, importReport } from '@/migration/report';
import { verifyAll, verifyEvent, type Difference } from '@/migration/verify';

/*
 * Phase 7 (MIGRATION_PLAN.md 12.1): the Firebase export planned as an
 * import, and the computed-output diff against the old code. The reference
 * is the build connect.itala.fyi serves (scores by position, checked by hash
 * on 27/09/2026). The fixture is synthetic (no production data) and covers
 * the oddities the old app could leave behind. Nothing here writes anywhere.
 */

const tree = exportJson as Record<string, unknown>;
const events = tree.events as Record<string, unknown>;
const A = '-P1JcLF-aaaaaaaaaaaa'; // touched by the newer build: gids, both score stores, an approval
const B = '-P0Zslb-bbbbbbbbbbbb'; // live build: positions, typed times, a hidden game, a deleted team
const C = '-P1WYkLVcccccccccccc'; // stores that disagree, a repeated gid, a reused team code
const opts = { timezone: 'Pacific/Auckland' };
const legacy = loadLegacyCode();
const planOf = (id: string) => mapEvent(id, events[id], opts);
const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort();
const mapped = (raw: Record<string, unknown>) => mapEvent('x', { name: 'E', ...raw }, opts);
const kinds = (raw: Record<string, unknown>) => {
  const { plan } = mapped(raw);
  return verifyEvent({ name: 'E', ...raw }, plan!, legacy).map((d) => d.kind);
};

describe('reading the Firebase export', () => {
  it('orders keys as the old Object.keys loops saw them: whole numbers first, then Firebase order', () => {
    expect(['b', '10', 'a', '2', '-1', 't_2', 't_10'].sort(firebaseKeyCompare)).toEqual([
      '2',
      '10',
      '-1',
      'a',
      'b',
      't_10',
      't_2',
    ]);
    // Up to 2^32 - 2 a whole-number key comes first in JavaScript; beyond that it is text.
    expect(['a', '3000000000'].sort(firebaseKeyCompare)).toEqual(['3000000000', 'a']);
    expect(['99999999999', '5'].sort(firebaseKeyCompare)).toEqual(['5', '99999999999']);
    expect(['-5', '-10'].sort(firebaseKeyCompare)).toEqual(['-10', '-5']);
    expect(firebaseKeyCompare('x', 'x')).toBe(0);
  });

  it('reads a list stored as an array or as an object, skipping the gaps Firebase leaves', () => {
    expect(entries([{ a: 1 }, null, 'x'])).toEqual([
      ['0', { a: 1 }],
      ['2', 'x'],
    ]);
    expect(values({ 10: 'ten', 2: 'two', b: 'bee' })).toEqual(['two', 'ten', 'bee']);
    expect(entries('text')).toEqual([]);
    expect(child([5, 6], '1')).toBe(6);
    expect(child([5, 6], 'x')).toBeUndefined();
    expect(child({ 2: 'y' }, 2)).toBe('y');
    expect(child(null, 'a')).toBeUndefined();
    expect(JSON.stringify(inFirebaseOrder({ b: [{ z: 1, a: 2 }], a: null }))).toBe('{"b":[{"a":2,"z":1}]}');
  });

  it('reads text safely: numbers as text, a broken character replaced, anything else empty', () => {
    expect(text(12)).toBe('12');
    expect(text('ok')).toBe('ok');
    expect(text('bad \ud83c')).toBe('bad �');
    expect(text({})).toBe('');
  });

  it('reads the creation time of a push id, and nothing from other keys', () => {
    expect(pushIdTime(A)?.toISOString()).toBe('2026-09-12T08:00:00.000Z');
    expect(pushIdTime('broken')).toBeNull();
    expect(pushIdTime('!!!!!!!!aaaaaaaaaaaa')).toBeNull();
    expect(pushIdTime('--------aaaaaaaaaaaa')).toBeNull(); // 1970, not a real event
  });

  it('reads times as the old app did, and says which were typed by hand', () => {
    expect(parseOldTime('9:00 AM')).toEqual({ hhmm: '09:00', canonical: true });
    expect(parseOldTime('12:30 AM')).toEqual({ hhmm: '00:30', canonical: true });
    expect(parseOldTime('12:05 PM')).toEqual({ hhmm: '12:05', canonical: true });
    expect(parseOldTime('09:00pm')).toEqual({ hhmm: '21:00', canonical: false });
    expect(parseOldTime('13:00 PM')).toEqual({ hhmm: '13:00', canonical: false });
    expect(parseOldTime('18:45')).toEqual({ hhmm: '18:45', canonical: false });
    for (const bad of ['25:00 PM', '9:75 AM', 'noon', '24:00', ''] as const) expect(parseOldTime(bad)).toBeNull();
  });

  it('gives time zones the exact name Postgres knows them by', () => {
    expect(canonicalTimeZone('pacific/auckland')).toBe('Pacific/Auckland');
    expect(canonicalTimeZone('Pacific/Auckland')).toBe('Pacific/Auckland');
    expect(canonicalTimeZone('Mars/Base')).toBeNull();
  });

  it('takes only images the bucket can hold: PNG, JPEG and WebP', () => {
    expect(imageSource('https://x.test/a.png')).toEqual({ kind: 'url', url: 'https://x.test/a.png' });
    expect(imageSource('https://x.test/a.JPG?v=2')).toMatchObject({ kind: 'url' });
    // Windows names JPEGs .jfif; the old live data has sponsors saved that way.
    expect(imageSource('https://x.test/sponsor_1.jfif')).toMatchObject({ kind: 'url' });
    expect(imageSource('https://x.test/sponsor_2.JPE')).toMatchObject({ kind: 'url' });
    expect(imageSource('https://x.test/no-extension')).toMatchObject({ kind: 'url' });
    expect(imageSource('data:image/PNG;base64,AAAA')).toMatchObject({ kind: 'data', mime: 'image/png', bytes: 3 });
    expect(imageSource('data:image/jpg;base64,AAAA')).toMatchObject({ kind: 'data', mime: 'image/jpeg' });
    for (const bad of [
      'https://x.test/a.gif',
      'https://x.test/a.svg',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/gif;base64,R0lG',
    ])
      expect(imageSource(bad)).toBe('unsupported');
    expect(imageSource('')).toBe('none');
    expect(imageSource(undefined)).toBe('none');
    expect(imageSource('ftp://x')).toBe('unknown');
  });
});

describe('an event the newer build touched', () => {
  const { plan, issues } = planOf(A);
  const p = plan!;

  it('keeps the event details, with colours tidied and the rules cleaned', () => {
    expect(p.event).toEqual({
      legacy_firebase_id: A,
      legacy_created_by: 'superadmin',
      name: 'Harbour Spring Cup',
      status: 'published',
      schedule_days: ['2026-10-03'],
      time_start: '09:00',
      time_end: '20:00',
      courts: 2,
      court_names: ['Centre', 'Court 2'],
      timezone: 'Pacific/Auckland',
      theme_primary: '#FFCC00',
      theme_bg: '#0D0D0D',
      theme_text: '#E0E0E0',
      theme_text_secondary: '#888888',
      theme_heading: '#FFFFFF',
      rules_html: '<p>Two halves</p>',
      created_at: '2026-09-12T08:00:00.000Z',
    });
    expect(p.logo).toEqual({ kind: 'url', url: expect.stringMatching(/logo_1\.png$/) });
    expect(p.sponsors.map((s) => [s.tier, s.source.kind, s.sort_order])).toEqual([
      ['major', 'url', 0],
      ['minor', 'data', 0],
      ['minor', 'url', 1],
    ]);
    expect(codes(issues)).toEqual(['event.newer_build', 'event.rules_cleaned', 'score.by_position', 'score.one_sided']);
  });

  it('keeps teams in the old key order (which the scheduler and ties depend on), with players and the mobile link', () => {
    const [open] = p.divisions;
    expect(open).toMatchObject({ legacy_key: 'div_1757000000000', name: 'Open', color: '#6C63FF', bracket_count: 1 });
    expect(open!.teams.map((t) => [t.legacy_code, t.name, t.sort_order])).toEqual([
      ['t_1757000000001_aaaa', 'Harbour Hawks', 0],
      ['t_1757000000002_bbbb', 'Night Owls', 1],
      ['t_1757000000003_cccc', 'Kea', 2],
    ]);
    expect(open!.teams[0]!.players).toEqual([
      { name: 'Ana', number: '7', sort_order: 0 },
      { name: 'Ben', number: '12', sort_order: 1 },
    ]);
    expect(open!.teams[1]!.players).toEqual([{ name: 'Cai', number: '3', sort_order: 0 }]);
    expect(open!.mobile_link).toEqual({
      league_id: 'league-open',
      league_name: 'Harbour League',
      season: '2026',
      linked_at: new Date(1757800000000).toISOString(),
      linked_by_legacy: 'superadmin',
      teams: [
        { legacy_code: 't_1757000000001_aaaa', mobile_team_id: 'team-hawks' },
        { legacy_code: 't_1757000000002_bbbb', mobile_team_id: 'team-owls' },
      ],
    });
  });

  it('takes scores by position, as the live page showed them, and keeps the gids', () => {
    expect(p.games.map((g) => [g.legacy_gid, g.score])).toEqual([
      ['g_a1', { s1: 58, s2: 51 }],
      ['g_a2', { s1: 40, s2: 45 }],
      ['g_a3', { s1: 60, s2: 55 }],
      ['g_a4', { s1: 70, s2: 72 }],
      ['g_a5', { s1: 50, s2: 52 }],
      ['g_a6', { s1: 10, s2: null }],
    ]);
  });

  it('maps slots, playoff links (bracketId becomes bracketGameId) and labels without long dashes', () => {
    const [g1, , , final, spare, challenge] = p.games;
    expect(g1).toMatchObject({ day: '2026-10-03', start_time: '09:00', court: 1, division_key: 'div_1757000000000' });
    expect(g1!.team1).toEqual({ divisionKey: 'div_1757000000000', code: 't_1757000000001_aaaa' });
    expect(spare).toMatchObject({ day: null, start_time: null, court: null, position: 4 });
    expect(final).toMatchObject({
      label: 'Open - Finals',
      type: 'final',
      is_playoff: true,
      team1: null,
      team2: null,
      legacy_team1: 'TBD',
      bracket_game_id: 'po_div_1757000000000_1',
      team1_source: { type: 'seed', rank: 1 },
      team2_source: { type: 'seed', rank: 2 },
      playoff_round: 1,
    });
    expect(challenge).toMatchObject({
      label: 'Open - Challenge',
      team1_source: { type: 'winner', bracketGameId: 'po_div_1757000000000_1' },
      team2_source: { type: 'seed', rank: 3 },
      playoff_round: 2,
    });
    expect(p.games.every((g) => !g.label.includes('—'))).toBe(true);
  });

  it('keeps the mobile approval with its numbers read as numbers and its times as dates', () => {
    expect(p.games[0]!.source).toEqual({
      mobile_game_id: 'fin-result',
      league_id: 'league-open',
      s1: 58,
      s2: 51,
      home_pts: 58,
      away_pts: 51,
      event_count: 48,
      last_event_at: '2026-10-03T09:40:00.000Z',
      finished_at: new Date(1759484400000).toISOString(),
      approved_by_legacy: 'superadmin',
      approved_at: new Date(1759485000000).toISOString(),
      method: 'manual',
      dismissed_at: null,
    });
    expect(p.games.slice(1).every((g) => g.source === null)).toBe(true);
  });

  it('matches a fresh load of the live page exactly: slots, scores, standings and resolved playoff teams', () => {
    expect(verifyEvent(events[A], p, legacy)).toEqual([]);
  });
});

describe('an event of the live build (scores by position)', () => {
  const { plan, issues } = planOf(B);
  const p = plan!;

  it('fills the old defaults and reports what it changed', () => {
    expect(p.event).toMatchObject({
      legacy_created_by: 'admin',
      status: 'draft',
      schedule_days: ['2026-10-10'],
      time_start: '09:00',
      time_end: '18:00',
      courts: 3,
      court_names: ['A', 'Court 2', 'C'],
      theme_primary: '#FFCC00',
    });
    expect(p.logo).toBeNull();
    expect(p.divisions[0]).toMatchObject({ bracket_count: 1, custom_games_per_team: false, games_per_team: null });
    expect(codes(issues)).toEqual([
      'event.court_names_extra',
      'event.day_invalid',
      'event.day_repeated',
      'game.gid_assigned',
      'game.row_scores',
      'game.slot_hidden',
      'game.team_missing',
      'game.time_typed',
      'score.by_position',
      'score.negative',
      'score.one_sided',
    ]);
    expect(issues.find((i) => i.code === 'game.team_missing')!.message).toContain('seeding can differ');
  });

  it('gives each game a repeatable id from its position and takes scores from positions', () => {
    expect(p.games.map((g) => [g.legacy_gid, g.legacy_index, g.score])).toEqual([
      ['import-0', 0, { s1: 50, s2: 40 }],
      ['import-1', 1, { s1: 30, s2: 0 }],
      ['import-2', 2, { s1: 12, s2: null }],
      ['import-3', 3, null],
      ['import-4', 4, { s1: 20, s2: 20 }],
    ]);
    expect(planOf(B).plan!.games.map((g) => g.legacy_gid)).toEqual(p.games.map((g) => g.legacy_gid));
  });

  it('keeps the game the old page showed in a shared slot, reads typed times, and keeps a deleted team as its code', () => {
    const [hidden, typed, shown, tbd, last] = p.games;
    // Row 1 and row 3 claimed 10/10 9:00 AM court 1; the old page drew the later one.
    expect(hidden).toMatchObject({ day: null, start_time: null, court: null, group_id: 'A', label: 'Mixed - Group A' });
    expect(shown).toMatchObject({ day: '2026-10-10', start_time: '09:00', court: 1 });
    expect(typed).toMatchObject({ day: '2026-10-10', start_time: '21:00', court: 2 });
    expect(tbd).toMatchObject({ day: null, team2: null, legacy_team2: 't_deleted_team' });
    expect(last).toMatchObject({ court: 3, start_time: '11:00' });
  });

  it('shows the clamped negative score as a difference from the old page, and nothing else', () => {
    const diffs = verifyEvent(events[B], p, legacy);
    expect(diffs.map((d) => [d.kind, d.where])).toEqual([
      ['score', 'game 2 ("Mixed")'],
      ['standings', 'division "Mixed"'],
    ]);
    expect(diffs[0]).toMatchObject({ old: '[30,-5]', new: '[30,0]' });
  });
});

describe('an event whose score stores disagree', () => {
  const { plan, issues } = planOf(C);
  const p = plan!;

  it('skips a broken row but keeps positions, and gives a repeated id its own', () => {
    expect(p.games.map((g) => [g.legacy_gid, g.legacy_index, g.position])).toEqual([
      ['g_c1', 0, 0],
      ['import-2', 2, 1],
      ['import-4', 4, 2],
    ]);
    // The live page showed positions, whatever the newer build's store says.
    expect(p.games.map((g) => g.score)).toEqual([null, { s1: 9, s2: 9 }, null]);
    expect(issues.find((i) => i.code === 'score.stores_disagree')!.message).toMatch(/^2 game/);
  });

  it('keeps a game whose division is gone without one, and a same-team game with one side TBD', () => {
    expect(p.games[1]).toMatchObject({ division_key: null, team1: { divisionKey: 'div_c1', code: 't_c2' } });
    expect(p.games[2]).toMatchObject({ team1: { code: 't_c1' }, team2: null, type: 'group' });
  });

  it('clamps division settings, greys a bad colour as the old page did, and refuses a team code used twice', () => {
    expect(p.divisions.map((d) => [d.legacy_key, d.color, d.bracket_count, d.games_per_team, d.teams.length])).toEqual([
      ['div_c1', '#888888', 4, 20, 2],
      ['div_c2', '#E06040', 1, null, 0],
    ]);
    expect(codes(issues)).toEqual([
      'division.brackets',
      'division.colour',
      'division.games_per_team',
      'event.newer_build',
      'game.division_missing',
      'game.gid_assigned',
      'game.gid_repeated',
      'game.not_object',
      'game.same_team',
      'game.type_unknown',
      'score.by_position',
      'score.stores_disagree',
      'source.orphan',
      'team.code_reused',
    ]);
    expect(issues.find((i) => i.code === 'team.code_reused')!.level).toBe('error');
  });
});

describe('mapping edge cases', () => {
  it('refuses a value that is not an event, and hours that cannot be stored', () => {
    expect(mapEvent('x', 'str', opts)).toEqual({
      plan: null,
      issues: [expect.objectContaining({ level: 'error', code: 'event.not_object' })],
    });
    const late = mapped({ timeStart: '23:59', timeEnd: '10:00' });
    expect(late.plan).toBeNull();
    expect(codes(late.issues)).toEqual(['event.hours_order', 'event.hours_order']);
  });

  const odd = {
    name: 'N'.repeat(205),
    timeStart: '10:00',
    timeEnd: '08:00',
    courts: 14,
    theme: { primary: 'red', bg: '#abc' },
    logo: 'not-an-image',
    sponsors: { minor: ['', 'ftp://x'] },
    divisions: {
      d1: {
        name: 'D',
        color: '#123456',
        bracketCount: 0,
        customGamesPerTeam: true,
        gamesPerTeam: -3,
        teams: { t1: { name: 'T'.repeat(130), players: [{ name: 'P', num: '12345678901' }, 'junk'] }, t2: 'junk' },
        mobileLink: { leagueId: 'L', teams: { t1: 'm1', gone: 'm2', t1b: '' } },
      },
      d2: 'junk',
      d3: { name: 'Linked', mobileLink: { leagueId: '' } },
      d4: {
        name: 'Twice',
        teams: { a: { name: 'A' }, b: { name: 'B' } },
        mobileLink: { leagueId: 'L2', teams: { a: 'm', b: 'm' } },
      },
    },
    schedule: [
      { day: 'soon', time: '9:00 AM', court: 1, divId: 'd1', team1: 't1', team2: 'TBD' },
      { day: '2026-02-30', time: '9:00 AM', court: 1 },
      { day: '2026-10-01', time: 'late', court: 1 },
      { day: '2026-10-01', time: '9:00 AM', court: 0 },
      {
        day: '2026-10-01',
        time: '9:00 AM',
        court: 12,
        team1: 'a',
        team2: 't1',
        divId: 'd4',
        bracketId: 'Q',
        type: 'semi',
      },
      {
        day: '2026-10-01',
        time: '10:00 AM',
        court: 1,
        playoff: true,
        bracketGameId: 'po_1',
        team1Source: { type: 'seed', rank: 0 },
        team2Source: 'x',
      },
      { day: '2026-10-01', time: '11:00 AM', court: 1, playoff: true, bracketGameId: 'po_1' },
    ],
    scores: [null, { s1: 'abc', s2: 301 }],
  };

  it('repairs hours, courts, colours, long text and odd rows, saying so each time', () => {
    const { plan, issues } = mapped(odd);
    const p = plan!;
    expect(p.event).toMatchObject({
      time_start: '10:00',
      time_end: '23:59',
      courts: 10,
      theme_primary: '#FFCC00',
      theme_bg: '#AABBCC',
    });
    expect(Array.from(p.event.name)).toHaveLength(200);
    // No event days, but games on 01/10: the day is added so they still show.
    expect(p.event.schedule_days).toEqual(['2026-10-01']);
    expect(p.logo).toBeNull();
    expect(p.sponsors).toEqual([]);
    expect(p.divisions.map((d) => [d.legacy_key, d.color])).toEqual([
      ['d1', '#123456'],
      ['d3', '#888888'],
      ['d4', '#888888'],
    ]);
    const d1 = p.divisions[0]!;
    expect(d1).toMatchObject({ bracket_count: 1, games_per_team: 0, custom_games_per_team: true });
    expect(d1.teams).toHaveLength(1);
    expect(d1.teams[0]!.name).toHaveLength(120);
    expect(d1.teams[0]!.players).toEqual([{ name: 'P', number: '1234567890', sort_order: 0 }]);
    expect(d1.mobile_link).toMatchObject({
      league_id: 'L',
      league_name: '',
      season: null,
      linked_at: null,
      teams: [{ legacy_code: 't1', mobile_team_id: 'm1' }],
    });
    expect(p.divisions[1]!.mobile_link).toBeNull();
    expect(p.divisions[2]!.mobile_link!.teams).toEqual([{ legacy_code: 'a', mobile_team_id: 'm' }]);
    expect(p.games.map((g) => g.day)).toEqual([null, null, null, null, '2026-10-01', '2026-10-01', '2026-10-01']);
    expect(p.games[1]!.score).toEqual({ s1: null, s2: 301 });
    expect(p.games[4]).toMatchObject({
      group_id: null,
      team1: { code: 'a' },
      team2: { code: 't1', divisionKey: 'd1' },
      type: 'semi',
    });
    expect(p.games[5]).toMatchObject({ team1_source: null, team2_source: null, bracket_game_id: 'po_1' });
    expect(codes(issues)).toEqual([
      'division.brackets',
      // d3 and d4 had no colour: grey, as the old page showed them.
      'division.colour',
      'division.colour',
      'division.games_per_team',
      'division.not_object',
      'event.courts_range',
      'event.day_added',
      'event.hours_order',
      'event.theme_colour',
      'game.court_beyond',
      'game.court_invalid',
      'game.day_invalid',
      'game.day_invalid',
      'game.gid_assigned',
      'game.group_unknown',
      'game.team_other_division',
      'game.time_invalid',
      'image.unknown',
      'image.unknown',
      'mobile_link.duplicate',
      'mobile_link.no_league',
      'mobile_link.team_missing',
      'playoff.id_repeated',
      'score.by_position',
      'score.large',
      'score.not_number',
      // "abc" beside 301 leaves one side.
      'score.one_sided',
      'team.not_object',
      'text.too_long',
      'text.too_long',
      'text.too_long',
    ]);
    expect(issues.filter((i) => i.code === 'division.colour').map((i) => i.level)).toEqual(['info', 'info']);
  });

  it('flags every game the old page showed that the new one cannot put in the same place', () => {
    // The old page drew rows on any day text, time text or court; the new one unschedules what it cannot store.
    // Its old standings also listed the broken team t2 of d1.
    expect(kinds(odd).sort()).toEqual(['slot', 'slot', 'slot', 'slot', 'standings']);
  });

  it('keeps games on a day that is not an event day visible, even with no event days at all', () => {
    const game = (day: string, court: number) => ({
      day,
      time: '9:00 AM',
      court,
      team1: 'TBD',
      team2: 'TBD',
      label: 'G',
    });
    const some = mapped({ scheduleDays: ['2026-10-04'], schedule: [game('2026-10-04', 1), game('2026-10-05', 1)] });
    expect(some.plan!.event.schedule_days).toEqual(['2026-10-04', '2026-10-05']);
    expect(some.issues.find((i) => i.code === 'event.day_added')!.message).toMatch(/^2026-10-05 had games/);
    expect(kinds({ scheduleDays: ['2026-10-04'], schedule: [game('2026-10-04', 1), game('2026-10-05', 1)] })).toEqual(
      [],
    );
    const none = mapped({ schedule: [game('2026-10-05', 2)] });
    expect(none.plan!.event.schedule_days).toEqual(['2026-10-05']);
  });

  it('shows the scores stored on the rows when an event has no score store, as the live page did', () => {
    const raw = {
      divisions: { d: { name: 'D', teams: { a: { name: 'A' }, b: { name: 'B' } } } },
      schedule: [{ day: '2026-10-04', time: '9:00 AM', court: 1, divId: 'd', team1: 'a', team2: 'b', s1: 7, s2: 3 }],
    };
    const { plan, issues } = mapped(raw);
    expect(plan!.games[0]!.score).toEqual({ s1: 7, s2: 3 });
    expect(codes(issues)).toContain('score.on_rows');
    expect(kinds(raw)).toEqual([]);
  });

  it('keeps values within what the columns hold, and characters whole', () => {
    const { plan, issues } = mapped({
      name: `${'a'.repeat(199)}🏀tail`,
      schedule: [
        { day: '2026-10-04', time: '9:00 AM', court: 40000 },
        { day: '2026-10-04', time: '10:00 AM', court: 1, playoff: true, playoffRound: 3e9, bracketGameId: 'po' },
      ],
      scores: [null, { s1: 3e9, s2: 1e21 }],
    });
    expect(plan!.event.name).toBe(`${'a'.repeat(199)}🏀`);
    expect(plan!.games[0]).toMatchObject({ day: null, court: null });
    expect(plan!.games[1]).toMatchObject({ playoff_round: null, score: null });
    expect(codes(issues).filter((c) => c.startsWith('score') || c.startsWith('game.court'))).toEqual([
      'game.court_invalid',
      'score.by_position',
      'score.too_large',
      'score.too_large',
    ]);
  });

  it('reads court names by position, so a gap keeps the default name in its place', () => {
    const names = (courtNames: unknown) => mapped({ courts: 3, courtNames }).plan!.event.court_names;
    expect(names(['A', null, 'C'])).toEqual(['A', 'Court 2', 'C']);
    expect(names({ 2: 'C' })).toEqual(['Court 1', 'Court 2', 'C']);
    expect(names(['A', 'B', 'C', 'D'])).toEqual(['A', 'B', 'C']);
  });

  it('names a team without a name by its code, as the old page showed it', () => {
    const { plan, issues } = mapped({ divisions: { d: { name: 'D', teams: { t_1: { name: '  ' } } } } });
    expect(plan!.divisions[0]!.teams[0]!.name).toBe('t_1');
    expect(codes(issues)).toContain('team.no_name');
  });

  it('keeps a mobile approval only on the game that keeps its id', () => {
    const { plan } = mapped({
      schedule: [
        { gid: 'g1', day: '', time: '' },
        { gid: 'g1', day: '', time: '' },
      ],
      scoreSources: { g1: { mobileGameId: 'mg-1', homePts: 3e9 } },
    });
    expect(plan!.games.map((g) => [g.legacy_gid, g.source?.mobile_game_id ?? null])).toEqual([
      ['g1', 'mg-1'],
      ['import-1', null],
    ]);
    expect(plan!.games[0]!.source!.home_pts).toBeNull();
  });

  it('warns when a playoff takes the winner of a game listed after it, and both pages agree on a fresh load', () => {
    const raw = {
      divisions: { d: { name: 'D', teams: { a: { name: 'A' }, b: { name: 'B' } } } },
      schedule: [
        {
          day: '2026-10-04',
          time: '3:00 PM',
          court: 1,
          divId: 'd',
          team1: 'TBD',
          team2: 'TBD',
          type: 'final',
          playoff: true,
          bracketGameId: 'po_2',
          team1Source: { type: 'winner', bracketId: 'po_1' },
          team2Source: { type: 'seed', rank: 2 },
          playoffRound: 2,
        },
        {
          day: '2026-10-04',
          time: '1:00 PM',
          court: 1,
          divId: 'd',
          team1: 'TBD',
          team2: 'TBD',
          type: 'semi',
          playoff: true,
          bracketGameId: 'po_1',
          team1Source: { type: 'seed', rank: 1 },
          team2Source: { type: 'seed', rank: 2 },
          playoffRound: 1,
        },
        { day: '2026-10-04', time: '9:00 AM', court: 1, divId: 'd', team1: 'a', team2: 'b', type: 'group' },
      ],
      scores: [null, { s1: 50, s2: 40 }, { s1: 30, s2: 20 }],
    };
    expect(codes(mapped(raw).issues)).toContain('playoff.winner_later');
    expect(kinds(raw)).toEqual([]);
  });

  it('reads times given as numbers, numeric text or dates, and drops the rest', () => {
    const src = (value: unknown) =>
      mapEvent('x', { schedule: [{ gid: 'g', day: '', time: '' }], scoreSources: { g: { lastEventAt: value } } }, opts)
        .plan!.games[0]!.source!.last_event_at;
    expect(src(1759484400000)).toBe('2025-10-03T09:40:00.000Z');
    expect(src('1759484400000')).toBe('2025-10-03T09:40:00.000Z');
    expect(src('2026-10-03T09:40:00Z')).toBe('2026-10-03T09:40:00.000Z');
    expect(src('soon')).toBeNull();
    expect(src('')).toBeNull();
    expect(src(Number.MAX_VALUE)).toBeNull();
    expect(src(true)).toBeNull();
  });
});

describe('planning the whole export', () => {
  it('plans every event in key order, the platform settings, and notes unknown nodes', () => {
    const plan = planImport(tree, opts);
    expect(plan.events.map((e) => e.legacyId)).toEqual([B, A, C, 'broken']);
    expect(plan.events[3]!.plan).toBeNull();
    expect(plan.platform).toEqual({
      sponsors: [
        {
          tier: 'primary',
          source: { kind: 'url', url: 'https://old-images.example.test/platform/p1.png' },
          sort_order: 0,
        },
        { tier: 'secondary', source: expect.objectContaining({ kind: 'data', mime: 'image/png' }), sort_order: 0 },
      ],
      default_rules_html: '<p>Be kind</p>',
    });
    expect(codes(plan.issues)).toEqual(['export.unknown_node', 'image.unknown']);
  });

  it('leaves out platform sponsors the bucket cannot hold', () => {
    const plan = planImport({ events: {}, platform: { sponsors: { primary: ['https://x.test/a.gif'] } } }, opts);
    expect(plan.platform.sponsors).toEqual([]);
    expect(codes(plan.issues)).toEqual(['image.unsupported']);
  });

  it('plans only the events asked for, and says when one is not there', () => {
    const plan = planImport(tree, { ...opts, only: [A, 'nope'] });
    expect(plan.events.map((e) => e.legacyId)).toEqual([A]);
    expect(plan.issues.find((i) => i.code === 'export.event_missing')).toMatchObject({ level: 'error' });
  });

  it('refuses something that is not an export, and notes an export without events', () => {
    expect(planImport([], opts).issues).toEqual([expect.objectContaining({ code: 'export.not_object' })]);
    const empty = planImport({ platform: {} }, opts);
    expect(empty.events).toEqual([]);
    expect(empty.platform).toEqual({ sponsors: [], default_rules_html: null });
    expect(codes(empty.issues)).toEqual(['export.no_events']);
  });
});

describe('the computed-output diff catches real differences', () => {
  const base = () => structuredClone(planOf(A).plan!) as EventPlan;

  it('finds a changed score, a changed standings order and a wrongly resolved playoff', () => {
    const scored = base();
    scored.games[0]!.score = { s1: 51, s2: 58 };
    const found = verifyEvent(events[A], scored, legacy).map((d) => d.kind);
    expect(found).toContain('score');
    expect(found).toContain('standings');
    expect(found).toContain('playoff');

    const seeded = base();
    seeded.games[3]!.team1_source = { type: 'seed', rank: 3 };
    expect(verifyEvent(events[A], seeded, legacy)).toEqual([
      { kind: 'playoff', where: 'game 4 ("Open - Finals")', old: expect.any(String), new: expect.any(String) },
    ]);
  });

  it('finds a team order that differs from the old key order, where only the order breaks ties', () => {
    // No scores on either side: the standings are all level, so their order is the team order.
    const raw = {
      name: 'E',
      divisions: { d: { name: 'D', teams: { a: { name: 'A' }, b: { name: 'B' }, c: { name: 'C' } } } },
    };
    const plan = mapEvent('x', raw, opts).plan!;
    expect(verifyEvent(raw, plan, legacy)).toEqual([]);
    plan.divisions[0]!.teams.reverse().forEach((t, i) => (t.sort_order = i));
    expect(verifyEvent(raw, plan, legacy)).toEqual([
      {
        kind: 'standings',
        where: 'division "D"',
        old: expect.stringMatching(/^\[\["a"/),
        new: expect.stringMatching(/^\[\["c"/),
      },
    ]);
  });

  it('finds a moved game, a game on a day the event does not show, and a lost game', () => {
    const moved = base();
    moved.games[0]!.court = 2;
    moved.games[0]!.start_time = '11:00';
    expect(verifyEvent(events[A], moved, legacy).map((d) => d.kind)).toEqual(['slot']);
    const offDay = base();
    offDay.event.schedule_days = [];
    expect(new Set(verifyEvent(events[A], offDay, legacy).map((d) => [d.kind, d.new].join()))).toEqual(
      new Set(['slot,hidden']),
    );
    const lost = base();
    lost.games.splice(2, 1);
    expect(verifyEvent(events[A], lost, legacy).map((d) => d.kind)).toContain('game');
  });

  it('checks nothing for a value that is not an event', () => {
    expect(verifyEvent('x', base(), legacy)).toEqual([]);
  });
});

describe('the report', () => {
  const plan = planImport(tree, opts);
  const diffs = new Map<string, Difference[]>();
  for (const e of plan.events) if (e.plan) diffs.set(e.legacyId, verifyEvent(e.raw, e.plan, legacy));
  const report = importReport(plan, diffs);

  it('counts per event and marks only clean events ready', () => {
    const [b, a, c, broken] = report.events;
    expect(a).toMatchObject({
      name: 'Harbour Spring Cup',
      ready: true,
      counts: {
        divisions: 1,
        teams: 3,
        players: 3,
        games: 6,
        scheduled: 5,
        unscheduled: 1,
        playoff: 2,
        scored: 5,
        approvals: 1,
        mobileLinks: 1,
        images: { url: 3, embedded: 1 },
      },
    });
    expect(b).toMatchObject({ ready: false, counts: { scored: 3, unscheduled: 2 } });
    expect(c!.ready).toBe(false);
    expect(broken).toMatchObject({ status: 'not imported', ready: false });
    expect(report.totals).toEqual({ events: 4, ready: 1, errors: 2, warnings: 16, differences: 3 });
    expect(report.platform).toEqual({ sponsors: 2, defaultRules: true });
  });

  it('groups issues by kind, errors first, with a few examples each', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ level: 'info' as const, code: 'x', message: `m${i}` }));
    expect(groupIssues([...many, { level: 'error', code: 'z', message: 'e' }])).toEqual([
      { level: 'error', code: 'z', count: 1, examples: ['e'] },
      { level: 'info', code: 'x', count: 5, examples: ['m0', 'm1', 'm2'] },
    ]);
  });

  it('prints a readable summary and never carries embedded image data', () => {
    const out = formatReport(report);
    expect(out).toContain('dry run: nothing was written');
    expect(out).toContain('4 event(s): 1 ready, 2 error(s), 16 warning(s), 3 difference(s)');
    expect(out).toContain('READY  Harbour Spring Cup');
    expect(out).toContain('CHECK  Winter Social');
    expect(out).toContain('DIFFERENCE score at game 2 ("Mixed"): old [30,-5], new [30,0]');
    expect(out).not.toContain('—');
    expect(formatReport(report, { applying: true })).toContain('checked before writing');
    expect(JSON.stringify(report)).not.toContain('base64');
  });
});

describe('relinking the games of a deleted division (a person asks for it)', () => {
  // A division recreated in the old app left its playoff pointing at the old key.
  const raw = {
    name: 'Relink',
    scheduleDays: ['2026-10-04'],
    divisions: { d_new: { name: 'Balik Laro', teams: { a: { name: 'A' }, b: { name: 'B' } } } },
    schedule: [
      {
        day: '2026-10-04',
        time: '9:00 AM',
        court: 1,
        divId: 'd_new',
        team1: 'a',
        team2: 'b',
        type: 'group',
        label: 'G',
      },
      {
        day: '2026-10-04',
        time: '11:00 AM',
        court: 1,
        divId: 'd_old',
        team1: 'TBD',
        team2: 'TBD',
        type: 'final',
        label: 'Final',
        playoff: true,
        bracketGameId: 'po_d_old_1',
        team1Source: { type: 'seed', rank: 1 },
        team2Source: { type: 'seed', rank: 2 },
        playoffRound: 1,
      },
    ],
    scores: [{ s1: 50, s2: 40 }],
  };

  it('left alone, the orphaned final has no division and stays TBD, as on the old page', () => {
    const { plan, issues } = mapEvent('x', raw, opts);
    expect(plan!.games[1]!.division_key).toBeNull();
    expect(codes(issues)).toContain('game.division_missing');
    expect(verifyEvent(raw, plan!, legacy)).toEqual([]);
  });

  it('relinked, the final belongs to the division and fills in from its standings, shown as the one difference', () => {
    const { plan, issues } = mapEvent('x', raw, { ...opts, relink: { d_old: 'd_new' } });
    expect(plan!.games[1]!.division_key).toBe('d_new');
    expect(codes(issues)).not.toContain('game.division_missing');
    expect(issues.find((i) => i.code === 'game.division_relinked')!.message).toBe(
      '1 game(s) of the deleted division d_old were linked to "Balik Laro", as asked; its standings now seed them.',
    );
    expect(verifyEvent(raw, plan!, legacy)).toEqual([
      { kind: 'playoff', where: 'game 2 ("Final")', old: '[null,null]', new: '["a","b"]' },
    ]);
  });

  it('refuses a division that still exists or a target that does not, and notes a rule that moved nothing', () => {
    const levels = (relink: Record<string, string>) =>
      mapEvent('x', raw, { ...opts, relink })
        .issues.filter((i) => i.code.startsWith('relink'))
        .map((i) => [i.level, i.code]);
    expect(levels({ d_new: 'd_new' })).toEqual([['error', 'relink.source_exists']]);
    expect(levels({ d_old: 'd_gone' })).toEqual([['error', 'relink.target_missing']]);
    expect(levels({ d_other: 'd_new' })).toEqual([['warning', 'relink.unused']]);
    const plan = planImport(
      { events: { x: raw } },
      { ...opts, relink: { nope: { d_old: 'd_new' }, x: { d_old: 'd_new' } } },
    );
    expect(plan.issues.map((i) => [i.level, i.code])).toEqual([['error', 'relink.event_missing']]);
    expect(plan.events[0]!.plan!.games[1]!.division_key).toBe('d_new');
  });
});

describe('one broken event does not stop the rest', () => {
  it('reports an event that cannot be read, and still plans the others', () => {
    const unreadable = Object.defineProperty({}, 'scheduleDays', {
      enumerable: true,
      get() {
        throw new Error('bad node');
      },
    });
    const plan = planImport({ events: { a: unreadable, b: { name: 'Fine' } } }, opts);
    expect(plan.events.map((e) => [e.legacyId, e.plan === null, codes(e.issues)])).toEqual([
      ['a', true, ['event.unreadable']],
      ['b', false, []],
    ]);
    expect(plan.events[0]!.issues[0]!.message).toBe('The event could not be read (bad node).');
    expect(imageSource('http://[')).toBe('unknown');
  });

  it('marks an event the old code cannot work out as an error, and checks the others', () => {
    // A team list exported as an array with a gap: the old page itself stopped on it.
    const plan = planImport(
      {
        events: {
          a: { name: 'Gap', divisions: { d: { name: 'D', teams: [null, { name: 'A' }] } } },
          b: { name: 'Fine' },
        },
      },
      opts,
    );
    const diffs = verifyAll(plan, legacy);
    expect([...diffs.keys()]).toEqual(['b']);
    expect(plan.events[0]!.issues.map((i) => [i.level, i.code])).toContainEqual(['error', 'verify.failed']);
    expect(importReport(plan, diffs).events.map((e) => e.ready)).toEqual([false, true]);
  });
});

describe('npm run migrate:firebase', () => {
  // Never a database here: the keys are blanked, so an apply stops before connecting.
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', 'scripts/migrate-firebase.ts', ...args], {
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SECRET_KEY: '' },
    });
  const file = ['--file', 'tests/fixtures/firebase-export.json'];

  it('prints the dry-run report and fails while anything needs a look', () => {
    const r = run(...file);
    expect(r.stdout).toContain('dry run: nothing was written');
    expect(r.stdout).toContain('READY  Harbour Spring Cup');
    expect(r.status).toBe(1);
  }, 60_000);

  it('passes for a clean event, and says how to give an id that starts with a dash', () => {
    expect(run(...file, `--event=${A}`).status).toBe(0);
    expect(run(...file, '--event', A).stderr).toContain('--event=<id>');
  }, 60_000);

  it('refuses to write without an owner, a named host or the keys, and to run without an export or a real time zone', () => {
    expect(run(...file, '--apply').stderr).toContain('--owner <email>');
    expect(run(...file, '--apply', '--owner', 'a@b.test').stderr).toContain('--to <host>');
    expect(run(...file, '--apply', '--dry-run', '--owner', 'a@b.test').stderr).toContain('not both');
    const keys = run(...file, `--event=${A}`, '--apply', '--owner', 'a@b.test', '--to', 'abcd.supabase.co');
    expect(keys.stdout).toContain('checked before writing');
    expect(keys.stderr).toContain('SUPABASE_SECRET_KEY are needed');
    expect(keys.status).toBe(2);
    expect(run().status).toBe(2);
    expect(run('--file', 'x.json', '--timezone', 'Mars/Base').stderr).toContain('is not a time zone');
    expect(run(...file, '--relink-division=div_old').stderr).toContain(
      '"div_old" is not <event id>:<old division key>=<new division key>.',
    );
  }, 60_000);

  it('takes the keys from --env alone, and writes nowhere but the host named with --to', () => {
    // A file for a port nothing listens on; the shell holds a different project's values.
    const dir = mkdtempSync(join(tmpdir(), 'itala-env-'));
    const envFile = join(dir, 'target.env');
    writeFileSync(envFile, 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9\nSUPABASE_SECRET_KEY=file-key\n');
    const withShell = (...args: string[]) =>
      spawnSync(process.execPath, ['--import', 'tsx', 'scripts/migrate-firebase.ts', ...args], {
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: 'https://shell.supabase.co',
          SUPABASE_SECRET_KEY: 'shell-key',
        },
      });
    const apply = [...file, `--event=${A}`, '--apply', '--owner', 'a@b.test', '--env', envFile, '--skip-images'];
    const wrongHost = withShell(...apply, '--to', 'shell.supabase.co');
    expect(wrongHost.stderr).toContain('The keys are for 127.0.0.1:9, not shell.supabase.co. Nothing was written.');
    expect(wrongHost.status).toBe(2);
    const fileHost = withShell(...apply, '--to', '127.0.0.1:9');
    expect(fileHost.stdout).toContain('Writing to 127.0.0.1:9 as the migration import');
    expect(fileHost.stdout).not.toContain('shell.supabase.co');
    // Nothing answers there, so the run stops before writing and says so.
    expect(fileHost.status).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  }, 60_000);
});
