import { describe, expect, it, vi } from 'vitest';
import exportJson from '../fixtures/firebase-export.json';
import { loadLegacyCode } from '../../scripts/firebase-legacy';
import { applyImport, formatApplied, importPayload, type ImportResult, type ImportTarget } from '@/migration/apply';
import { planImport } from '@/migration/import-plan';
import { mapEvent, type EventPlan } from '@/migration/map-event';
import { legacyKeyedRows, type StoredEvent } from '@/migration/read-back';
import { importReport } from '@/migration/report';
import { compareRows, rowsOf, verifyEvent, type Difference } from '@/migration/verify';

/*
 * Phase 7b rules, without a database: what is written, what is skipped, and
 * the read-back diff on stored rows (real ids, legacy keys in columns).
 */

const A = '-P1JcLF-aaaaaaaaaaaa';
const B = '-P0Zslb-bbbbbbbbbbbb';
const legacy = loadLegacyCode();
const opts = { timezone: 'Pacific/Auckland' };
const planned = (only: string[] = []) => {
  const plan = planImport(exportJson, { ...opts, only });
  const diffs = new Map<string, Difference[]>();
  for (const e of plan.events) if (e.plan) diffs.set(e.legacyId, verifyEvent(e.raw, e.plan, legacy));
  return { plan, report: importReport(plan, diffs) };
};

/** The plan stored as the database would store it: new ids, legacy keys kept in their columns. */
function stored(plan: EventPlan, tamper: (s: StoredEvent) => void = () => {}): StoredEvent {
  const r = rowsOf(plan);
  const id = (kind: string, key: string) => `${kind}:${key}`;
  const s: StoredEvent = {
    event: { ...r.event, id: 'event-uuid' },
    divisions: r.divisions.map((d) => ({ ...d, id: id('d', d.id), legacy_key: d.id })),
    teams: r.teams.map((t) => ({ ...t, id: id('t', t.id), division_id: id('d', t.division_id), legacy_code: t.id })),
    games: r.games.map((g) => ({
      ...g,
      id: id('g', g.id),
      division_id: g.division_id && id('d', g.division_id),
      team1_id: g.team1_id && id('t', g.team1_id),
      team2_id: g.team2_id && id('t', g.team2_id),
      legacy_gid: g.id,
      legacy_index: plan.games.find((p) => p.legacy_gid === g.id)!.legacy_index,
    })),
    scores: r.scores.map((sc) => ({ ...sc, game_id: id('g', sc.game_id) })),
  };
  tamper(s);
  return s;
}

function fakeTarget(overrides: Partial<ImportTarget> = {}) {
  const plans = new Map<string, EventPlan>();
  const target: ImportTarget = {
    ownerId: vi.fn(async (email: string) => (email === 'owner@itala.test' ? 'owner-uuid' : null)),
    importEvent: vi.fn(async (_owner, payload): Promise<ImportResult> => {
      plans.set('event-uuid', { legacyId: payload.event.legacy_firebase_id, logo: null, sponsors: [], ...payload });
      return {
        event_id: 'event-uuid',
        created: true,
        divisions: 1,
        teams: 3,
        players: 3,
        games: payload.games.length,
        scores: 5,
        approvals: 1,
        mobile_links: 1,
      };
    }),
    readBack: vi.fn(async (eventId: string) => stored(plans.get(eventId)!)),
    importPlatform: vi.fn(async () => true),
    fetchImage: vi.fn(async (): Promise<Uint8Array> => {
      throw new Error('the old address answered 404');
    }),
    uploadImage: vi.fn(async () => {}),
    removeImages: vi.fn(async () => {}),
    setEventImages: vi.fn(async (): Promise<string[]> => []),
    platformHasSponsors: vi.fn(async () => false),
    setPlatformSponsors: vi.fn(async () => true),
    ...overrides,
  };
  return target;
}

describe('reading stored rows back to legacy keys', () => {
  it('matches the old page for the stored rows of a clean event', () => {
    const e = planned([A]).plan.events[0]!;
    const keyed = legacyKeyedRows(stored(e.plan!), A);
    expect(keyed.rows.games.map((g) => g.id)).toEqual(e.plan!.games.map((g) => g.legacy_gid));
    expect(keyed.oldIndex.get('g_a5')).toBe(4);
    expect(compareRows(e.raw, keyed.rows, keyed.oldIndex, legacy)).toEqual([]);
  });

  it('catches a stored score, team or order that differs from the old page', () => {
    const e = planned([A]).plan.events[0]!;
    const check = (tamper: (s: StoredEvent) => void) => {
      const keyed = legacyKeyedRows(stored(e.plan!, tamper), A);
      return compareRows(e.raw, keyed.rows, keyed.oldIndex, legacy).map((d) => d.kind);
    };
    expect(check((s) => (s.scores[0]!.s1 = 10))).toContain('score');
    expect(check((s) => (s.games[0]!.team1_id = s.games[0]!.team2_id = null))).toContain('standings');
    // Order only shows where records are level: an event with no scores.
    const level = { name: 'E', divisions: { d: { name: 'D', teams: { a: { name: 'A' }, b: { name: 'B' } } } } };
    const levelPlan = mapEvent('x', level, { timezone: 'Pacific/Auckland' }).plan!;
    const reordered = legacyKeyedRows(
      stored(levelPlan, (s) => s.teams.reverse().forEach((t, i) => (t.sort_order = i))),
      'x',
    );
    expect(compareRows(level, reordered.rows, reordered.oldIndex, legacy).map((d) => d.kind)).toEqual(['standings']);
    // A game the import did not make shows up rather than hiding.
    expect(
      check((s) =>
        s.games.push({
          ...s.games[0]!,
          id: 'extra',
          legacy_gid: null,
          legacy_index: null,
          position: 99,
          day: null,
          start_time: null,
          court: null,
        }),
      ),
    ).toContain('game');
    // And a game the old page had but the database lost.
    expect(check((s) => s.games.splice(1, 1))).toContain('game');
  });
});

describe('rows the import did not make', () => {
  it('keep their own ids, so they show up in the diff instead of passing as imported rows', () => {
    const keyed = legacyKeyedRows(
      {
        event: rowsOf(planned([A]).plan.events[0]!.plan!).event,
        divisions: [
          { id: 'd-new', name: 'Made in Connect', color: '#123456', sort_order: 0, created_at: '', legacy_key: null },
        ],
        teams: [
          {
            id: 't-new',
            division_id: 'd-new',
            name: 'New',
            coach: '',
            sort_order: 0,
            created_at: '',
            legacy_code: null,
          },
          {
            id: 't-odd',
            division_id: 'd-gone',
            name: 'Odd',
            coach: '',
            sort_order: 1,
            created_at: '',
            legacy_code: 'odd',
          },
        ],
        games: [
          {
            ...rowsOf(planned([A]).plan.events[0]!.plan!).games[0]!,
            id: 'g-new',
            division_id: null,
            team1_id: 't-new',
            team2_id: 't-unknown',
            legacy_gid: null,
            legacy_index: null,
          },
        ],
        scores: [{ game_id: 'g-unknown', s1: 1, s2: 2 }],
      },
      A,
    );
    expect(keyed.rows.event.id).toBe(A);
    expect(keyed.rows.divisions.map((d) => d.id)).toEqual(['d-new']);
    expect(keyed.rows.teams.map((t) => [t.id, t.division_id])).toEqual([
      ['t-new', 'd-new'],
      ['odd', 'd-gone'],
    ]);
    expect(keyed.rows.games[0]).toMatchObject({
      id: 'g-new',
      division_id: null,
      team1_id: 't-new',
      team2_id: 't-unknown',
    });
    expect(keyed.rows.scores).toEqual([{ game_id: 'g-unknown', s1: 1, s2: 2 }]);
    expect(keyed.oldIndex.size).toBe(0);
  });
});

describe('applying an import', () => {
  it('writes only events without errors or differences, and reads each one back', async () => {
    const { plan, report } = planned();
    const target = fakeTarget();
    const result = await applyImport(plan, report, target, legacy, {
      ownerEmail: ' Owner@itala.test ',
      acceptDifferences: false,
      platform: true,
      images: false,
    });
    expect(target.ownerId).toHaveBeenCalledWith('owner@itala.test');
    expect(result.ownerId).toBe('owner-uuid');
    expect(result.events.map((e) => [e.name, e.outcome, e.reason ?? e.differences])).toEqual([
      ['Winter Social', 'skipped', 'has differences (check them, then use --accept-differences)'],
      ['Harbour Spring Cup', 'written', []],
      ['Club Night', 'skipped', 'has errors'],
      ['', 'skipped', 'not an event'],
    ]);
    expect(target.importEvent).toHaveBeenCalledTimes(1);
    expect(target.importEvent).toHaveBeenCalledWith('owner-uuid', importPayload(plan.events[1]!.plan!));
    expect(result.defaultRules).toBe(true);
    expect(target.importPlatform).toHaveBeenCalledWith('<p>Be kind</p>');
  });

  it('never sends images or the raw event to the writer', () => {
    const payload = importPayload(planned([A]).plan.events[0]!.plan!);
    expect(Object.keys(payload)).toEqual(['event', 'divisions', 'games']);
    expect(JSON.stringify(payload)).not.toContain('base64');
  });

  it('writes accepted differences, and reports a failed event without stopping the rest', async () => {
    const { plan, report } = planned([B, A]);
    const target = fakeTarget();
    const write = target.importEvent;
    target.importEvent = vi.fn(async (owner, payload) => {
      if (payload.event.name === 'Harbour Spring Cup') throw new Error('The owner must be an active admin');
      return write(owner, payload);
    });
    const result = await applyImport(plan, report, target, legacy, {
      ownerEmail: 'owner@itala.test',
      acceptDifferences: true,
      platform: false,
      images: false,
    });
    expect(result.events.map((e) => [e.name, e.outcome])).toEqual([
      ['Winter Social', 'written'],
      ['Harbour Spring Cup', 'failed'],
    ]);
    expect(result.events[0]!.differences).toEqual(report.events[0]!.differences);
    expect(result.events[1]!.reason).toBe('The owner must be an active admin');
    expect(result.defaultRules).toBeNull();
    const text = formatApplied(result);
    expect(text).toContain('CREATED  Winter Social');
    expect(text).toContain('AFTER WRITING, DIFFERENCE score at game 2 ("Mixed")');
    expect(text).toContain('FAILED  Harbour Spring Cup');
    expect(text).toContain('1 written, 0 skipped, 1 failed.');
  });

  it('refuses an owner who is not an active admin before writing anything', async () => {
    const { plan, report } = planned([A]);
    const target = fakeTarget();
    await expect(
      applyImport(plan, report, target, legacy, {
        ownerEmail: 'someone@itala.test',
        acceptDifferences: false,
        platform: true,
        images: true,
      }),
    ).rejects.toThrow('No active admin account has the email someone@itala.test.');
    expect(target.importEvent).not.toHaveBeenCalled();
    expect(target.importPlatform).not.toHaveBeenCalled();
    expect(target.uploadImage).not.toHaveBeenCalled();
  });

  it('says what happened in words', () => {
    const text = formatApplied({
      ownerId: 'o',
      defaultRules: false,
      platformSponsors: null,
      events: [
        {
          legacyId: 'x',
          name: 'Cup',
          outcome: 'written',
          result: {
            event_id: 'e',
            created: false,
            divisions: 1,
            teams: 2,
            players: 0,
            games: 1,
            scores: 0,
            approvals: 0,
            mobile_links: 0,
          },
          differences: [],
        },
        { legacyId: 'y', name: '', outcome: 'skipped', reason: 'has errors' },
      ],
    });
    expect(text).toContain('UPDATED  Cup [x]: 1 division(s), 2 team(s)');
    expect(text).toContain('read back: matches the old page');
    expect(text).toContain('SKIPPED  (untitled) [y]: has errors');
    expect(text).toContain('Default rules template: left as it is');
    expect(text).not.toContain('—');
  });
});
