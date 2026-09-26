import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageProblem, compressImage } from '@/lib/compress-image';

// jsdom has no image decoding or canvas encoding, so both are stood in for:
// createImageBitmap reports a size, and canvas.toBlob returns what the
// "browser" can write. Chromium itself (WebP) is proven in the harness and E2E.
let decoded: { width: number; height: number } | Error;
let canWrite: string[];
let drawn: { width: number; height: number } | null;
let written: string[];

beforeEach(() => {
  decoded = { width: 2000, height: 1000 };
  canWrite = ['image/webp', 'image/png', 'image/jpeg'];
  drawn = null;
  written = [];
  vi.stubGlobal('createImageBitmap', async () => {
    if (decoded instanceof Error) throw decoded;
    return { ...decoded, close: () => {} };
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { drawImage: () => (drawn = { width: this.width, height: this.height }) } as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback, type = 'image/png') {
    written.push(type);
    // A browser that cannot write the type falls back to PNG, as canvas does.
    const actual = canWrite.includes(type) ? type : 'image/png';
    callback(new Blob([new Uint8Array(10)], { type: actual }));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const file = (type = 'image/png', size = 100) => new File([new Uint8Array(size)], 'x', { type });

describe('compressImage (E-18)', () => {
  it('redraws at most 1600 px on the longest edge and writes WebP', async () => {
    const blob = await compressImage(file());
    expect(drawn).toEqual({ width: 1600, height: 800 });
    expect(blob.type).toBe('image/webp');
    expect(written).toEqual(['image/webp']);
  });

  it('keeps PNG for pictures, JPEG for photos, where the browser cannot write WebP', async () => {
    canWrite = ['image/png', 'image/jpeg'];
    expect((await compressImage(file('image/png'))).type).toBe('image/png');
    expect((await compressImage(file('image/gif'))).type).toBe('image/png');
    expect((await compressImage(file('image/jpeg'))).type).toBe('image/jpeg');
  });

  it('refuses before decoding: not an image, SVG, over 5 MB', async () => {
    await expect(compressImage(file('text/html'))).rejects.toThrow(ImageProblem);
    await expect(compressImage(file('image/svg+xml'))).rejects.toThrow('choose a PNG, JPEG or WebP image.');
    await expect(compressImage(file('image/png', 5 * 1024 * 1024 + 1))).rejects.toThrow(
      'the image is larger than 5 MB.',
    );
    expect(drawn).toBeNull();
  });

  it('says when a picture cannot be read, drawn, or kept under 5 MB', async () => {
    decoded = new Error('bad data');
    await expect(compressImage(file())).rejects.toThrow('this image could not be read.');
    decoded = { width: 10, height: 10 };
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    await expect(compressImage(file())).rejects.toThrow('this browser could not prepare the image.');
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) =>
      callback(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: 'image/webp' })),
    );
    await expect(compressImage(file())).rejects.toThrow('the image is still over 4 MB after resizing.');
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(null));
    await expect(compressImage(file())).rejects.toThrow('this browser could not prepare the image.');
  });
});
