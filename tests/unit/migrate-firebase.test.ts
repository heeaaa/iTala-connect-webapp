import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import exportJson from '../fixtures/firebase-export.json';
import { loadLegacyCode } from '../../scripts/firebase-legacy';
import { child, entries, firebaseKeyCompare, inFirebaseOrder, pushIdTime, values } from '@/migration/firebase-tree';
import { planImport } from '@/migration/import-plan';
import { imageSource, mapEvent, parseOldTime, type EventPlan } from '@/migration/map-event';
import { formatReport, groupIssues, importReport } from '@/migration/report';
import { verifyEvent, type Difference } from '@/migration/verify';

/*
 * Phase 7a (MIGRATION_PLAN.md 12.1): the Firebase export planned as an
 * import, and the computed-output diff against the old code. The fixture
 * is synthetic (no production data) and covers the oddities the old app
 * could leave behind. Nothing here writes anywhere.
 */

const tree = exportJson as Record<string, unknown>;
const events = tree.events as Record<string, unknown>;
const A = '-P1JcLF-aaaaaaaaaaaa'; // new build, migrated, playoffs and a mobile approval
const B = '-P0Zslb-bbbbbbbbbbbb'; // old build: positions, typed times, a clash, a deleted team
const C = '-P1WYkLVcccccccccccc'; // gids without the marker, a repeated gid, a reused team code
const opts = { timezone: 'Pacific/Auckland' };
const legacy = loadLegacyCode();
const planOf = (id: string) => mapEvent(id, events[id], opts);
const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort();

describe('reading the Firebase export', () => {
  it('orders keys as Firebase does: 32-bit integer keys by number first, then the rest as text', () => {
    expect(['b', '10', 'a', '2', '-1', 't_2', 't_10'].sort(firebaseKeyCompare)).toEqual([
      '-1',
      '2',
      '10',
      'a',
      'b',
      't_10',
      't_2',
    ]);
    // Beyond 32 bits a number-like key is plain text.
    expect(['99999999999', '5'].sort(firebaseKeyCompare)).toEqual(['5', '99999999999']);
    expect(['3000000000', 'a'].sort(firebaseKeyCompare)).toEqual(['3000000000', 'a']);
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

  it('classifies images as web addresses or embedded data', () => {
    expect(imageSource('https://x.test/a.png')).toEqual({ kind: 'url', url: 'https://x.test/a.png' });
    expect(imageSource('data:image/PNG;base64,AAAA')).toMatchObject({ kind: 'data', mime: 'image/png', bytes: 3 });
    expect(imageSource('')).toBe('none');
    expect(imageSource(undefined)).toBe('none');
    expect(imageSource('ftp://x')).toBe('unknown');
  });
});

describe('mapping a migrated event (new build)', () => {
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
    expect(codes(issues)).toEqual(['event.rules_cleaned', 'score.one_sided']);
  });

  it('keeps teams in Firebase key order (which the scheduler and ties depend on), with players and the mobile link', () => {
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

  it('takes each score from its game id and ignores the stale position store, as the migrated old page did', () => {
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

  it('matches the old page exactly: scores, standings and resolved playoff teams', () => {
    expect(verifyEvent(events[A], p, legacy)).toEqual([]);
  });
});

describe('mapping an old-build event (scores by position)', () => {
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
      'game.slot_repeated',
      'game.team_missing',
      'game.time_typed',
      'score.by_position',
      'score.negative',
      'score.one_sided',
    ]);
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

  it('reads typed times, unschedules a clash and a TBD day, and keeps a deleted team as its code', () => {
    const [first, typed, clash, tbd, last] = p.games;
    expect(first).toMatchObject({ start_time: '09:00', court: 1, group_id: 'A', label: 'Mixed - Group A' });
    expect(typed).toMatchObject({ day: '2026-10-10', start_time: '21:00', court: 2 });
    expect(clash).toMatchObject({ day: null, start_time: null, court: null });
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

describe('mapping an event with game ids but no migration marker', () => {
  const { plan, issues } = planOf(C);
  const p = plan!;

  it('skips a broken row but keeps positions, and gives a repeated id its own', () => {
    expect(p.games.map((g) => [g.legacy_gid, g.legacy_index, g.position])).toEqual([
      ['g_c1', 0, 0],
      ['import-2', 2, 1],
      ['import-4', 4, 2],
    ]);
    // The old page showed the shared id's score on both rows.
    expect(p.games.map((g) => g.score)).toEqual([{ s1: 3, s2: 1 }, { s1: 3, s2: 1 }, null]);
  });

  it('keeps a game whose division is gone without one, and a same-team game with one side TBD', () => {
    expect(p.games[1]).toMatchObject({ division_key: null, team1: { divisionKey: 'div_c1', code: 't_c2' } });
    expect(p.games[2]).toMatchObject({ team1: { code: 't_c1' }, team2: null, type: 'group' });
  });

  it('clamps division settings and refuses a team code used twice', () => {
    expect(p.divisions.map((d) => [d.legacy_key, d.color, d.bracket_count, d.games_per_team, d.teams.length])).toEqual([
      ['div_c1', '#6C63FF', 4, 20, 2],
      ['div_c2', '#E06040', 1, null, 0],
    ]);
    expect(codes(issues)).toEqual([
      'division.brackets',
      'division.colour',
      'division.games_per_team',
      'game.division_missing',
      'game.gid_assigned',
      'game.gid_repeated',
      'game.not_object',
      'game.same_team',
      'game.type_unknown',
      'score.orphan',
      'source.orphan',
      'team.code_reused',
    ]);
    expect(issues.find((i) => i.code === 'team.code_reused')!.level).toBe('error');
  });
});

describe('mapping edge cases', () => {
  const minimal = (extra: Record<string, unknown>) => mapEvent('x', { name: 'E', ...extra }, opts);

  it('refuses a value that is not an event, and hours that cannot be stored', () => {
    expect(mapEvent('x', 'str', opts)).toEqual({
      plan: null,
      issues: [expect.objectContaining({ level: 'error', code: 'event.not_object' })],
    });
    const late = minimal({ timeStart: '23:59', timeEnd: '10:00' });
    expect(late.plan).toBeNull();
    expect(codes(late.issues)).toEqual(['event.hours_order', 'event.hours_order']);
  });

  it('repairs hours, courts, colours, long text and odd rows, saying so each time', () => {
    const { plan, issues } = minimal({
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
    });
    const p = plan!;
    expect(p.event).toMatchObject({
      time_start: '10:00',
      time_end: '23:59',
      courts: 10,
      theme_primary: '#FFCC00',
      theme_bg: '#AABBCC',
    });
    expect(p.event.name).toHaveLength(200);
    expect(p.logo).toBeNull();
    expect(p.sponsors).toEqual([]);
    expect(p.divisions.map((d) => d.legacy_key)).toEqual(['d1', 'd3', 'd4']);
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
    // d3 and d4 had no colour: they take the old cycle's colour, said once each.
    expect(codes(issues)).toEqual([
      'division.brackets',
      'division.colour',
      'division.colour',
      'division.games_per_team',
      'division.not_object',
      'event.courts_range',
      'event.hours_order',
      'event.theme_colour',
      'game.court_beyond',
      'game.court_invalid',
      'game.day_invalid',
      'game.day_invalid',
      'game.day_outside',
      'game.day_outside',
      'game.day_outside',
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
    const kinds = verifyEvent(events[A], scored, legacy).map((d) => d.kind);
    expect(kinds).toContain('score');
    expect(kinds).toContain('standings');
    expect(kinds).toContain('playoff');

    const seeded = base();
    seeded.games[3]!.team1_source = { type: 'seed', rank: 3 };
    expect(verifyEvent(events[A], seeded, legacy)).toEqual([
      { kind: 'playoff', where: 'game 4 ("Open - Finals")', old: expect.any(String), new: expect.any(String) },
    ]);
  });

  it('finds a team order that differs from the old key order', () => {
    const reordered = base();
    reordered.divisions[0]!.teams.reverse().forEach((t, i) => (t.sort_order = i));
    reordered.games.forEach((g) => (g.score = null));
    const diffs = verifyEvent(events[A], reordered, legacy);
    expect(diffs.some((d) => d.kind === 'standings')).toBe(true);
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
    expect(report.totals).toEqual({ events: 4, ready: 1, errors: 2, warnings: 13, differences: 3 });
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
    const text = formatReport(report);
    expect(text).toContain('dry run: nothing was written');
    expect(text).toContain('4 event(s): 1 ready, 2 error(s), 13 warning(s), 3 difference(s)');
    expect(text).toContain('READY  Harbour Spring Cup');
    expect(text).toContain('CHECK  Winter Social');
    expect(text).toContain('DIFFERENCE score at game 2 ("Mixed"): old [30,-5], new [30,0]');
    expect(text).not.toContain('—');
    expect(JSON.stringify(report)).not.toContain('base64');
  });
});

describe('npm run migrate:firebase', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', 'scripts/migrate-firebase.ts', ...args], {
      encoding: 'utf8',
      timeout: 60_000,
    });

  it('prints the dry-run report and fails while anything needs a look', () => {
    const r = run('--file', 'tests/fixtures/firebase-export.json');
    expect(r.stdout).toContain('dry run: nothing was written');
    expect(r.stdout).toContain('READY  Harbour Spring Cup');
    expect(r.status).toBe(1);
  }, 60_000);

  it('passes for a clean event, and refuses to write or to run without an export', () => {
    expect(run('--file', 'tests/fixtures/firebase-export.json', `--event=${A}`).status).toBe(0);
    // A push id after a space reads as an option: the script says how to give it.
    expect(run('--file', 'tests/fixtures/firebase-export.json', '--event', A).stderr).toContain('--event=<id>');
    const apply = run('--file', 'tests/fixtures/firebase-export.json', '--apply');
    expect(apply.status).toBe(2);
    expect(apply.stderr).toContain('Nothing was written');
    expect(run().status).toBe(2);
    expect(run('--file', 'x.json', '--timezone', 'Mars/Base').stderr).toContain('is not a time zone');
  }, 60_000);
});
