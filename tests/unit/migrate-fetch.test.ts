import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseTarget } from '../../scripts/firebase-target';

/*
 * How the import fetches an old image (Phase 7c, review M1): no redirects,
 * at most 5 MB whether or not the size is announced, and a clear reason on
 * failure. A throwaway server on 127.0.0.1 stands in for the old store; the
 * address rules themselves are tested in migrate-images.test.ts.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/ok.png') return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    if (req.url === '/moved.png') return res.writeHead(302, { location: '/ok.png' }).end();
    if (req.url === '/gone.png') return res.writeHead(404).end();
    if (req.url === '/announced-big.png')
      return res.writeHead(200, { 'content-length': String(6 * 1024 * 1024) }).end();
    if (req.url === '/streamed-big.png') {
      // No length header: the cap must hold while reading.
      res.writeHead(200, { 'content-type': 'image/png' });
      const chunk = Buffer.alloc(1024 * 1024);
      for (let i = 0; i < 6; i++) res.write(chunk);
      return res.end();
    }
    res.writeHead(500).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

// The database client is never used by fetchImage; the address is a placeholder.
const target = () => supabaseTarget('http://127.0.0.1:9', 'unused');

describe('fetching an old image', () => {
  it('returns the bytes', async () => {
    expect(Buffer.from(await target().fetchImage(`${base}/ok.png`))).toEqual(PNG);
  });

  it('refuses a redirect, so an address cannot lead somewhere else', async () => {
    await expect(target().fetchImage(`${base}/moved.png`)).rejects.toThrow();
  });

  it('refuses more than 5 MB, announced or not', async () => {
    await expect(target().fetchImage(`${base}/announced-big.png`)).rejects.toThrow('it is larger than 5 MB');
    await expect(target().fetchImage(`${base}/streamed-big.png`)).rejects.toThrow('it is larger than 5 MB');
  });

  it('says what the old address answered', async () => {
    await expect(target().fetchImage(`${base}/gone.png`)).rejects.toThrow('the old address answered 404');
  });
});
