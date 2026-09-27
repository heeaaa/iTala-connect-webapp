import { describe, expect, it, vi } from 'vitest';
import exportJson from '../fixtures/firebase-export.json';
import { loadLegacyCode } from '../../scripts/firebase-legacy';
import { applyImport, formatApplied, type ImportTarget } from '@/migration/apply';
import { contentName, decodeDataUri, imageOrigin, storedImage } from '@/migration/images';
import { planImport } from '@/migration/import-plan';
import { importReport } from '@/migration/report';

/*
 * Phase 7c (MIGRATION_PLAN.md 12.1 step 4): old images into the new bucket
 * under the editor's rules, without a database. Real file headers are used
 * so the checks see what an upload would.
 */

const A = '-P1JcLF-aaaaaaaaaaaa';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2]);
const legacy = loadLegacyCode();
const planned = () => {
  const plan = planImport(exportJson, { timezone: 'Pacific/Auckland', only: [A] });
  return { plan, report: importReport(plan, new Map([[A, []]])) };
};
const imagesOn = { ownerEmail: 'owner@itala.test', acceptDifferences: false, platform: true, images: true };

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

  it('say where the bytes come from', () => {
    expect(imageOrigin({ kind: 'url', url: 'https://x.test/a.png' })).toEqual({ url: 'https://x.test/a.png' });
    expect(
      imageOrigin({ kind: 'data', mime: 'image/png', bytes: 8, dataUri: 'data:image/png;base64,iVBORw0KGgo=' }),
    ).toEqual({ bytes: PNG.slice(0, 8) });
    expect(imageOrigin({ kind: 'data', mime: 'image/png', bytes: 0, dataUri: 'data:image/png;base64,%%' })).toEqual({
      problem: 'the embedded image cannot be read',
    });
  });
});

describe('copying images', () => {
  it('copies what it can, sets the rows together, removes files no longer used, and says what was left out', async () => {
    const { plan, report } = planned();
    const target = fakeTarget({
      fetchImage: vi.fn(async (url: string) => {
        if (url.endsWith('logo_1.png') || url.endsWith('/platform/p1.png')) return PNG;
        if (url.endsWith('minor_2.png')) return GIF;
        throw new Error('the old address answered 404');
      }),
      setEventImages: vi.fn(async () => ['events/event-uuid/logo-old.png']),
    });
    const result = await applyImport(plan, report, target, legacy, imagesOn);
    const logo = `events/event-uuid/logo-${contentName(PNG)}.png`;
    const minor = `events/event-uuid/minor-${contentName(decodeDataUri('data:image/jpeg;base64,/9j/4AAQSkZJRg==')!)}.jpg`;
    expect(vi.mocked(target.uploadImage).mock.calls.map((c) => [c[0], c[2]])).toEqual([
      [logo, 'image/png'],
      [minor, 'image/jpeg'],
      [`platform/primary-${contentName(PNG)}.png`, 'image/png'],
      [expect.stringMatching(/^platform\/secondary-legacy-/), 'image/png'],
    ]);
    // The minor sponsor that could not be copied leaves no gap in the order.
    expect(target.setEventImages).toHaveBeenCalledWith('event-uuid', logo, [
      { tier: 'minor', image_path: minor, sort_order: 0 },
    ]);
    expect(target.removeImages).toHaveBeenCalledWith(['events/event-uuid/logo-old.png']);
    expect(result.events[0]!.images).toEqual({
      copied: 2,
      left: [
        { what: 'the major sponsor', reason: 'it could not be fetched (the old address answered 404)' },
        { what: 'minor sponsor 2', reason: 'the file is not a PNG, JPEG or WebP image' },
      ],
    });
    expect(result.platformSponsors).toEqual({ copied: 2, left: [], set: true });
    expect(target.setPlatformSponsors).toHaveBeenCalledWith([
      { tier: 'primary', image_path: `platform/primary-${contentName(PNG)}.png`, sort_order: 0 },
      { tier: 'secondary', image_path: expect.stringMatching(/^platform\/secondary-legacy-/), sort_order: 0 },
    ]);
    const text = formatApplied(result);
    expect(text).toContain('images: 2 copied');
    expect(text).toContain(
      'image left out: the major sponsor, because it could not be fetched (the old address answered 404)',
    );
    expect(text).toContain('Platform sponsors: 2 copied from the old database');
    expect(text).toContain('written, but it could not be read back: not needed here');
  });

  it('leaves platform sponsors set in Connect alone, and takes its files back when someone set them meanwhile', async () => {
    const { plan, report } = planned();
    const busy = fakeTarget({ platformHasSponsors: vi.fn(async () => true), fetchImage: vi.fn(async () => PNG) });
    const kept = await applyImport(plan, report, busy, legacy, imagesOn);
    expect(kept.platformSponsors).toEqual({ copied: 0, left: [], set: false });
    expect(busy.setPlatformSponsors).not.toHaveBeenCalled();
    expect(formatApplied(kept)).toContain('Platform sponsors: left as they are');

    const raced = fakeTarget({ setPlatformSponsors: vi.fn(async () => false), fetchImage: vi.fn(async () => PNG) });
    const lost = await applyImport(plan, report, raced, legacy, imagesOn);
    expect(lost.platformSponsors!.set).toBe(false);
    expect(vi.mocked(raced.removeImages).mock.calls.at(-1)![0]).toEqual([
      `platform/primary-${contentName(PNG)}.png`,
      expect.stringMatching(/^platform\/secondary-legacy-/),
    ]);
  });

  it('reports an upload or row failure without undoing the event', async () => {
    const { plan, report } = planned();
    const target = fakeTarget({
      fetchImage: vi.fn(async () => PNG),
      uploadImage: vi.fn(async () => {
        throw new Error('bucket full');
      }),
    });
    const result = await applyImport(plan, report, target, legacy, { ...imagesOn, platform: false });
    const e = result.events[0]!;
    expect(e.outcome).toBe('written');
    expect(e.images!.copied).toBe(0);
    expect(e.images!.left[0]).toEqual({ what: 'the logo', reason: 'it could not be uploaded (bucket full)' });

    const rows = fakeTarget({
      fetchImage: vi.fn(async () => PNG),
      setEventImages: vi.fn(async (): Promise<string[]> => {
        throw new Error('Not an imported event');
      }),
    });
    const r2 = await applyImport(plan, report, rows, legacy, { ...imagesOn, platform: false });
    expect(r2.events[0]!.images).toEqual({
      copied: 0,
      left: [{ what: 'the images', reason: 'Not an imported event' }],
    });
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
