import { describe, expect, it } from 'vitest';

import { buildReport } from '@/features/reports/build';
import { MOBILE_UNVERIFIED, type ReportDefinition, type ReportSource } from '@/features/reports/model';
import {
  allGamesLabel,
  builderOptions,
  datesSummary,
  defaultDay,
  definitionFromQuery,
  definitionFromState,
  formProblem,
  gameDays,
  gameLabel,
  gamesFor,
  isDay,
  pickDay,
  playersFor,
  readReportSources,
  settle,
  stateFromQuery,
  teamsFor,
  type BuilderState,
} from '@/features/reports/builder-options';
import { presetUrl } from '@/features/reports/presets';
import { reportDefinitionSchema, reportDocumentSchema } from '@/features/reports/schema';
import { SAMPLE_REPORT_EVENT, sampleReportSource } from '@/prototype/report-sample';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OPEN = uuid(11);
const WOMEN = uuid(12);
const WARRIORS = uuid(21);
const HAWKS = uuid(23);
const TUI = uuid(25);
const source = sampleReportSource();
const o = builderOptions(source);
const blank = stateFromQuery({});
const state = (patch: Partial<BuilderState> = {}): BuilderState => ({ ...blank, ...patch });
const ids = (games: { id: string }[]) => games.map((g) => Number(g.id.slice(-3)));

describe('report form lists', () => {
  it('lists the games in day and time order with the players and the teams they recorded stats for', () => {
    expect(ids(o.games)).toEqual([101, 102, 103, 104, 105, 106, 107, 108]);
    expect(o.divisions.map((d) => d.name)).toEqual(['Open', 'Women']);
    expect(o.players[0]).toEqual({ id: 'm-alex', name: 'Alex Moana', teamIds: [uuid(24)] });
    expect(o.players.map((p) => p.name)).toContain('Tāne Rewi');
    expect(o.players).toHaveLength(14);
  });

  it('adds players found by a later read, and keeps games without a date last', () => {
    const later = structuredClone(source);
    later.players.push({ id: 'm-new', name: 'Zed New' });
    later.games[0]!.mobileEvents.push({ id: 'x', teamId: WARRIORS, playerId: 'm-new', type: 'fg2_make' });
    const first = structuredClone(source);
    first.players = [];
    first.games.push({ ...first.games[0]!, id: uuid(199), date: '', startTime: '' });
    const merged = builderOptions(first, [later]);
    expect(merged.players.at(-1)).toEqual({ id: 'm-new', name: 'Zed New', teamIds: [WARRIORS] });
    expect(ids(merged.games).at(-1)).toBe(199);
  });

  it('narrows teams, game days, games and players to the chosen league and team', () => {
    expect(teamsFor(o, state()).map((t) => t.name)).toHaveLength(6);
    expect(teamsFor(o, state({ divisionId: WOMEN })).map((t) => t.name)).toEqual(['Tūī', 'Kea']);
    expect(gameDays(o, state({ divisionId: OPEN }))).toEqual([
      { date: '2026-10-03', games: 2, scored: 2 },
      { date: '2026-10-10', games: 2, scored: 2 },
      { date: '2026-10-17', games: 2, scored: 0 },
    ]);
    expect(gameDays(o, state({ teamId: TUI })).map((d) => d.date)).toEqual(['2026-10-03', '2026-10-10']);
    expect(ids(gamesFor(o, state({ teamId: HAWKS })))).toEqual([102, 104, 108]);
    expect(playersFor(o, state({ divisionId: WOMEN })).map((p) => p.name)).toEqual([
      'Ana Pōtae',
      'Aroha Smith',
      'Lily Chen',
      'Mere Hohaia',
    ]);
    expect(playersFor(o, state({ teamId: HAWKS })).map((p) => p.name)).toEqual(['Bea Cooper', 'Jo Lee']);
  });

  it('narrows games to the chosen day, range or days', () => {
    expect(ids(gamesFor(o, state({ dateMode: 'day', day: '2026-10-03' })))).toEqual([101, 102, 103]);
    expect(ids(gamesFor(o, state({ dateMode: 'day', day: '2026-10-04' })))).toEqual([]);
    expect(ids(gamesFor(o, state({ dateMode: 'range', from: '2026-10-04', to: '2026-10-17' })))).toEqual([
      104, 105, 106, 107, 108,
    ]);
    expect(ids(gamesFor(o, state({ dateMode: 'range', from: '', to: '' })))).toEqual([]);
    expect(ids(gamesFor(o, state({ dateMode: 'dates', days: ['2026-10-03', '2026-10-17'] })))).toEqual([
      101, 102, 103, 107, 108,
    ]);
    expect(ids(gamesFor(o, state({ dateMode: 'all', divisionId: WOMEN })))).toEqual([103, 106]);
  });

  it('starts one day on the latest day with a score', () => {
    expect(defaultDay(o, state())).toBe('2026-10-10');
    expect(defaultDay(o, state({ divisionId: WOMEN }))).toBe('2026-10-10');
    const unplayed = builderOptions({ ...source, games: source.games.slice(-2) });
    expect(defaultDay(unplayed, state())).toBe('2026-10-17');
    expect(defaultDay(builderOptions({ ...source, games: [] }), state())).toBe('');
  });
});

describe('report form changes', () => {
  it('clears a team, game or player that the new league or dates no longer include', () => {
    const picked = state({
      divisionId: OPEN,
      teamId: HAWKS,
      gameId: uuid(102),
      template: 'player-log',
      playerId: 'm-bea',
    });
    expect(settle(o, picked)).toEqual(picked);
    expect(settle(o, { ...picked, divisionId: WOMEN })).toMatchObject({ teamId: '', gameId: '', playerId: '' });
    expect(settle(o, { ...picked, dateMode: 'day', day: '2026-10-10' })).toMatchObject({ teamId: HAWKS, gameId: '' });
    expect(settle(o, { ...picked, teamId: WARRIORS })).toMatchObject({ playerId: '', gameId: '' });
    expect(settle(o, state({ divisionId: 'gone' })).divisionId).toBe('');
  });

  it('starts a date choice where the games are', () => {
    expect(settle(o, state({ dateMode: 'day' })).day).toBe('2026-10-10');
    expect(settle(o, state({ dateMode: 'day', day: '2026-10-04' })).day).toBe('2026-10-04');
    expect(settle(o, state({ dateMode: 'range' }))).toMatchObject({ from: '2026-10-03', to: '2026-10-17' });
    expect(settle(o, state({ dateMode: 'dates' })).days).toEqual([]);
  });

  it('turns calendar clicks into a day, a range either way round, or a set of days', () => {
    expect(pickDay(state({ dateMode: 'day', day: '2026-10-03' }), '2026-10-10').day).toBe('2026-10-10');
    const started = pickDay(state({ dateMode: 'range', from: '2026-10-03', to: '2026-10-17' }), '2026-10-10');
    expect(started).toMatchObject({ from: '2026-10-10', to: '2026-10-10' });
    expect(pickDay(started, '2026-10-17')).toMatchObject({ from: '2026-10-10', to: '2026-10-17' });
    expect(pickDay(started, '2026-10-03')).toMatchObject({ from: '2026-10-03', to: '2026-10-10' });
    const one = pickDay(state({ dateMode: 'dates' }), '2026-10-10');
    expect(pickDay(one, '2026-10-03').days).toEqual(['2026-10-03', '2026-10-10']);
    expect(pickDay(pickDay(one, '2026-10-03'), '2026-10-10').days).toEqual(['2026-10-03']);
    const all = state();
    expect(pickDay(all, '2026-10-10')).toBe(all);
  });
});

describe('report form wording', () => {
  it('names games and the all-games choice the way an organiser reads them', () => {
    const [g101, , g103, , , , g107] = o.games;
    expect(gameLabel(o, g101!, { withDate: false, withDivision: false })).toBe(
      '6:00 pm · Kōwhai Warriors 38 - 35 Te Kapa Rangi',
    );
    expect(gameLabel(o, g103!, { withDate: true, withDivision: true })).toBe(
      'Sat 03/10/2026 · 8:00 pm · Women · Tūī 48 - 52 Kea',
    );
    expect(gameLabel(o, g107!, { withDate: false, withDivision: false })).toBe(
      '6:00 pm · Kōwhai Warriors vs Night Owls (no score yet)',
    );
    expect(
      gameLabel(
        o,
        { ...g107!, date: '', startTime: '25:00', homeTeamId: null },
        { withDate: true, withDivision: false },
      ),
    ).toBe('Date TBC · TBC vs Night Owls (no score yet)');
    expect(allGamesLabel(state({ dateMode: 'day', day: '2026-10-03' }), 3)).toBe('All 3 games on Sat 03/10/2026');
    expect(allGamesLabel(state({ dateMode: 'day', day: '2026-10-04' }), 0)).toBe('No games on Sun 04/10/2026');
    expect(allGamesLabel(state({ dateMode: 'day' }), 0)).toBe('Choose a day first');
    expect(allGamesLabel(state({ dateMode: 'range', from: '2026-10-03', to: '2026-10-10' }), 1)).toBe(
      'All 1 game from 03/10/2026 to 10/10/2026',
    );
    expect(allGamesLabel(state({ dateMode: 'range' }), 0)).toBe('Choose the dates first');
    expect(allGamesLabel(state({ dateMode: 'dates', days: ['2026-10-03'] }), 3)).toBe('All 3 games on the chosen days');
    expect(allGamesLabel(state({ dateMode: 'dates' }), 0)).toBe('Choose game days first');
    expect(allGamesLabel(state(), 8)).toBe('All 8 games');
  });

  it('sums up the chosen dates under the calendar', () => {
    expect(datesSummary(o, state({ dateMode: 'day', day: '2026-10-03' }))).toBe('Sat 03/10/2026 · 3 games');
    expect(datesSummary(o, state({ dateMode: 'day' }))).toBe('No day chosen');
    expect(datesSummary(o, state({ dateMode: 'range', from: '2026-10-03', to: '2026-10-10' }))).toBe(
      'Sat 03/10/2026 to Sat 10/10/2026 · 6 games',
    );
    expect(datesSummary(o, state({ dateMode: 'range' }))).toBe('No dates chosen');
    expect(datesSummary(o, state({ dateMode: 'dates', days: ['2026-10-17'] }))).toBe('1 day · 2 games');
    expect(datesSummary(o, state({ dateMode: 'dates' }))).toBe('No days chosen');
    expect(datesSummary(o, state())).toBe('');
  });

  it('says what is missing before a report can be shown', () => {
    expect(formProblem(o, state())).toBeNull();
    expect(formProblem(o, state({ template: 'team' }))).toEqual({
      field: 'team',
      message: 'Choose a team for team statistics.',
    });
    expect(formProblem(o, state({ template: 'player-log' }))?.message).toBe('Choose a player for the game log.');
    expect(
      formProblem(builderOptions({ ...source, players: [], games: [] }), state({ template: 'player-log' }))?.message,
    ).toBe('No player has recorded stats in this selection yet.');
    expect(formProblem(o, state({ dateMode: 'day' }))?.field).toBe('dates');
    expect(formProblem(o, state({ dateMode: 'range', from: '2026-10-10', to: '2026-10-03' }))?.message).toBe(
      'Choose the first and last day on the calendar.',
    );
    expect(formProblem(o, state({ dateMode: 'dates' }))?.message).toBe('Choose at least one game day on the calendar.');
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-10-03')).toBe(true);
  });
});

describe('report form and address', () => {
  it('reads the form from the address, ignoring anything unknown', () => {
    expect(blank).toMatchObject({
      template: 'results',
      dateMode: 'all',
      relative: '',
      standingsScope: 'through-cutoff',
    });
    expect(
      stateFromQuery({
        template: 'bogus',
        dateMode: 'week',
        dates: 'x',
        relative: 'first',
        standings: 'odd',
        minAppearances: '-2',
        minAttempts: '1.5',
      }),
    ).toMatchObject({ template: 'results', dateMode: 'all', relative: '', minAppearances: 0, minAttempts: 0 });
    expect(stateFromQuery({ dateMode: 'range', dates: '2026-10-03' })).toMatchObject({
      from: '2026-10-03',
      to: '2026-10-03',
    });
    expect(stateFromQuery({ dateMode: 'dates', dates: '2026-10-10,2026-10-03,2026-10-10,nope' }).days).toEqual([
      '2026-10-03',
      '2026-10-10',
    ]);
    expect(
      stateFromQuery({
        template: 'leaders',
        minAppearances: '3',
        relative: 'latest',
        standings: 'selected-games',
        team: ['a', 'b'],
      }),
    ).toMatchObject({
      template: 'leaders',
      minAppearances: 3,
      relative: 'latest',
      standingsScope: 'selected-games',
      teamId: '',
    });
  });

  it('sends only the choices the report uses, and opens the same report again from its address', () => {
    const box = state({
      template: 'box-score',
      divisionId: OPEN,
      dateMode: 'day',
      day: '2026-10-03',
      gameId: uuid(101),
      playerId: 'm-maia',
      standingsScope: 'selected-games',
      minAppearances: 2,
    });
    const asked = definitionFromState(SAMPLE_REPORT_EVENT, box);
    expect(asked).toEqual({
      eventId: SAMPLE_REPORT_EVENT,
      template: 'box-score',
      divisionId: OPEN,
      teamId: undefined,
      playerId: undefined,
      gameIds: [uuid(101)],
      dateMode: 'day',
      dates: ['2026-10-03'],
      relative: undefined,
      standingsScope: undefined,
      minAppearances: undefined,
      minAttempts: undefined,
    });
    const query = Object.fromEntries(new URL(presetUrl(asked, '/prototype/reports'), 'http://x').searchParams);
    expect(query).toMatchObject({ preview: '1', template: 'box-score', dates: '2026-10-03', game: uuid(101) });
    expect(reportDefinitionSchema.parse(definitionFromQuery(query, SAMPLE_REPORT_EVENT))).toEqual(
      reportDefinitionSchema.parse(asked),
    );
    expect(stateFromQuery(query)).toMatchObject({ template: 'box-score', day: '2026-10-03', gameId: uuid(101) });

    const log = definitionFromState(
      SAMPLE_REPORT_EVENT,
      state({ template: 'player-log', playerId: 'm-maia', gameId: uuid(101) }),
    );
    expect(log).toMatchObject({ playerId: 'm-maia', gameIds: undefined });
    const leaders = definitionFromState(SAMPLE_REPORT_EVENT, state({ template: 'leaders', minAttempts: 4 }));
    expect(leaders).toMatchObject({ minAppearances: 0, minAttempts: 4, standingsScope: undefined });
    const results = definitionFromState(
      SAMPLE_REPORT_EVENT,
      state({ dateMode: 'range', from: '2026-10-03', to: '2026-10-10' }),
    );
    expect(results).toMatchObject({ standingsScope: 'through-cutoff', dates: ['2026-10-03', '2026-10-10'] });
    expect(definitionFromState(SAMPLE_REPORT_EVENT, state({ dateMode: 'dates', days: ['2026-10-17'] })).dates).toEqual([
      '2026-10-17',
    ]);
    expect(definitionFromState(SAMPLE_REPORT_EVENT, state({ dateMode: 'day' })).dates).toEqual([]);
    expect(definitionFromState(SAMPLE_REPORT_EVENT, state({ dateMode: 'range' })).dates).toEqual([]);
  });

  it('keeps the server reading an address exactly as before', () => {
    expect(definitionFromQuery({}, 'e')).toEqual({
      eventId: 'e',
      template: 'results',
      divisionId: undefined,
      teamId: undefined,
      playerId: undefined,
      gameIds: undefined,
      dateMode: 'all',
      dates: [],
      relative: undefined,
      standingsScope: undefined,
      minAppearances: undefined,
      minAttempts: undefined,
    });
    expect(
      definitionFromQuery(
        { dateMode: 'dates', dates: ' 2026-10-03 , ,2026-10-10', minAttempts: '2', minAppearances: '0' },
        'e',
      ),
    ).toMatchObject({ dates: ['2026-10-03', '2026-10-10'], minAttempts: 2, minAppearances: 0 });
    expect(definitionFromQuery({ dateMode: 'all', dates: '2026-10-03' }, 'e').dates).toEqual([]);
  });
});

describe('review follow-ups', () => {
  it('marks the player list complete and today empty unless the page says otherwise', () => {
    expect(o).toMatchObject({ playersComplete: true, today: '' });
    expect(builderOptions(source, [], { playersComplete: false, today: '2026-10-17' })).toMatchObject({
      playersComplete: false,
      today: '2026-10-17',
    });
  });

  it('starts one day on the chosen game, so switching to one day keeps it', () => {
    const picked = settle(o, state({ gameId: uuid(101), dateMode: 'day' }));
    expect(picked).toMatchObject({ day: '2026-10-03', gameId: uuid(101) });
  });

  it('explains an empty player list when the stats could not be read for the whole event', () => {
    const partial = builderOptions(
      { ...source, players: [], games: source.games.map((g) => ({ ...g, mobileEvents: [] })) },
      [],
      {
        playersComplete: false,
      },
    );
    expect(formProblem(partial, state({ template: 'player-log' }))?.message).toBe(
      'Player stats could not be read for the whole event. Choose a league or team, then Find players.',
    );
  });

  it('reads the whole event once, and the chosen games again only when the whole event could not be read', async () => {
    const connect: ReportSource = {
      ...source,
      players: [],
      games: source.games.map((g) => ({ ...g, mobileEvents: [] })),
    };
    const wanted: ReportDefinition = {
      eventId: SAMPLE_REPORT_EVENT,
      template: 'player-log',
      divisionId: WOMEN,
      dateMode: 'all',
      dates: [],
    };
    const calls: ReportDefinition[] = [];

    const ok = await readReportSources(
      connect,
      wanted,
      async (_s, d) => {
        calls.push(d);
        return source;
      },
      '2026-10-17',
    );
    expect(calls).toEqual([{ eventId: SAMPLE_REPORT_EVENT, template: 'box-score', dateMode: 'all', dates: [] }]);
    expect(ok.source).toBe(source);
    expect(ok.options).toMatchObject({ playersComplete: true, today: '2026-10-17' });
    expect(ok.options.players).toHaveLength(14);

    calls.length = 0;
    // A read of the Women league returns its games and the players in them.
    const womenGames = source.games.filter((g) => g.divisionId === WOMEN);
    const inWomen = new Set(womenGames.flatMap((g) => g.mobileEvents.map((e) => e.playerId)));
    const women = { ...source, games: womenGames, players: source.players.filter((p) => inWomen.has(p.id)) };
    const narrowed = await readReportSources(connect, wanted, async (_s, d) => {
      calls.push(d);
      return d.divisionId ? women : { ...connect, warnings: [MOBILE_UNVERIFIED] };
    });
    expect(calls.map((d) => d.divisionId)).toEqual([undefined, WOMEN]);
    expect(narrowed.source).toBe(women);
    expect(narrowed.options.playersComplete).toBe(false);
    expect(narrowed.options.players.map((p) => p.name)).toEqual([
      'Ana Pōtae',
      'Aroha Smith',
      'Lily Chen',
      'Mere Hohaia',
    ]);
  });
});

describe('sample season', () => {
  it('builds a day of box scores with player lines, team totals and the one differing official score', () => {
    const doc = buildReport(
      source,
      definitionFromState(SAMPLE_REPORT_EVENT, state({ template: 'box-score', dateMode: 'day', day: '2026-10-10' })),
      '2026-10-17T07:00:00.000Z',
    );
    expect(doc.tables.map((t) => t.title)).toEqual([
      'Player totals · 3 games',
      'Sat 10/10/2026 · 6:00 pm · Open: Kōwhai Warriors 33 - 28 Harbour Hawks',
      'Sat 10/10/2026 · 7:00 pm · Open: Te Kapa Rangi 34 - 25 Night Owls',
      'Sat 10/10/2026 · 8:00 pm · Women: Kea 26 - 25 Tūī',
    ]);
    const rangi = doc.tables[2]!.rows.filter((r) => r.team === 'Te Kapa Rangi').map((r) => [r.player, r.points]);
    expect(rangi).toEqual([
      ['Rua Parata', 16],
      ['Hemi Walker', 10],
      ['Tāne Rewi', 6],
      ['Team total', 32],
      ['Final score (2 not in player stats)', 34],
    ]);
    expect(reportDocumentSchema.safeParse(doc).error?.issues).toBeUndefined();
  });
});
