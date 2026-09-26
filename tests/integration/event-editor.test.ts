import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, deleteUsers, signedInClient, type TestUser } from '../support/supabase';
import { editorSchema, type EditorInput } from '@/lib/event-editor';

// save_event_editor on a published event (PRD E-02, E-06, E-14, E-22, E-23)
// against the local stack, through the owner's session so RLS applies.
let owner: TestUser, other: TestUser;
beforeAll(async () => {
  [owner, other] = await Promise.all([createUser('admin'), createUser('admin')]);
});
afterAll(async () => deleteUsers([owner, other].filter(Boolean)));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const team = (n: number, name: string) => ({ id: id(100 + n), name, coach: '', players: [] });
const division = (n: number, name: string, teams: ReturnType<typeof team>[]) => ({
  id: id(10 + n),
  name,
  color: '#6C63FF',
  bracket_count: 1,
  custom_games_per_team: false,
  games_per_team: 0,
  teams,
});

describe('Published event save', () => {
  it('unschedules only the listed games, keeps scores and links, and removes with divisions and teams as confirmed', async () => {
    const client = await signedInClient(owner);
    const created = await client.rpc('create_draft_event', {
      p_name: 'Editor event',
      p_timezone: 'Pacific/Auckland',
      p_rules: '',
    });
    expect(created.error).toBeNull();
    const eventId = created.data!;
    const read = async () =>
      (await client.from('events').select('updated_at').eq('id', eventId).single()).data!.updated_at;
    const base = (divisions: ReturnType<typeof division>[], extra: Partial<EditorInput> = {}): EditorInput =>
      editorSchema.parse({
        id: eventId,
        version: 'x',
        name: 'Editor event',
        schedule_days: ['2026-10-03'],
        time_start: '09:00',
        time_end: '20:00',
        courts: 2,
        court_names: ['Court 1', 'Court 2'],
        timezone: 'Pacific/Auckland',
        theme_primary: '#FFCC00',
        theme_bg: '#0D0D0D',
        theme_text: '#E0E0E0',
        theme_text_secondary: '#888888',
        theme_heading: '#FFFFFF',
        divisions,
        ...extra,
      });
    const save = (input: EditorInput, version: string, unschedule: string[] = []) => {
      const { id: eventKey, divisions, version: _v, ...details } = input;
      return client.rpc('save_event_editor', {
        p_event_id: eventKey,
        p_version: version,
        p_details: details,
        p_divisions: divisions,
        p_unschedule: unschedule,
      });
    };
    const open = division(1, 'Open', [team(1, 'Hawks'), team(2, 'Owls'), team(3, 'Kea')]);
    const youth = division(2, 'Youth', [team(4, 'Tui'), team(5, 'Weka')]);
    const draft = await save(base([open, youth]), await read());
    expect(draft.error).toBeNull();

    const game = (n: number, d: number, a: number, b: number, slot: object) => ({
      id: id(200 + n),
      division_id: id(10 + d),
      team1_id: id(100 + a),
      team2_id: id(100 + b),
      label: 'Open',
      type: 'group',
      position: n,
      ...slot,
    });
    const published = await client.rpc('publish_event', {
      p_event_id: eventId,
      p_games: [
        game(1, 1, 1, 2, { day: '2026-10-03', start_time: '09:00', court: 1 }),
        game(2, 1, 2, 3, { day: '2026-10-03', start_time: '10:00', court: 2 }),
        game(3, 1, 1, 3, {}),
        game(4, 2, 4, 5, { day: '2026-10-03', start_time: '11:00', court: 1 }),
      ],
      p_clear_scores: false,
    });
    expect(published.data).toBe(4);
    expect((await client.rpc('set_score', { p_game_id: id(201), p_s1: 40, p_s2: 38 })).error).toBeNull();

    const version = await read();
    // Another admin cannot save it; a stale version is refused.
    expect(
      (
        await (
          await signedInClient(other)
        ).rpc('save_event_editor', {
          p_event_id: eventId,
          p_version: version,
          p_details: {},
          p_divisions: [],
        })
      ).error?.code,
    ).toBe('42501');
    expect((await save(base([open, youth]), '2020-01-01T00:00:00Z')).error?.code).toBe('40001');

    // One court now: game 2 (court 2) no longer fits. Kea removed, Youth removed.
    const saved = await save(
      base([{ ...open, teams: open.teams.slice(0, 2) }], { courts: 1, court_names: ['Court 1'] }),
      version,
      [id(202)],
    );
    expect(saved.error).toBeNull();
    expect(saved.data).not.toBe(version);

    const { data: games } = await client
      .from('games')
      .select('id, day, court, team1_id, team2_id, division_id')
      .eq('event_id', eventId)
      .order('position');
    expect(games!.map((g) => g.id)).toEqual([id(201), id(202), id(203)]); // Youth's game went with it
    expect(games![0]).toMatchObject({ day: '2026-10-03', court: 1 });
    expect(games![1]).toMatchObject({ day: null, court: null, team2_id: null }); // unscheduled, Kea now TBD
    expect(games![2]).toMatchObject({ team1_id: id(101), team2_id: null });
    expect((await client.from('game_scores').select('s1, s2').eq('game_id', id(201)).single()).data).toEqual({
      s1: 40,
      s2: 38,
    });
    const event = (await client.from('events').select('status, courts').eq('id', eventId).single()).data;
    expect(event).toEqual({ status: 'published', courts: 1 });
    expect((await client.from('divisions').select('id').eq('event_id', eventId)).data).toHaveLength(1);
  });
});
