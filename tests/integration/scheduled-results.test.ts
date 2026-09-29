import { afterAll, beforeAll, expect, it } from 'vitest';
import { adminClient, createUser, deleteUsers, signedInClient, type TestUser } from '../support/supabase';

let owner: TestUser;
let other: TestUser;
let eventId = '';
let gameIds: string[] = [];

beforeAll(async () => {
  [owner, other] = await Promise.all([createUser('admin'), createUser('admin')]);
  const db = adminClient();
  const { data: event, error } = await db
    .from('events')
    .insert({ owner_id: owner.id, name: 'Concurrent results', status: 'published' })
    .select('id')
    .single();
  if (error || !event) throw error;
  eventId = event.id;
  const { data: division, error: divisionError } = await db
    .from('divisions')
    .insert({ event_id: eventId, name: 'Open' })
    .select('id')
    .single();
  if (divisionError || !division) throw divisionError;
  const { data: games, error: gamesError } = await db
    .from('games')
    .insert(
      [0, 1].map((position) => ({
        event_id: eventId,
        division_id: division.id,
        label: 'Open',
        type: 'group',
        position,
      })),
    )
    .select('id');
  if (gamesError || !games) throw gamesError;
  gameIds = games.map((game) => game.id);
});
afterAll(async () => deleteUsers([owner, other].filter(Boolean)));

it('allows one of two concurrent approvals of the same mobile final on different fixtures', async () => {
  const client = await signedInClient(owner);
  const results = await Promise.all(
    gameIds.map((gameId) =>
      client.rpc('approve_mobile_result', {
        p_game_id: gameId,
        p_s1: 58,
        p_s2: 51,
        p_source: { mobile_game_id: 'concurrent-final', league_id: 'L1', home_pts: 58, away_pts: 51 },
      }),
    ),
  );
  expect(results.filter((result) => !result.error)).toHaveLength(1);
  expect(results.find((result) => result.error)?.error?.code).toBe('23505');
  const { data: sources } = await adminClient()
    .from('score_sources')
    .select('game_id')
    .eq('mobile_game_id', 'concurrent-final');
  expect(sources).toHaveLength(1);
  const { data: scores } = await adminClient().from('game_scores').select('game_id').eq('event_id', eventId);
  expect(scores).toHaveLength(1);
  expect(scores![0]!.game_id).toBe(sources![0]!.game_id);
});

it('refuses another organiser at the approval and conflict-check boundary', async () => {
  const client = await signedInClient(other);
  expect(
    (
      await client.rpc('approve_mobile_result', {
        p_game_id: gameIds[0]!,
        p_s1: 1,
        p_s2: 0,
        p_source: { mobile_game_id: 'foreign-final' },
      })
    ).error?.code,
  ).toBe('42501');
  expect(
    (await client.rpc('mobile_result_conflicts', { p_event_id: eventId, p_mobile_game_ids: ['concurrent-final'] }))
      .error?.code,
  ).toBe('42501');
});
