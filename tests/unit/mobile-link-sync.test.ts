import { describe, expect, it, vi } from 'vitest';
import { syncMobileLinks } from '@/server/mobile/link-sync-worker';

const config = {
  connectUrl: 'https://connect.test',
  connectKey: 'server-key',
  mobileUrl: 'https://mobile.test',
  secret: 'a'.repeat(32),
};
const snapshot = { leagueId: 'league', revision: 4, checkedAt: 100, events: [] };

describe('durable mobile link delivery', () => {
  it('does not request anything with incomplete configuration', async () => {
    const fetcher = vi.fn();
    expect(await syncMobileLinks({}, fetcher)).toEqual({ configured: false, delivered: 0, failed: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sends an unlinked snapshot and acknowledges only its revision', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([snapshot]))
      .mockResolvedValueOnce(Response.json({ state: snapshot }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await syncMobileLinks(config, fetcher)).toEqual({ configured: true, delivered: 1, failed: 0 });
    const delivery = fetcher.mock.calls[1]!;
    expect(delivery[0]).toBe('https://mobile.test/functions/v1/connect-link-state');
    expect(JSON.parse(delivery[1]!.body as string)).toEqual(snapshot);
    expect(delivery[1]!.headers).toMatchObject({ 'x-connect-link-secret': config.secret });
    expect(JSON.parse(fetcher.mock.calls[2]![1]!.body as string)).toEqual({ p_league_id: 'league', p_revision: 4 });
  });
  it('keeps HTTP failures queued and retries them on a later run', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([snapshot]))
      .mockResolvedValueOnce(new Response(null, { status: 502 }));
    expect((await syncMobileLinks(config, fetcher)).failed).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher
      .mockResolvedValueOnce(Response.json([snapshot]))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await syncMobileLinks(config, fetcher)).delivered).toBe(1);
  });
  it('keeps network and acknowledgement failures queued without stopping other leagues', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).includes('pending_')) return Response.json([snapshot, { ...snapshot, leagueId: 'other' }]);
      if (String(url).includes('connect-link-state')) return Response.json({});
      throw Error('Network unavailable');
    });
    expect((await syncMobileLinks(config, fetcher)).failed).toBe(2);
  });
  it('rejects a malformed queue response and leaves malformed jobs unacknowledged', async () => {
    await expect(syncMobileLinks(config, vi.fn<typeof fetch>().mockResolvedValue(Response.json({})))).rejects.toThrow(
      'Invalid link queue',
    );
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([{ ...snapshot, revision: -1 }]));
    expect((await syncMobileLinks(config, fetcher)).failed).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('handles an empty queue', async () => {
    expect(await syncMobileLinks(config, vi.fn<typeof fetch>().mockResolvedValue(Response.json([])))).toEqual({
      configured: true,
      delivered: 0,
      failed: 0,
    });
  });
  it('delivers another league when one network delivery fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).includes('pending_')) return Response.json([snapshot, { ...snapshot, leagueId: 'other' }]);
      const body = JSON.parse(init!.body as string);
      if (String(url).includes('connect-link-state')) {
        if (body.leagueId === 'league') throw Error('Network unavailable');
        return Response.json({});
      }
      expect(body).toEqual({ p_league_id: 'other', p_revision: 4 });
      return new Response(null, { status: 204 });
    });
    expect(await syncMobileLinks(config, fetcher)).toEqual({ configured: true, delivered: 1, failed: 1 });
  });
  it('surfaces a queue outage without attempting delivery or acknowledgement', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(syncMobileLinks(config, fetcher)).rejects.toThrow('queue request failed');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
