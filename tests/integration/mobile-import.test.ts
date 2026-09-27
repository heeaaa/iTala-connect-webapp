import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../support/supabase';
import fixture from '../fixtures/mobile.json';
import { buildLeaguePreview, mobileLeagueSchema, mobileTeamSchema, mobilePlayerSchema } from '@/lib/mobile-import';
import { editorSchema, type EditorInput } from '@/lib/event-editor';
import { DEFAULT_RULES_HTML } from '@/server/event-defaults';
let owner: TestUser, other: TestUser, noRole: TestUser, disabled: TestUser;
let eventId = '';
const league = buildLeaguePreview(
  mobileLeagueSchema.parse(fixture.leagues[0]),
  fixture.teams.map((v) => mobileTeamSchema.parse(v)),
  fixture.players.map((v) => mobilePlayerSchema.parse(v)),
);
const args = {
  p_event_name: 'Imported event',
  p_division_name: 'Open',
  p_timezone: 'America/Vancouver',
  p_rules: DEFAULT_RULES_HTML,
  p_league: league.league,
  p_teams: league.teams,
  p_allow_duplicate: false,
};
beforeAll(async () => {
  [owner, other, noRole, disabled] = await Promise.all([
    createUser('admin'),
    createUser('admin'),
    createUser(null),
    createUser('admin', { disabled: true }),
  ]);
});
afterAll(async () => deleteUsers([owner, other, noRole, disabled].filter(Boolean)));
describe('Atomic mobile import', () => {
  it('serializes simultaneous imports so only one creates a linked event', async () => {
    const client = await signedInClient(owner);
    const concurrent = { ...args, p_league: { ...league.league, id: 'concurrent-league' } };
    const results = await Promise.all([
      client.rpc('import_mobile_league', concurrent),
      client.rpc('import_mobile_league', concurrent),
    ]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.code).toBe('23505');
  });
  it('refuses unauthenticated, roleless and disabled callers', async () => {
    expect((await anonClient().rpc('import_mobile_league', args)).error).not.toBeNull();
    for (const user of [noRole, disabled])
      expect((await (await signedInClient(user)).rpc('import_mobile_league', args)).error?.code).toBe('42501');
  });
  it('creates defaults, ordered players, stable mobile links and an attributed audit row', async () => {
    const client = await signedInClient(owner);
    const result = await client.rpc('import_mobile_league', args);
    expect(result.error).toBeNull();
    eventId = result.data!;
    const { data: e, error: readError } = await client
      .from('events')
      .select('*,divisions(*,teams(*,players(*)),division_mobile_links(*))')
      .eq('id', eventId)
      .single();
    expect(readError).toBeNull();
    expect(e).toMatchObject({
      owner_id: owner.id,
      status: 'draft',
      timezone: 'America/Vancouver',
      schedule_days: [],
      courts: 1,
      time_start: '09:00:00',
      time_end: '20:00:00',
    });
    const d = e!.divisions[0]!;
    expect(d.division_mobile_links).toMatchObject({ league_id: 'league-open', linked_by: owner.id });
    expect((await client.from('division_mobile_team_links').select('*').eq('division_id', d.id)).data).toHaveLength(2);
    const hawks = d.teams.find((t) => t.name === 'Harbour Hawks')!;
    expect(
      hawks.players.sort((a, b) => a.sort_order - b.sort_order).map((p) => [p.name, p.number, p.mobile_player_id]),
    ).toEqual([
      ['Bea', '7', 'player-bea'],
      ['Ari', '04', 'player-ari'],
    ]);
    expect(d.teams.find((t) => t.name === 'Night Owls')?.players).toEqual([]);
    expect(
      (await client.from('audit_log').select('*').eq('event_id', eventId).eq('action', 'event.mobile_import'))
        .data?.[0],
    ).toMatchObject({ actor_id: owner.id, detail: { league_id: 'league-open' } });
  });
  it('rejects a second import unless explicitly confirmed and rolls back a malformed roster', async () => {
    const client = await signedInClient(owner);
    expect((await client.rpc('import_mobile_league', args)).error?.code).toBe('23505');
    const before = (await client.from('events').select('id').eq('owner_id', owner.id)).data!.length;
    expect(
      (
        await client.rpc('import_mobile_league', {
          ...args,
          p_allow_duplicate: true,
          p_teams: [...league.teams, { ...league.teams[0], id: 'bad', players: [{ id: 'bad', name: '', number: '' }] }],
        })
      ).error,
    ).not.toBeNull();
    expect((await client.from('events').select('id').eq('owner_id', owner.id)).data).toHaveLength(before);
    expect((await client.rpc('import_mobile_league', { ...args, p_allow_duplicate: true })).error).toBeNull();
  });
  it('enforces one-to-one mobile team maps and private link visibility', async () => {
    const client = await signedInClient(owner);
    const { data: division } = await client.from('divisions').select('id').eq('event_id', eventId).single();
    const { data: map } = await client.from('division_mobile_team_links').select('*').eq('division_id', division!.id);
    expect(
      (
        await client
          .from('division_mobile_team_links')
          .update({ mobile_team_id: map![0]!.mobile_team_id })
          .eq('team_id', map![1]!.team_id)
      ).error?.code,
    ).toBe('23505');
    expect(
      (await (await signedInClient(other)).from('division_mobile_links').select('*').eq('division_id', division!.id))
        .data,
    ).toEqual([]);
  });
  it('saves draft edits atomically, preserves mobile ids and rejects stale or foreign edits', async () => {
    const client = await signedInClient(owner);
    const { data: e } = await client
      .from('events')
      .select('*,divisions(*,teams(*,players(*)))')
      .eq('id', eventId)
      .single();
    const input: EditorInput = editorSchema.parse({
      ...e,
      version: e!.updated_at,
      time_start: '10:00',
      time_end: '19:00',
      divisions: e!.divisions.map((d) => ({
        ...d,
        games_per_team: 0,
        teams: d.teams.map((t) => ({ ...t, players: t.players.map((p) => ({ ...p, name: p.name + ' Edited' })) })),
      })),
    });
    const { id, version, divisions, ...details } = input;
    const saveArgs = { p_event_id: id, p_version: version, p_details: details, p_divisions: divisions };
    expect((await (await signedInClient(other)).rpc('save_event_editor', saveArgs)).error?.code).toBe('42501');
    const result = await client.rpc('save_event_editor', saveArgs);
    expect(result.error).toBeNull();
    expect((await client.rpc('save_event_editor', saveArgs)).error?.code).toBe('40001');
    const players = (
      await client
        .from('players')
        .select('*')
        .eq('team_id', divisions[0]!.teams.find((t) => t.name === 'Harbour Hawks')!.id)
    ).data!;
    expect(players.map((p) => p.mobile_player_id).sort()).toEqual(['player-ari', 'player-bea']);
    expect(players.every((p) => p.name.endsWith('Edited'))).toBe(true);
    expect(
      (await client.from('division_mobile_links').select('*').eq('division_id', divisions[0]!.id)).data,
    ).toHaveLength(1);
    const bad = await client.rpc('save_event_editor', {
      ...saveArgs,
      p_version: result.data!,
      p_details: { ...details, name: 'Should roll back' },
      p_divisions: [{ ...divisions[0]!, color: 'invalid' }],
    });
    expect(bad.error).not.toBeNull();
    expect((await client.from('events').select('name').eq('id', id).single()).data?.name).toBe('Imported event');
  });
});
