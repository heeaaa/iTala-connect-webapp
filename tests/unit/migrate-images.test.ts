import { describe, expect, it, vi } from 'vitest';
import exportJson from '../fixtures/firebase-export.json';
import { loadLegacyCode } from '../../scripts/firebase-legacy';
import { applyImport, formatApplied, type ImportTarget } from '@/migration/apply';
import { allowedImageUrl, contentName, decodeDataUri, imageOrigin, storedImage } from '@/migration/images';
import { planImport } from '@/migration/import-plan';
import { importReport } from '@/migration/report';

/*
 * Phase 7c (MIGRATION_PLAN.md 12.1 step 4): old images into the new bucket
 * under the editor's rules, without a database. Real file headers are used
 * so the checks see what an upload would. The fixture's old image host
 * (old-images.example.test) is allowed explicitly, as --image-host would.
 */

const A = '-P1JcLF-aaaaaaaaaaaa';
const OLD_HOST = 'old-images.example.test';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2]);
const legacy = loadLegacyCode();
const planned = () => {
  const plan = planImport(exportJson, { timezone: 'Pacific/Auckland', only: [A] });
  return { plan, report: importReport(plan, new Map([[A, []]])) };
};
const imagesOn = {
  ownerEmail: 'owner@itala.test',
  acceptDifferences: [],
  overwrite: [],
  platform: true,
  images: true,
  imageHosts: [OLD_HOST],
};
const minorPath = () =>
  `events/event-uuid/minor-${contentName(decodeDataUri('data:image/jpeg;base64,/9j/4AAQSkZJRg==')!)}.jpg`;

function fakeTarget(overrides: Partial<ImportTarget> = {}): ImportTarget {
  return {
    ownerId: vi.fn(async () => 'owner-uuid'),
    importEvent: vi.fn(async () => ({
      event_id: 'event-uuid',
      created: true,
      divisions: 1,
      teams: 3,
      players: 3,
      games: 6,
      scores: 6,
      approvals: 1,
      mobile_links: 1,
    })),
    readBack: vi.fn(async () => {
      throw new Error('not needed here');
    }),
    importPlatform: vi.fn(async () => false),
    // Every old address answers with a PNG unless a test says otherwise.
    fetchImage: vi.fn(async (): Promise<Uint8Array> => PNG),
    uploadImage: vi.fn(async () => {}),
    removeImages: vi.fn(async () => {}),
    setEventImages: vi.fn(async (): Promise<string[]> => []),
    platformHasSponsors: vi.fn(async () => false),
    setPlatformSponsors: vi.fn(async () => true),
    ...overrides,
  };
}

describe('the image helpers', () => {
  it('decode embedded images, and refuse data that is not base64', () => {
    expect(decodeDataUri('data:image/png;base64,iVBORw0KGgo=')).toEqual(PNG.slice(0, 8));
    expect(decodeDataUri('data:image/png;base64,iVBO Rw0K\nGgo=')).toEqual(PNG.slice(0, 8));
    expect(decodeDataUri('data:image/png,plain')).toBeNull();
    expect(decodeDataUri('no comma')).toBeNull();
    expect(decodeDataUri('data:image/png;base64,**')).toBeNull();
  });

  it('check an image as an upload is checked, and name it by its content', () => {
    expect(storedImage(PNG, { eventId: 'e1', kind: 'logo' })).toEqual({
      bytes: PNG,
      type: 'image/png',
      path: `events/e1/logo-${contentName(PNG)}.png`,
    });
    expect(contentName(PNG)).toMatch(/^legacy-[0-9a-f]{20}$/);
    expect(contentName(PNG)).toBe(contentName(new Uint8Array(PNG)));
    expect(storedImage(PNG, { tier: 'secondary' })).toMatchObject({
      path: expect.stringMatching(/^platform\/secondary-legacy-[0-9a-f]{20}\.png$/),
    });
    expect(storedImage(GIF, { eventId: 'e1', kind: 'minor' })).toEqual({
      problem: 'the file is not a PNG, JPEG or WebP image',
    });
    expect(storedImage(new Uint8Array(), { eventId: 'e1', kind: 'minor' })).toEqual({ problem: 'the image is empty' });
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect(storedImage(big, { eventId: 'e1', kind: 'minor' })).toMatchObject({
      problem: expect.stringContaining('larger than 5 MB'),
    });
  });

  it('fetch only from the old image store: https, its hosts, never an IP address', () => {
    expect(allowedImageUrl('https://abcd.supabase.co/storage/v1/object/public/images/a.png')).toBe(true);
    expect(allowedImageUrl('https://ABCD.Supabase.co/a.png')).toBe(true);
    for (const bad of [
      'http://abcd.supabase.co/a.png',
      'https://supabase.co/a.png',
      'https://abcd.supabase.co.evil.test/a.png',
      'https://evilsupabase.co/a.png',
      'https://127.0.0.1/a.png',
      'https://10.0.0.8/snapshot.jpg',
      'https://[::1]/a.png',
      'https://user:pw@abcd.supabase.co/a.png',
      'https://intranet.local/a.png',
      'not a url',
    ])
      expect(allowedImageUrl(bad), bad).toBe(false);
    expect(allowedImageUrl('https://old-images.example.test/a.png', [OLD_HOST])).toBe(true);
    expect(allowedImageUrl('https://x.old-images.example.test/a.png', [OLD_HOST])).toBe(false);
  });

  it('say where the bytes come from, refusing addresses outside the old store', () => {
    expect(imageOrigin({ kind: 'url', url: 'https://abcd.supabase.co/a.png' })).toEqual({
      url: 'https://abcd.supabase.co/a.png',
    });
    expect(imageOrigin({ kind: 'url', url: 'https://10.0.0.8/a.png' })).toEqual({
      problem: 'its address is not in the old image store (*.supabase.co), so it was not fetched',
    });
    expect(
      imageOrigin({ kind: 'data', mime: 'image/png', bytes: 8, dataUri: 'data:image/png;base64,iVBORw0KGgo=' }),
    ).toEqual({ bytes: PNG.slice(0, 8) });
    expect(imageOrigin({ kind: 'data', mime: 'image/png', bytes: 0, dataUri: 'data:image/png;base64,%%' })).toEqual({
      problem: 'the embedded image cannot be read',
    });
  });
});

describe('copying images', () => {
  it('with every image copied, replaces the stored ones and removes files no longer used', async () => {
    const { plan, report } = planned();
    const target = fakeTarget({ setEventImages: vi.fn(async () => ['events/event-uuid/logo-old.png']) });
    const result = await applyImport(plan, report, target, legacy, imagesOn);
    const logo = `events/event-uuid/logo-${contentName(PNG)}.png`;
    expect(vi.mocked(target.uploadImage).mock.calls.map((c) => [c[0], c[2]])).toEqual([
      [logo, 'image/png'],
      [`events/event-uuid/major-${contentName(PNG)}.png`, 'image/png'],
      [minorPath(), 'image/jpeg'],
      [`events/event-uuid/minor-${contentName(PNG)}.png`, 'image/png'],
      [`platform/primary-${contentName(PNG)}.png`, 'image/png'],
      [expect.stringMatching(/^platform\/secondary-legacy-/), 'image/png'],
    ]);
    expect(target.setEventImages).toHaveBeenCalledWith(
      'event-uuid',
      logo,
      [
        { tier: 'major', image_path: `events/event-uuid/major-${contentName(PNG)}.png`, sort_order: 0 },
        { tier: 'minor', image_path: minorPath(), sort_order: 0 },
        { tier: 'minor', image_path: `events/event-uuid/minor-${contentName(PNG)}.png`, sort_order: 1 },
      ],
      true,
    );
    expect(target.removeImages).toHaveBeenCalledWith(['events/event-uuid/logo-old.png']);
    expect(result.events[0]!.images).toEqual({ copied: 4, left: [], replaced: true });
    expect(result.platformSponsors).toEqual({ copied: 2, left: [], set: true });
    const text = formatApplied(result);
    expect(text).toContain('images: 4 copied');
    expect(text).toContain('Platform sponsors: 2 copied from the old database');
  });

  it('with some images lost, only fills empty slots and removes nothing, so earlier copies stay', async () => {
    const { plan, report } = planned();
    const target = fakeTarget({
      fetchImage: vi.fn(async (url: string) => {
        if (url.endsWith('logo_1.png') || url.endsWith('/platform/p1.png')) return PNG;
        if (url.endsWith('minor_2.png')) return GIF;
        throw new Error('the old address answered 503');
      }),
      // Even if the database named files, a partial copy must not remove them.
      setEventImages: vi.fn(async () => ['events/event-uuid/major-old.png']),
    });
    const result = await applyImport(plan, report, target, legacy, imagesOn);
    expect(target.setEventImages).toHaveBeenCalledWith(
      'event-uuid',
      `events/event-uuid/logo-${contentName(PNG)}.png`,
      [{ tier: 'minor', image_path: minorPath(), sort_order: 0 }],
      false,
    );
    expect(vi.mocked(target.removeImages).mock.calls.flat(2)).not.toContain('events/event-uuid/major-old.png');
    expect(result.events[0]!.images).toEqual({
      copied: 2,
      replaced: false,
      left: [
        { what: 'the major sponsor', reason: 'it could not be fetched (the old address answered 503)' },
        { what: 'minor sponsor 2', reason: 'the file is not a PNG, JPEG or WebP image' },
      ],
    });
    const text = formatApplied(result);
    expect(text).toContain('images: 2 copied; some could not be, so images copied before were kept');
    expect(text).toContain(
      'image left out: the major sponsor, because it could not be fetched (the old address answered 503)',
    );
  });

  it('never fetches an address outside the old image store', async () => {
    const { plan, report } = planned();
    const target = fakeTarget();
    const result = await applyImport(plan, report, target, legacy, { ...imagesOn, imageHosts: [] });
    expect(target.fetchImage).not.toHaveBeenCalled();
    expect(result.events[0]!.images!.left.map((l) => l.reason)).toEqual([
      'its address is not in the old image store (*.supabase.co), so it was not fetched',
      'its address is not in the old image store (*.supabase.co), so it was not fetched',
      'its address is not in the old image store (*.supabase.co), so it was not fetched',
    ]);
  });

  it('leaves platform sponsors set in Connect alone, and takes its files back when someone set them meanwhile', async () => {
    const { plan, report } = planned();
    const busy = fakeTarget({ platformHasSponsors: vi.fn(async () => true) });
    const kept = await applyImport(plan, report, busy, legacy, imagesOn);
    expect(kept.platformSponsors).toEqual({ copied: 0, left: [], set: false });
    expect(busy.setPlatformSponsors).not.toHaveBeenCalled();
    expect(formatApplied(kept)).toContain('Platform sponsors: left as they are');

    const raced = fakeTarget({ setPlatformSponsors: vi.fn(async () => false) });
    const lost = await applyImport(plan, report, raced, legacy, imagesOn);
    expect(lost.platformSponsors!.set).toBe(false);
    expect(vi.mocked(raced.removeImages).mock.calls.at(-1)![0]).toEqual([
      `platform/primary-${contentName(PNG)}.png`,
      expect.stringMatching(/^platform\/secondary-legacy-/),
    ]);
  });

  it('reports upload, row and removal failures without undoing the event', async () => {
    const { plan, report } = planned();
    const upload = fakeTarget({
      uploadImage: vi.fn(async () => {
        throw new Error('bucket full');
      }),
    });
    const r1 = await applyImport(plan, report, upload, legacy, { ...imagesOn, platform: false });
    expect(r1.events[0]!.outcome).toBe('written');
    expect(r1.events[0]!.images!.copied).toBe(0);
    expect(r1.events[0]!.images!.left[0]).toEqual({
      what: 'the logo',
      reason: 'it could not be uploaded (bucket full)',
    });

    // The rows could not be set: the files just uploaded are taken back.
    const rows = fakeTarget({
      setEventImages: vi.fn(async (): Promise<string[]> => {
        throw new Error('Not an imported event');
      }),
    });
    const r2 = await applyImport(plan, report, rows, legacy, { ...imagesOn, platform: false });
    expect(r2.events[0]!.images).toEqual({
      copied: 0,
      left: [{ what: 'the images', reason: 'Not an imported event' }],
    });
    expect(vi.mocked(rows.removeImages).mock.calls[0]![0]).toHaveLength(4);

    const removal = fakeTarget({
      setEventImages: vi.fn(async () => ['events/event-uuid/logo-old.png']),
      removeImages: vi.fn(async () => {
        throw new Error('storage down');
      }),
    });
    const r3 = await applyImport(plan, report, removal, legacy, { ...imagesOn, platform: false });
    expect(r3.events[0]!.images).toMatchObject({ copied: 4, replaced: true });
    expect(r3.events[0]!.images!.left).toEqual([
      { what: '1 old file(s) no longer used', reason: 'they could not be removed (storage down)' },
    ]);
  });

  it('copies nothing when images are skipped', async () => {
    const { plan, report } = planned();
    const target = fakeTarget();
    const result = await applyImport(plan, report, target, legacy, { ...imagesOn, images: false });
    expect(target.fetchImage).not.toHaveBeenCalled();
    expect(target.setEventImages).not.toHaveBeenCalled();
    expect(result.events[0]!.images).toBeUndefined();
    expect(result.platformSponsors).toBeNull();
  });
});
