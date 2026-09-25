/**
 * Real HTTP boundaries of the local Supabase stack: Auth settings,
 * PostgREST + RLS as each role sees them, RPC permissions and Storage
 * bucket rules. pgTAP covers the SQL policies directly; these tests prove
 * the same rules hold through the APIs the app actually calls.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../support/supabase';

let superadmin: TestUser;
let adminA: TestUser;
let adminB: TestUser;
let noRole: TestUser;
let disabled: TestUser;
let eventA = '';
let eventB = '';
let publishedB = '';

beforeAll(async () => {
  [superadmin, adminA, adminB, noRole, disabled] = await Promise.all([
    createUser('superadmin', { tag: 'super' }),
    createUser('admin', { tag: 'a' }),
    createUser('admin', { tag: 'b' }),
    createUser(null, { tag: 'norole' }),
    createUser('admin', { tag: 'disabled', disabled: true }),
  ]);
  const admin = adminClient();
  const { data, error } = await admin
    .from('events')
    .insert([
      { owner_id: adminA.id, name: 'A draft', status: 'draft' },
      { owner_id: adminB.id, name: 'B draft', status: 'draft' },
      { owner_id: adminB.id, name: 'B published', status: 'published' },
    ])
    .select('id, name');
  if (error) throw error;
  eventA = data.find((e) => e.name === 'A draft')!.id;
  eventB = data.find((e) => e.name === 'B draft')!.id;
  publishedB = data.find((e) => e.name === 'B published')!.id;
});

afterAll(async () => {
  await deleteUsers([superadmin, adminA, adminB, noRole, disabled].filter(Boolean));
});

describe('Auth settings', () => {
  it('public sign-up is off: accounts are created by a superadmin only', async () => {
    const { data, error } = await anonClient().auth.signUp({
      email: `stranger-${Date.now()}@itala.test`,
      password: 'a-long-enough-password',
    });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it('anonymous sign-in is off for iTala Connect', async () => {
    const { error } = await anonClient().auth.signInAnonymously();
    expect(error).not.toBeNull();
  });

  it('wrong password fails without saying which part was wrong', async () => {
    const { error } = await anonClient().auth.signInWithPassword({ email: adminA.email, password: 'wrong' });
    expect(error?.message).toMatch(/invalid login credentials/i);
  });
});

describe('PostgREST with RLS', () => {
  it('anonymous visitors read published events only', async () => {
    const { data, error } = await anonClient().from('events').select('id').in('id', [eventA, eventB, publishedB]);
    expect(error).toBeNull();
    expect(data?.map((e) => e.id)).toEqual([publishedB]);
  });

  it('an admin reads their own draft but not another admin’s draft', async () => {
    const a = await signedInClient(adminA);
    const { data } = await a.from('events').select('id').in('id', [eventA, eventB, publishedB]);
    expect(new Set(data?.map((e) => e.id))).toEqual(new Set([eventA, publishedB]));
  });

  it('an admin cannot edit another admin’s published event', async () => {
    const a = await signedInClient(adminA);
    const { data } = await a.from('events').update({ name: 'hijacked' }).eq('id', publishedB).select('id');
    expect(data).toEqual([]);
    const { data: check } = await adminClient().from('events').select('name').eq('id', publishedB).single();
    expect(check?.name).toBe('B published');
  });

  it('an admin cannot publish another admin’s event through RPC', async () => {
    const a = await signedInClient(adminA);
    const { error } = await a.rpc('publish_event', { p_event_id: eventB, p_games: [], p_clear_scores: false });
    expect(error?.code).toBe('42501');
  });

  it('anonymous visitors cannot call mutation functions at all', async () => {
    const { error } = await anonClient().rpc('publish_event', {
      p_event_id: publishedB,
      p_games: [],
      p_clear_scores: true,
    });
    expect(error).not.toBeNull();
    const { data } = await adminClient().from('events').select('status').eq('id', publishedB).single();
    expect(data?.status).toBe('published');
  });

  it('a user without a role and a disabled admin cannot create events', async () => {
    for (const user of [noRole, disabled]) {
      const client = await signedInClient(user);
      const { error } = await client.from('events').insert({ owner_id: user.id, name: 'nope' });
      expect(error?.code).toBe('42501');
    }
  });

  it('a superadmin can edit any event', async () => {
    const s = await signedInClient(superadmin);
    const { data } = await s.from('events').update({ name: 'B draft (checked)' }).eq('id', eventB).select('name');
    expect(data).toEqual([{ name: 'B draft (checked)' }]);
  });

  it('nobody can write the audit log through the API', async () => {
    const s = await signedInClient(superadmin);
    const { error } = await s.from('audit_log').insert({ action: 'forged' });
    expect(error?.code).toBe('42501');
  });
});

describe('Storage bucket "images"', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('an admin can upload a PNG under their own event', async () => {
    const a = await signedInClient(adminA);
    const { error } = await a.storage
      .from('images')
      .upload(`events/${eventA}/logo-test.png`, png, { contentType: 'image/png', upsert: true });
    expect(error).toBeNull();
  });

  it('an admin cannot upload under another admin’s event', async () => {
    const a = await signedInClient(adminA);
    const { error } = await a.storage
      .from('images')
      .upload(`events/${eventB}/logo-test.png`, png, { contentType: 'image/png' });
    expect(error).not.toBeNull();
  });

  it('SVG is rejected by the bucket (script-capable format)', async () => {
    const a = await signedInClient(adminA);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const { error } = await a.storage
      .from('images')
      .upload(`events/${eventA}/evil.svg`, svg, { contentType: 'image/svg+xml' });
    expect(error).not.toBeNull();
  });

  it('files over 5 MB are rejected by the bucket', async () => {
    const a = await signedInClient(adminA);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    const { error } = await a.storage
      .from('images')
      .upload(`events/${eventA}/big.png`, big, { contentType: 'image/png' });
    expect(error).not.toBeNull();
  });

  afterAll(async () => {
    await adminClient()
      .storage.from('images')
      .remove([`events/${eventA}/logo-test.png`]);
  });
});
