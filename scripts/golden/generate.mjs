// Golden file generator for the domain parity suite (MIGRATION_PLAN.md phase 2).
//
// Runs ONLY the legacy code in scripts/golden/legacy/ (verbatim copies of
// iTala-platform) on fixed and seeded-random inputs, and writes
// tests/golden/*.json with each input and the legacy output. The TypeScript
// port is compared against these files in tests/unit/golden-parity.test.ts.
//
// Never regenerate these files to make a failing test pass (CLAUDE.md). Run
// it only when the case list below changes:  npm run golden:generate
//
// The old code decides "same day" in the browser's local zone; the port
// takes the event zone (PRD M-08). Pin the zone here so both sides agree.
process.env.TZ = 'Pacific/Auckland';

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Scheduler = require('./legacy/scheduler.js');
globalThis.Scheduler = Scheduler;
const App = require('./legacy/app-extract.js');
const integrationContext = { console, Date, Math, JSON, String, Number, Object, Array, parseInt, isFinite, isNaN };
vm.runInNewContext(
  `${readFileSync(join(here, 'legacy/integration.js'), 'utf8')}\nthis.Integration = Integration;`,
  integrationContext,
);
const Integration = integrationContext.Integration;

const out = join(here, '../../tests/golden');
mkdirSync(out, { recursive: true });
const clone = (v) => JSON.parse(JSON.stringify(v));
const write = (name, cases) => {
  writeFileSync(
    join(out, `${name}.json`),
    `${JSON.stringify({ generatedBy: 'scripts/golden/generate.mjs', cases })}\n`,
  );
  console.log(`${name}.json: ${cases.length} cases`);
};

// Seeded PRNG (mulberry32) so every run writes the same files.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pad = (n) => String(n).padStart(2, '0');

const DAYS = ['2026-10-03', '2026-10-04', '2026-10-10', '2026-10-11'];

function division(id, name, teams, extra = {}) {
  const t = {};
  for (let i = 1; i <= teams; i++) t[`${id}t${i}`] = { name: `${name} team ${i}` };
  return { name, teams: t, bracketCount: 1, ...extra };
}

// ---- Events ------------------------------------------------------------

const fixedEvents = [
  {
    id: 'four-one-court',
    scheduleDays: [DAYS[0]],
    courts: 1,
    timeStart: '09:00',
    timeEnd: '20:00',
    divisions: { d1: division('d1', 'Open', 4) },
  },
  {
    id: 'five-odd-two-courts',
    scheduleDays: [DAYS[0]],
    courts: 2,
    timeStart: '09:00',
    timeEnd: '20:00',
    divisions: { d1: division('d1', 'Open', 5) },
  },
  {
    id: 'two-divisions-groups',
    scheduleDays: [DAYS[1], DAYS[0]],
    courts: 3,
    timeStart: '08:00',
    timeEnd: '18:00',
    divisions: { a: division('a', "Men's Open", 6, { bracketCount: 2 }), b: division('b', 'Co-ed', 4) },
  },
  {
    id: 'custom-games-dropped-group',
    scheduleDays: [DAYS[0], DAYS[1]],
    courts: 2,
    timeStart: '09:00',
    timeEnd: '17:00',
    divisions: { a: division('a', 'Juniors', 7, { bracketCount: 3, customGamesPerTeam: true, gamesPerTeam: 2 }) },
  },
  {
    id: 'tight-capacity',
    scheduleDays: [DAYS[0]],
    courts: 1,
    timeStart: '09:00',
    timeEnd: '12:00',
    divisions: { a: division('a', 'Open', 8) },
  },
  {
    id: 'minutes-in-window',
    scheduleDays: [DAYS[0]],
    courts: 2,
    timeStart: '09:30',
    timeEnd: '17:45',
    divisions: { a: division('a', 'Open', 6) },
  },
  {
    id: 'four-brackets-nine',
    scheduleDays: DAYS.slice(0, 2),
    courts: 4,
    timeStart: '09:00',
    timeEnd: '21:00',
    divisions: { a: division('a', 'Big', 9, { bracketCount: 4 }), b: division('b', '', 3) },
  },
  {
    id: 'tiny-and-empty-divisions',
    scheduleDays: [DAYS[0]],
    courts: 2,
    timeStart: '09:00',
    timeEnd: '20:00',
    divisions: { a: division('a', 'Solo', 1), b: division('b', 'None', 0), c: division('c', 'Pair', 2) },
  },
  {
    id: 'no-days',
    scheduleDays: [],
    courts: 2,
    timeStart: '09:00',
    timeEnd: '20:00',
    divisions: { a: division('a', 'Open', 4) },
  },
  {
    id: 'custom-zero-means-full',
    scheduleDays: [DAYS[0]],
    courts: 2,
    timeStart: '09:00',
    timeEnd: '20:00',
    divisions: { a: division('a', 'Open', 4, { customGamesPerTeam: true, gamesPerTeam: 0 }) },
  },
];

function randomEvent(seed) {
  const r = rng(seed);
  const days = DAYS.slice(0, int(r, 1, 3));
  const start = int(r, 7, 11);
  const startMin = r() < 0.3 ? 30 : 0;
  const end = int(r, start + 3, 22);
  const divisions = {};
  const count = int(r, 1, 4);
  for (let d = 1; d <= count; d++) {
    const custom = r() < 0.35;
    divisions[`div${d}`] = division(`div${d}`, `Division ${d}`, int(r, 2, 10), {
      bracketCount: r() < 0.3 ? int(r, 2, 4) : 1,
      ...(custom ? { customGamesPerTeam: true, gamesPerTeam: int(r, 1, 5) } : {}),
    });
  }
  return {
    id: `random-${seed}`,
    scheduleDays: days,
    courts: int(r, 1, 5),
    timeStart: `${pad(start)}:${pad(startMin)}`,
    timeEnd: `${pad(end)}:00`,
    divisions,
  };
}

const randomEvents = Array.from({ length: 40 }, (_, i) => randomEvent(1000 + i));
const events = [...fixedEvents, ...randomEvents];

// ---- 1. Schedule generation ---------------------------------------------

const scheduleCases = events.map((event) => ({ event, output: Scheduler.generateSchedule(clone(event)) }));
write('schedule', scheduleCases);

// ---- 2. Post-publish round robin -----------------------------------------

const rrCases = [];
scheduleCases.forEach(({ event, output }, i) => {
  const r = rng(2000 + i);
  const divIds = Object.keys(event.divisions);
  const divId = divIds[int(r, 0, divIds.length - 1)];
  // Drop some existing games so there are free slots and missing pairings.
  const existing = output.filter(() => r() > 0.3);
  const n = Object.keys(event.divisions[divId].teams).length;
  const gamesPerTeam = r() < 0.5 ? 0 : int(r, 1, Math.max(1, n));
  rrCases.push({
    event,
    divId,
    existing,
    gamesPerTeam,
    output: Scheduler.generateDivisionRoundRobin(clone(event), divId, clone(existing), gamesPerTeam),
  });
});
// Awkward existing games (independent review): an unlisted day, an off-grid
// time, and a court beyond the event's court count.
const awkwardEvent = fixedEvents[2];
const awkwardExisting = [
  ...scheduleCases[2].output.filter((_, i) => i % 3 !== 0),
  {
    day: '2026-10-20',
    time: '10:00 AM',
    court: 1,
    divId: 'b',
    bracketId: null,
    team1: 'bt1',
    team2: 'bt2',
    label: 'Co-ed',
    type: 'group',
    s1: null,
    s2: null,
  },
  {
    day: awkwardEvent.scheduleDays[1],
    time: '8:30 AM',
    court: 2,
    divId: 'b',
    bracketId: null,
    team1: 'bt3',
    team2: 'bt4',
    label: 'Co-ed',
    type: 'group',
    s1: null,
    s2: null,
  },
  {
    day: awkwardEvent.scheduleDays[1],
    time: '1:00 PM',
    court: 4,
    divId: 'a',
    bracketId: 'A',
    team1: 'at1',
    team2: 'at2',
    label: "Men's Open — Group A",
    type: 'group',
    s1: null,
    s2: null,
  },
];
for (const divId of ['a', 'b']) {
  rrCases.push({
    event: { ...awkwardEvent, id: 'awkward-existing' },
    divId,
    existing: awkwardExisting,
    gamesPerTeam: 0,
    output: Scheduler.generateDivisionRoundRobin(clone(awkwardEvent), divId, clone(awkwardExisting), 0),
  });
}
write('round-robin', rrCases);

// ---- 3. Brackets ---------------------------------------------------------

const bracketCases = [];
for (let n = 0; n <= 17; n++) {
  bracketCases.push({ divId: 'd1', divName: 'Open', teams: n, output: Scheduler.generateBracket('d1', 'Open', n) });
}
bracketCases.push({ divId: 'd9', divName: '', teams: 6, output: Scheduler.generateBracket('d9', '', 6) });
write('bracket', bracketCases);

// ---- 4. Standings and playoffs --------------------------------------------

function withScores(schedule, r, fullRate) {
  return schedule.map((g) => {
    const roll = r();
    if (roll < fullRate) {
      const tie = r() < 0.08;
      const s1 = int(r, 0, 90);
      return { ...g, s1, s2: tie ? s1 : int(r, 0, 90) };
    }
    if (roll < fullRate + 0.05) return { ...g, s1: int(r, 0, 60), s2: null };
    return { ...g, s1: null, s2: null };
  });
}

const playoffCases = [];
scheduleCases.forEach(({ event, output }, i) => {
  if (!output.length) return;
  const r = rng(3000 + i);
  const complete = r() < 0.5;
  const scored = withScores(output, r, complete ? 1.01 : 0.6);
  const evt = { ...clone(event), schedule: clone(scored) };
  // Playoffs for up to two divisions, placed by the old editor code.
  const divIds = Object.keys(event.divisions).filter((d) => Object.keys(event.divisions[d].teams).length >= 2);
  divIds.slice(0, 2).forEach((d) => {
    const n = Object.keys(event.divisions[d].teams).length;
    App.generatePlayoff(evt, d, int(r, 2, n));
  });
  // Score some playoff games (ties included) so winner sources resolve.
  evt.schedule.forEach((g) => {
    if (!g.playoff) return;
    if (r() < 0.5) {
      const s1 = int(r, 30, 80);
      g.s1 = s1;
      g.s2 = r() < 0.15 ? s1 : int(r, 30, 80);
    }
  });
  const before = clone(evt);
  const standings = App.publicStandings(clone(evt));
  const resolvedEvt = clone(evt);
  App.resolveAllPlayoffs(resolvedEvt);
  playoffCases.push({
    event: before,
    standings,
    groupComplete: Object.fromEntries(
      Object.keys(event.divisions).map((d) => [d, App.divisionGroupComplete(evt.schedule, d)]),
    ),
    resolved: resolvedEvt.schedule.map((g) => ({ team1: g.team1, team2: g.team2 })),
  });
});
write('standings-playoffs', playoffCases);

// ---- 5. Playoff placement --------------------------------------------------

const placementCases = [];
const placementEvents = [
  ...scheduleCases.slice(0, 30),
  // An empty schedule starts at the first day's start time.
  { event: fixedEvents[0], output: [], teams: 4 },
  // Built to overflow (E-64): a full one-court day, then an 8-team bracket.
  { event: fixedEvents[4], output: scheduleCases[4].output, teams: 8 },
  // Awkward existing games (see the round robin cases above).
  { event: { ...awkwardEvent, id: 'awkward-existing' }, output: awkwardExisting, teams: 4 },
  // Built to roll past the last day before the first playoff game.
  {
    event: { ...fixedEvents[0], id: 'late-last-game', timeEnd: '12:00' },
    output: [
      {
        day: DAYS[0],
        time: '11:00 AM',
        court: 1,
        divId: 'd1',
        bracketId: null,
        team1: 'd1t1',
        team2: 'd1t2',
        label: 'Open',
        type: 'group',
        s1: null,
        s2: null,
      },
    ],
    teams: 2,
  },
];

/*
 * The old placement falls back to "the last day, overflowing" when no slot
 * is left. A real placement is always a free slot inside the window and
 * strictly after the previous one; anything else came from the fallback.
 * From the first overflowed game on, the port parks games in Unscheduled
 * (E-64 Fix), so the test checks parity only before that point.
 */
function markOverflow(event, existing, added) {
  const days = [...event.scheduleDays].sort();
  const endMin = App.parseTimeMin(Scheduler.formatTime(parseInt(event.timeEnd, 10), 0));
  const abs = (g) => days.indexOf(g.day) * 1440 + App.parseTimeMin(g.time);
  const scheduled = existing.filter((g) => g.day && g.time && g.day !== 'TBD' && g.time !== 'TBD');
  let prev = scheduled.length ? Math.max(...scheduled.map(abs)) : -1;
  const used = new Set(scheduled.filter((g) => g.court === 1).map((g) => `${g.day}|${g.time}`));
  let over = false;
  return added.map((g) => {
    const key = `${g.day}|${g.time}`;
    const legit = days.includes(g.day) && App.parseTimeMin(g.time) < endMin && !used.has(key) && abs(g) > prev;
    over = over || !legit;
    used.add(key);
    prev = abs(g);
    return over;
  });
}

placementEvents.forEach(({ event, output, teams: fixedTeams }, i) => {
  const r = rng(4000 + i);
  const divIds = Object.keys(event.divisions).filter((d) => Object.keys(event.divisions[d].teams).length >= 2);
  if (!divIds.length || !event.scheduleDays.length) return;
  const divId = divIds[int(r, 0, divIds.length - 1)];
  const n = Object.keys(event.divisions[divId].teams).length;
  const teams = fixedTeams ?? int(r, 2, n);
  // Whole-hour end times only: the port keeps the end minutes (E-41 Fix).
  if (!event.timeEnd.endsWith(':00')) return;
  const evt = { ...clone(event), schedule: clone(output) };
  App.generatePlayoff(evt, divId, teams);
  const added = evt.schedule.slice(output.length);
  placementCases.push({
    event,
    existing: output,
    divId,
    teams,
    output: added,
    overflow: markOverflow(event, output, added),
  });
});
write('playoff-placement', placementCases);

// ---- 6. Reconcile and matchup counts -----------------------------------------

const reconcileCases = [];
const matchupCases = [];
scheduleCases.forEach(({ event, output }, i) => {
  if (!output.length) return;
  const r = rng(5000 + i);
  const shrunk = {
    ...clone(event),
    schedule: clone(output),
    scheduleDays: event.scheduleDays.filter(() => r() > 0.3),
    timeStart: `${pad(int(r, 7, 12))}:${r() < 0.5 ? '00' : '30'}`,
    timeEnd: `${pad(int(r, 13, 21))}:${r() < 0.5 ? '00' : '15'}`,
    courts: int(r, 1, 4),
  };
  const moved = App.reconcileSchedule(shrunk);
  reconcileCases.push({ event: { ...shrunk, schedule: clone(output) }, moved, output: shrunk.schedule });

  // Duplicate a few fixtures so repeats show up in the counts.
  const sched = clone(output);
  for (let k = 0; k < 3 && sched.length; k++) sched.push(clone(sched[int(r, 0, sched.length - 1)]));
  matchupCases.push({
    schedule: sched,
    divisions: Object.keys(event.divisions).map((d) => {
      const teamCodes = Object.keys(event.divisions[d].teams);
      return { divId: d, teamCodes, output: App.buildMatchupCounts(sched, d, teamCodes) };
    }),
  });
});
write('reconcile', reconcileCases);
write('matchups', matchupCases);

// ---- 7. Mobile matching --------------------------------------------------------

const NOW = Date.parse('2026-10-03T08:00:00Z'); // 21:00 in Auckland
const matchingCases = [];
{
  const r = rng(6000);
  const schedule = [];
  const codes = ['h1', 'h2', 'h3', 'h4', 'h5'];
  let gid = 0;
  for (const day of ['2026-10-03', '2026-10-04']) {
    for (let a = 0; a < codes.length; a++) {
      for (let b = a + 1; b < codes.length; b++) {
        if (r() < 0.55) schedule.push({ gid: `g${++gid}`, divId: 'd1', day, team1: codes[a], team2: codes[b] });
      }
    }
  }
  schedule.push({ divId: 'd1', day: '2026-10-03', team1: 'h1', team2: 'h2' }); // no gid: never a candidate
  schedule.push({ gid: 'other-div', divId: 'd2', day: '2026-10-03', team1: 'h1', team2: 'h2' });
  schedule.push({ gid: 'dup-a', divId: 'd1', day: '2026-10-04', team1: 'h4', team2: 'h5' });
  schedule.push({ gid: 'dup-b', divId: 'd1', day: '2026-10-04', team1: 'h5', team2: 'h4' });
  const teamMap = { h1: 'm1', h2: 'm2', h3: 'm3', h4: 'm4', h5: 'm5', h6: null };
  const scoreSources = {
    g1: {
      mobileGameId: 'approved-same',
      homePts: 50,
      awayPts: 40,
      eventCount: 12,
      lastEventAt: '2026-10-03T05:00:00Z',
    },
    g2: { mobileGameId: 'approved-drift-pts', homePts: 50, awayPts: 40, eventCount: 12, lastEventAt: null },
    g3: { mobileGameId: 'approved-drift-count', homePts: 50, awayPts: 40, eventCount: 12, lastEventAt: null },
    g4: { mobileGameId: 'approved-drift-last', homePts: 50, awayPts: 40, eventCount: 12, lastEventAt: null },
    g5: { note: 'no mobile game id' },
  };
  const base = {
    league_id: 'L1',
    event_count: 20,
    finished_at: Date.parse('2026-10-03T04:00:00Z'),
    last_event_at: '2026-10-03T04:00:00Z',
  };
  const finals = [
    {
      ...base,
      game_id: 'approved-same',
      home_team_id: 'm1',
      away_team_id: 'm2',
      home_pts: 50,
      away_pts: 40,
      event_count: 12,
      last_event_at: '2026-10-03T05:00:00Z',
    },
    {
      ...base,
      game_id: 'approved-drift-pts',
      home_team_id: 'm1',
      away_team_id: 'm2',
      home_pts: 52,
      away_pts: 40,
      event_count: 12,
      last_event_at: null,
    },
    {
      ...base,
      game_id: 'approved-drift-count',
      home_team_id: 'm1',
      away_team_id: 'm2',
      home_pts: 50,
      away_pts: 40,
      event_count: 13,
      last_event_at: null,
    },
    {
      ...base,
      game_id: 'approved-drift-last',
      home_team_id: 'm1',
      away_team_id: 'm2',
      home_pts: 50,
      away_pts: 40,
      event_count: 12,
      last_event_at: '2026-10-03T06:00:00Z',
    },
    {
      ...base,
      game_id: 'no-stats',
      home_team_id: 'm1',
      away_team_id: 'm2',
      home_pts: 30,
      away_pts: 20,
      event_count: 0,
    },
    { ...base, game_id: 'same-team', home_team_id: 'm1', away_team_id: 'm1', home_pts: 30, away_pts: 20 },
    {
      ...base,
      game_id: 'no-finish',
      home_team_id: 'm1',
      away_team_id: 'm2',
      home_pts: 30,
      away_pts: 20,
      finished_at: null,
    },
    {
      ...base,
      game_id: 'bad-finish',
      home_team_id: 'm1',
      away_team_id: 'm2',
      home_pts: 30,
      away_pts: 20,
      finished_at: 'not a date',
    },
    { ...base, game_id: 'level', home_team_id: 'm1', away_team_id: 'm2', home_pts: 30, away_pts: 30 },
    {
      ...base,
      game_id: 'settling',
      home_team_id: 'm1',
      away_team_id: 'm2',
      home_pts: 30,
      away_pts: 20,
      last_event_at: new Date(NOW - 60_000).toISOString(),
    },
    {
      ...base,
      game_id: 'skew',
      home_team_id: 'm1',
      away_team_id: 'm3',
      home_pts: 30,
      away_pts: 20,
      last_event_at: new Date(NOW + 60_000).toISOString(),
    },
    { ...base, game_id: 'unlinked', home_team_id: 'm1', away_team_id: 'm9', home_pts: 30, away_pts: 20 },
    {
      ...base,
      game_id: 'ambiguous',
      home_team_id: 'm5',
      away_team_id: 'm4',
      home_pts: 30,
      away_pts: 20,
      finished_at: Date.parse('2026-10-05T01:00:00Z'),
    },
    {
      ...base,
      game_id: 'string-epoch',
      home_team_id: 'm2',
      away_team_id: 'm3',
      home_pts: 30,
      away_pts: 20,
      finished_at: String(Date.parse('2026-10-04T01:00:00Z')),
    },
    {
      ...base,
      game_id: 'iso-finish',
      home_team_id: 'm3',
      away_team_id: 'm4',
      home_pts: 30,
      away_pts: 20,
      finished_at: '2026-10-03T23:30:00Z',
    },
  ];
  // Every other pairing both ways round, on both days.
  for (let a = 0; a < codes.length; a++) {
    for (let b = 0; b < codes.length; b++) {
      if (a === b) continue;
      finals.push({
        ...base,
        game_id: `pair-${a}-${b}`,
        home_team_id: `m${a + 1}`,
        away_team_id: `m${b + 1}`,
        home_pts: 40 + a,
        away_pts: 30 + b,
        finished_at: Date.parse(r() < 0.5 ? '2026-10-03T03:00:00Z' : '2026-10-04T03:00:00Z'),
      });
    }
  }
  const byId = { g6: { s1: 0, s2: null }, g7: { s1: null, s2: null }, g8: { s1: null, s2: 12 } };
  const byIdx = { 8: { s1: 10, s2: 5 }, 9: { s1: null, s2: null } };
  for (const migrated of [false, true]) {
    const evt = {
      divisions: { d1: { mobileLink: { teams: teamMap } } },
      scoreSources,
      schedule,
      scoresMigratedAt: migrated ? 1 : undefined,
    };
    const scored = Integration.scoredGidSet(evt, byIdx, byId);
    const results = Integration.matchFinals(evt, 'd1', finals, scored, NOW);
    matchingCases.push({
      migrated,
      schedule,
      teamMap,
      scoreSources,
      finals,
      byIdx,
      byId,
      nowMs: NOW,
      scored: Object.keys(scored),
      output: results.map((m) => ({
        gameId: m.final.game_id,
        state: m.state,
        reason: m.reason,
        homeCode: m.homeCode,
        awayCode: m.awayCode,
        candidates: m.candidates.map((c) => ({ gid: c.gid, sameDay: c.sameDay })),
        pick: m.pick ? m.pick.gid : null,
        existing: m.existing ? m.existing.gid : null,
      })),
    });
  }
  // Division with no link at all.
  const bare = Integration.matchFinals({ schedule }, 'd1', finals.slice(0, 3), {}, NOW);
  matchingCases.push({
    migrated: true,
    schedule,
    teamMap: null,
    scoreSources: null,
    finals: finals.slice(0, 3),
    byIdx: null,
    byId: null,
    nowMs: NOW,
    scored: [],
    output: bare.map((m) => ({
      gameId: m.final.game_id,
      state: m.state,
      reason: m.reason,
      homeCode: m.homeCode,
      awayCode: m.awayCode,
      candidates: [],
      pick: null,
      existing: null,
    })),
  });
}
write('mobile-matching', matchingCases);

// Small helpers, table style.
const helperCases = {
  toMs: [
    null,
    undefined,
    '',
    0,
    1757000000000,
    Infinity,
    NaN,
    '1757000000000',
    '-5',
    '2026-10-03T04:00:00Z',
    'nope',
  ].map((v) => ({
    input: v === undefined ? '__undefined__' : Number.isNaN(v) ? '__nan__' : v === Infinity ? '__inf__' : v,
    output: Integration.toMs(v),
  })),
  norm: ['The Harbour Hawks BC', 'Kits & Co', '  FC  United!! ', 'basketball club', null, 'Team 7', 'Élan'].map(
    (v) => ({ input: v, output: Integration.norm(v) }),
  ),
  proposeTeamPairs: (() => {
    const platform = [
      { code: 'a', name: 'Harbour Hawks' },
      { code: 'b', name: 'The Ravens' },
      { code: 'c', name: 'Twins' },
      { code: 'd', name: 'Ravens BC' },
      { code: 'e', name: 'Nobody' },
    ];
    const mobile = [
      { id: 'm1', name: 'harbour hawks' },
      { id: 'm2', name: 'Ravens' },
      { id: 'm3', name: 'Twins' },
      { id: 'm4', name: 'twins club' },
      { id: 'm5', name: 'Spare' },
    ];
    return [{ platform, mobile, output: Integration.proposeTeamPairs(platform, mobile) }];
  })(),
  orient: [
    [{ team1: 'a', team2: 'b' }, 'a', 'b', 10, 5],
    [{ team1: 'b', team2: 'a' }, 'a', 'b', 10, 5],
    [{ team1: 'a', team2: 'c' }, 'a', 'b', 10, 5],
    [null, 'a', 'b', 10, 5],
  ].map((args) => {
    try {
      return { args, output: Integration.orient(...args), error: null };
    } catch (e) {
      return { args, output: null, error: e.message };
    }
  }),
};
writeFileSync(
  join(out, 'mobile-helpers.json'),
  `${JSON.stringify({ generatedBy: 'scripts/golden/generate.mjs', ...helperCases })}\n`,
);
console.log('mobile-helpers.json written');
