import { describe, expect, it } from 'vitest';

import { divisionsLabel, toHomeCards, type HomeEventRow } from '@/lib/public-event/home';
import {
  hhmm,
  imageUrl,
  scoredGames,
  toEventModel,
  toTodayEvent,
  type EventRows,
  type GameRow,
} from '@/lib/public-event/model';

const URL_ = 'http://127.0.0.1:54321';

function gameRow(over: Partial<GameRow>): GameRow {
  return {
    id: 'g',
    division_id: 'd1',
    day: '2026-10-03',
    start_time: '09:00:00',
    court: 1,
    group_id: null,
    team1_id: 't1',
    team2_id: 't2',
    label: 'Open',
    type: 'group',
    is_playoff: false,
    bracket_game_id: null,
    team1_source: null,
    team2_source: null,
    playoff_round: null,
    position: 0,
    ...over,
  };
}

function rows(over: Partial<EventRows> = {}): EventRows {
  return {
    event: {
      id: 'e1',
      name: 'Spring Hoops',
      status: 'published',
      schedule_days: ['2026-10-04', '2026-10-03', '2026-10-03'],
      time_start: '09:00:00',
      time_end: '20:00:00',
      courts: 2,
      court_names: ['Main', 'Side'],
      timezone: 'America/Vancouver',
      logo_path: 'events/e1/logo 1.png',
      theme_primary: '#C8102E',
      theme_bg: '#FFFFFF',
      theme_text: '#1A1A1A',
      theme_text_secondary: '#5C5C5C',
      theme_heading: '#0B2545',
      rules_html: '',
    },
    divisions: [
      { id: 'd2', name: 'Second', color: '#2BBF8A', sort_order: 1, created_at: '2026-09-01' },
      { id: 'd1', name: 'First', color: '#6C63FF', sort_order: 0, created_at: '2026-09-02' },
    ],
    teams: [
      { id: 't2', division_id: 'd1', name: 'Bolts', coach: '', sort_order: 1, created_at: 'a' },
      { id: 't1', division_id: 'd1', name: 'Hawks', coach: 'Sam', sort_order: 0, created_at: 'b' },
      { id: 't3', division_id: 'd2', name: 'Owls', coach: '', sort_order: 0, created_at: 'c' },
    ],
    players: [
      { id: 'p2', team_id: 't1', name: 'Bea', number: '7', sort_order: 1 },
      { id: 'p1', team_id: 't1', name: 'Ari', number: '4', sort_order: 0 },
    ],
    games: [
      gameRow({ id: 'g2', position: 1, start_time: '10:00:00' }),
      gameRow({ id: 'g1', position: 0 }),
      gameRow({
        id: 'po',
        position: 2,
        start_time: '11:00:00',
        type: 'final',
        is_playoff: true,
        team1_id: null,
        team2_id: null,
        bracket_game_id: 'po_d1_1',
        team1_source: { type: 'seed', rank: 1 },
        team2_source: { type: 'seed', rank: 2 },
        playoff_round: 1,
      }),
      gameRow({
        id: 'bad-po',
        position: 3,
        day: null,
        start_time: null,
        court: null,
        is_playoff: true,
        team1_source: { rank: 'x' },
      }),
      gameRow({ id: 'orphan', position: 4, division_id: null, type: 'weird' }),
    ],
    scores: [
      { game_id: 'g1', s1: 50, s2: 40 },
      { game_id: 'g2', s1: 41, s2: 45 },
    ],
    eventSponsors: [
      { tier: 'minor', image_path: 'events/e1/m2.png', sort_order: 2 },
      { tier: 'major', image_path: 'events/e1/major.png', sort_order: 0 },
      { tier: 'minor', image_path: 'events/e1/m1.png', sort_order: 1 },
    ],
    platformSponsors: [
      { tier: 'secondary', image_path: 'platform/s.png', sort_order: 0 },
      { tier: 'primary', image_path: 'platform/p.png', sort_order: 0 },
    ],
    ...over,
  };
}

describe('public event model (PRD P-01 to P-10)', () => {
  const model = toEventModel(rows(), URL_);

  it('keeps sort orders, de-duplicates and sorts days, and maps the organiser colours', () => {
    expect(model.days).toEqual(['2026-10-03', '2026-10-04']);
    expect(model.divisions.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(model.divisions[0]!.teamIds).toEqual(['t1', 't2']);
    expect(model.teams[0]!.players.map((p) => p.name)).toEqual(['Ari', 'Bea']);
    expect(model.teams[1]!.players).toEqual([]);
    expect(model.theme).toEqual({
      primary: '#C8102E',
      bg: '#FFFFFF',
      text: '#1A1A1A',
      textSecondary: '#5C5C5C',
      heading: '#0B2545',
    });
  });

  it('orders games by position and normalises Postgres times', () => {
    expect(model.games.map((g) => g.id)).toEqual(['g1', 'g2', 'po', 'bad-po', 'orphan']);
    expect(model.games[1]!.time).toBe('10:00');
    expect(hhmm(null)).toBeNull();
  });

  it('keeps a valid playoff link, drops an invalid one, and tolerates a deleted division', () => {
    expect(model.games[2]!.playoff).toEqual({
      bracketGameId: 'po_d1_1',
      team1Source: { type: 'seed', rank: 1 },
      team2Source: { type: 'seed', rank: 2 },
      round: 1,
    });
    expect(model.games[3]!.playoff).toBeUndefined();
    // Still a playoff game: it must not count towards standings or block seeding.
    expect(model.games[3]!.type).toBe('semi');
    expect(model.games[4]).toMatchObject({ divisionId: '', type: 'group' });
  });

  it('builds image URLs for the logo and sponsors, in sponsor order', () => {
    expect(model.logoUrl).toBe(`${URL_}/storage/v1/object/public/images/events/e1/logo%201.png`);
    expect(model.sponsors.major).toBe(`${URL_}/storage/v1/object/public/images/events/e1/major.png`);
    expect(model.sponsors.minor.map((u) => u.split('/').at(-1))).toEqual(['m1.png', 'm2.png']);
    expect(model.sponsors.platformPrimary).toHaveLength(1);
    expect(model.sponsors.platformSecondary).toHaveLength(1);
    expect(imageUrl(`${URL_}/`, null)).toBeNull();
    expect(imageUrl(`${URL_}/`, 'a b/c.png')).toBe(`${URL_}/storage/v1/object/public/images/a%20b/c.png`);
  });

  it('a draft stays a draft, and missing sponsors are empty', () => {
    const draft = toEventModel(
      rows({ event: { ...rows().event, status: 'draft', logo_path: null }, eventSponsors: [] }),
      URL_,
    );
    expect(draft.status).toBe('draft');
    expect(draft.logoUrl).toBeNull();
    expect(draft.sponsors.major).toBeNull();
  });

  it('merges scores and resolves playoff seeds once the round robin is complete (P-06)', () => {
    const games = scoredGames(model);
    const po = games.find((g) => g.id === 'po')!;
    // Hawks and Bolts are 1-1: Hawks ahead on points difference (91-85 vs 85-91).
    expect([po.team1Id, po.team2Id]).toEqual(['t1', 't2']);
    const unfinished = scoredGames(model, { g1: { score1: 50, score2: 40 } });
    expect(unfinished.find((g) => g.id === 'po')!.team1Id).toBeNull();
  });

  it('builds the Schedule tab view with live scores and paint-in marks', () => {
    const today = toTodayEvent(model, { ...model.scores, g1: { score1: 52, score2: 40 } }, { g1: 99 });
    expect(today.games.find((g) => g.id === 'g1')).toMatchObject({ score1: 52, changedAt: 99 });
    expect(today.games.find((g) => g.id === 'g2')!.changedAt).toBeUndefined();
    expect(today.courtNames).toEqual(['Main', 'Side']);
    expect(today.teams).toContainEqual({ id: 't3', name: 'Owls', divisionId: 'd2' });
  });
});

describe('home cards (PRD H-01 to H-05)', () => {
  const row = (id: string, days: string[], tz = 'Pacific/Auckland', count = 2): HomeEventRow => ({
    id,
    name: id,
    schedule_days: days,
    timezone: tz,
    logo_path: null,
    divisions: [{ count }],
  });
  // 26/09/2026 02:00 UTC: 14:00 on 26/09 in Auckland, 19:00 on 25/09 in Vancouver.
  const now = new Date('2026-09-26T02:00:00Z');

  it('lists current and upcoming first by first day, then past (most recent first), then undated', () => {
    const cards = toHomeCards(
      [
        row('past-old', ['2026-01-10']),
        row('undated-b', []),
        row('later', ['2026-11-01', '2026-11-02']),
        row('past-recent', ['2026-09-01', '2026-09-20']),
        row('now', ['2026-09-20', '2026-09-26']),
        row('undated-a', []),
        row('soon', ['2026-10-01']),
      ],
      URL_,
      now,
    );
    expect(cards.map((c) => c.id)).toEqual([
      'now',
      'soon',
      'later',
      'past-recent',
      'past-old',
      'undated-a',
      'undated-b',
    ]);
    expect(cards[0]).toMatchObject({ when: 'current', firstDay: '2026-09-20', lastDay: '2026-09-26' });
  });

  it('decides "today" in each event time zone', () => {
    const [nz, bc] = toHomeCards(
      [row('nz', ['2026-09-26'], 'Pacific/Auckland'), row('bc', ['2026-09-26'], 'America/Vancouver')],
      URL_,
      now,
    );
    expect(nz!.when).toBe('current');
    expect(bc!.when).toBe('upcoming');
  });

  it('counts divisions and labels them in words', () => {
    const [c] = toHomeCards([{ ...row('x', ['2026-10-01']), divisions: [] }], URL_, now);
    expect(c!.divisionCount).toBe(0);
    expect(divisionsLabel(1)).toBe('1 division');
    expect(divisionsLabel(3)).toBe('3 divisions');
  });
});
