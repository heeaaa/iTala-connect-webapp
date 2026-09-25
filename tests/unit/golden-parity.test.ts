import { describe, expect, it } from 'vitest';

import {
  dayOf,
  matchFinals,
  norm,
  orient,
  proposeTeamPairs,
  scoredGameIds,
  toMs,
  type ApprovedSource,
  type MobileFinal,
} from '@/domain/mobile-matching';
import { placePlayoffGames, resolveAllPlayoffs } from '@/domain/playoffs';
import { matchupCounts, reconcileSchedule } from '@/domain/schedule-edit';
import { generateBracket, generateDivisionRoundRobin, generateSchedule } from '@/domain/scheduler';
import { computeStandings, divisionGroupComplete } from '@/domain/standings';
import { type EventSetup, type Game, type PlayoffSource } from '@/domain/types';

import bracketGolden from '../golden/bracket.json';
import matchupGolden from '../golden/matchups.json';
import helperGolden from '../golden/mobile-helpers.json';
import matchingGolden from '../golden/mobile-matching.json';
import placementGolden from '../golden/playoff-placement.json';
import reconcileGolden from '../golden/reconcile.json';
import roundRobinGolden from '../golden/round-robin.json';
import scheduleGolden from '../golden/schedule.json';
import playoffGolden from '../golden/standings-playoffs.json';

/*
 * Golden parity (MIGRATION_PLAN.md phase 2): every case in tests/golden was
 * produced by the OLD code (scripts/golden/legacy, run by
 * scripts/golden/generate.mjs). These tests convert old inputs and outputs
 * into the new shapes and require the port to match exactly. Only the
 * shape differs:
 *   "9:00 AM" -> "09:00"; unscheduled day/time ""/court 1 -> null;
 *   "TBD" -> null; " — " -> " - " in labels (no long dashes); s1/s2 ->
 *   score1/score2; bracketId (group letter) -> groupId.
 * Recorded Fixes are checked separately (playoff placement overflow).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- legacy JSON is untyped by nature */
type Legacy = any;

const pad = (n: number) => String(n).padStart(2, '0');

function hhmm(t: string): string {
  const m = /^(\d+):(\d+)\s*(AM|PM)$/i.exec(t)!;
  let h = Number(m[1]);
  const p = m[3]!.toUpperCase();
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return `${pad(h)}:${m[2]}`;
}

function setupOf(evt: Legacy): EventSetup {
  const divs = evt.divisions ?? {};
  return {
    days: evt.scheduleDays ?? [],
    timeStart: evt.timeStart,
    timeEnd: evt.timeEnd,
    courts: parseInt(evt.courts, 10) || 1,
    divisions: Object.keys(divs).map((id) => {
      const d = divs[id];
      return {
        id,
        name: d.name ?? '',
        teamIds: Object.keys(d.teams ?? {}),
        bracketCount: parseInt(d.bracketCount, 10) || 1,
        gamesPerTeam: d.customGamesPerTeam && d.gamesPerTeam ? parseInt(d.gamesPerTeam, 10) : null,
      };
    }),
  };
}

const team = (t: Legacy) => (t && t !== 'TBD' ? t : null);
const score = (s: Legacy) => (s === null || s === undefined ? null : Number(s));
const source = (s: Legacy): PlayoffSource =>
  s.type === 'seed' ? { type: 'seed', rank: s.rank } : { type: 'winner', bracketGameId: s.bracketId };
const label = (s: string) => s.replaceAll(' — ', ' - ');

function gameOf(g: Legacy): Game {
  const unscheduled = !g.day || g.day === 'TBD' || !g.time || g.time === 'TBD';
  const out: Game = {
    day: unscheduled ? null : g.day,
    time: unscheduled ? null : hhmm(g.time),
    court: unscheduled ? null : g.court,
    divisionId: g.divId,
    groupId: g.bracketId ?? null,
    team1Id: team(g.team1),
    team2Id: team(g.team2),
    label: label(g.label),
    type: g.type || 'group',
    score1: score(g.s1),
    score2: score(g.s2),
  };
  if (g.playoff) {
    out.playoff = {
      bracketGameId: g.bracketGameId,
      team1Source: source(g.team1Source),
      team2Source: source(g.team2Source),
      round: g.playoffRound,
    };
  }
  return out;
}

describe('golden parity: schedule generation (PRD 12.1 to 12.3, E-61)', () => {
  it.each(scheduleGolden.cases.map((c) => [c.event.id, c] as const))('%s', (_id, c) => {
    expect(generateSchedule(setupOf(c.event))).toEqual(c.output.map(gameOf));
  });
});

describe('golden parity: post-publish round robin (E-63)', () => {
  it.each(roundRobinGolden.cases.map((c) => [`${c.event.id} ${c.divId} x${c.gamesPerTeam}`, c] as const))(
    '%s',
    (_id, c) => {
      const out = generateDivisionRoundRobin(setupOf(c.event), c.divId, c.existing.map(gameOf), c.gamesPerTeam);
      expect(out).toEqual(c.output.map(gameOf));
    },
  );
});

describe('golden parity: bracket (PRD 12.5)', () => {
  it.each(bracketGolden.cases.map((c) => [`${c.divName || c.divId} ${c.teams} teams`, c] as const))('%s', (_id, c) => {
    const legacy = (c.output as Legacy[]).map((g) => ({
      bracketGameId: g.bracketId,
      round: g.round,
      label: label(g.label),
      type: g.type,
      team1Source: source(g.team1Source),
      team2Source: source(g.team2Source),
    }));
    expect(generateBracket(c.divId, c.divName, c.teams)).toEqual(legacy);
  });
});

describe('golden parity: standings and playoff resolution (PRD 12.4, 12.5, P-06, P-09)', () => {
  it.each(playoffGolden.cases.map((c) => [c.event.id, c] as const))('%s', (_id, c) => {
    const setup = setupOf(c.event);
    const games = (c.event.schedule as Legacy[]).map(gameOf);
    for (const d of setup.divisions) {
      const legacy = (c.standings as Legacy)[d.id].map((r: Legacy) => ({
        teamId: r.code,
        w: r.w,
        l: r.l,
        pf: r.pf,
        pa: r.pa,
        diff: r.diff,
        gp: r.gp,
      }));
      expect(computeStandings(d.teamIds, games, d.id)).toEqual(legacy);
      expect(divisionGroupComplete(games, d.id)).toBe((c.groupComplete as Legacy)[d.id]);
    }
    const resolved = resolveAllPlayoffs(setup.divisions, games);
    expect(resolved.map((g) => [g.team1Id, g.team2Id])).toEqual(
      (c.resolved as Legacy[]).map((r) => [team(r.team1), team(r.team2)]),
    );
  });
});

describe('golden parity: playoff placement (E-64, with the recorded overflow Fix)', () => {
  it.each(placementGolden.cases.map((c) => [`${c.event.id} ${c.divId} ${c.teams} teams`, c] as const))(
    '%s',
    (_id, c) => {
      const setup = setupOf(c.event);
      const div = setup.divisions.find((d) => d.id === c.divId)!;
      const out = placePlayoffGames(setup, c.existing.map(gameOf), div, c.teams);
      const legacy = (c.output as Legacy[]).map(gameOf);
      expect(out).toHaveLength(legacy.length);
      out.forEach((g, i) => {
        if (c.overflow[i]) {
          // Old: overflowed onto the last day with no collision check. New: Unscheduled.
          expect({ day: g.day, time: g.time, court: g.court }).toEqual({ day: null, time: null, court: null });
          expect({ ...g, day: null, time: null, court: null }).toEqual({
            ...legacy[i],
            day: null,
            time: null,
            court: null,
          });
        } else {
          expect(g).toEqual(legacy[i]);
        }
      });
    },
  );
});

describe('golden parity: reconcile after days, hours or courts change (E-14)', () => {
  it.each(reconcileGolden.cases.map((c) => [c.event.id, c] as const))('%s', (_id, c) => {
    const { games, moved } = reconcileSchedule(setupOf(c.event), (c.event.schedule as Legacy[]).map(gameOf));
    expect(moved).toBe(c.moved);
    expect(games).toEqual((c.output as Legacy[]).map(gameOf));
  });
});

describe('golden parity: matchup report counts (E-30)', () => {
  it.each(matchupGolden.cases.map((c, i) => [i, c] as const))('case %i', (_i, c) => {
    const games = (c.schedule as Legacy[]).map(gameOf);
    for (const d of c.divisions) {
      const { counts, totalGames } = matchupCounts(games, d.divId, d.teamCodes);
      expect(Object.fromEntries(counts)).toEqual(d.output.counts);
      expect(totalGames).toBe(d.output.totalGames);
    }
  });
});

describe('golden parity: mobile matching (PRD 12.6, M-03 to M-07)', () => {
  it.each(matchingGolden.cases.map((c, i) => [`case ${i}, migrated ${c.migrated}`, c] as const))('%s', (_id, c) => {
    const games = (c.schedule as Legacy[]).map((g) => ({
      id: g.gid,
      divisionId: g.divId,
      day: g.day,
      team1Id: g.team1,
      team2Id: g.team2,
    }));
    const scores = (m: Legacy) =>
      m
        ? Object.fromEntries(Object.entries(m).map(([k, v]: [string, Legacy]) => [k, { score1: v.s1, score2: v.s2 }]))
        : null;
    const scored = scoredGameIds(games, scores(c.byIdx), scores(c.byId), c.migrated);
    expect([...scored]).toEqual(c.scored);

    const results = matchFinals({
      games,
      divisionId: 'd1',
      teamMap: (c.teamMap as Legacy) ?? {},
      sources: ((c.scoreSources as Legacy) ?? {}) as Record<string, ApprovedSource>,
      finals: c.finals as MobileFinal[],
      scoredGameIds: scored,
      nowMs: c.nowMs,
      timeZone: 'Pacific/Auckland',
    });
    expect(
      results.map((m) => ({
        gameId: m.final.game_id,
        state: m.state,
        reason: m.reason,
        homeCode: m.homeTeamId,
        awayCode: m.awayTeamId,
        candidates: m.candidates.map((x) => ({ gid: x.gameId, sameDay: x.sameDay })),
        pick: m.pick?.gameId ?? null,
        existing: m.existing?.gameId ?? null,
      })),
    ).toEqual(c.output);
  });

  it('matches toMs, norm, proposeTeamPairs and orient', () => {
    const decode = (v: Legacy) =>
      v === '__undefined__' ? undefined : v === '__nan__' ? NaN : v === '__inf__' ? Infinity : v;
    for (const { input, output } of helperGolden.toMs) expect(toMs(decode(input))).toBe(output);
    for (const { input, output } of helperGolden.norm) expect(norm(input)).toBe(output);

    for (const c of helperGolden.proposeTeamPairs) {
      const connect = c.platform.map((p) => ({ id: p.code, name: p.name }));
      const got = proposeTeamPairs(connect, c.mobile);
      expect(got.pairs).toEqual(c.output.pairs);
      expect(got.unmatchedConnect.map((p) => ({ code: p.id, name: p.name }))).toEqual(c.output.unmatchedPlatform);
      expect(got.unmatchedMobile).toEqual(c.output.unmatchedMobile);
    }

    for (const { args, output, error } of helperGolden.orient as Legacy[]) {
      const [game, home, away, hp, ap] = args;
      const g = game ? { team1Id: game.team1, team2Id: game.team2 } : null;
      if (error) expect(() => orient(g, home, away, hp, ap)).toThrow(error);
      else expect(orient(g, home, away, hp, ap)).toEqual({ score1: output.s1, score2: output.s2 });
    }
  });

  it('decides the finish day in the event time zone (PRD M-08 Improve)', () => {
    // 03/10/2026 23:30 UTC is 04/10 in Auckland but still 03/10 in Vancouver.
    const f = { finished_at: '2026-10-03T23:30:00Z' };
    expect(dayOf(f, 'Pacific/Auckland')).toBe('2026-10-04');
    expect(dayOf(f, 'America/Vancouver')).toBe('2026-10-03');
  });
});
