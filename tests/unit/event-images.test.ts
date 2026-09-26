import { describe, expect, it } from 'vitest';
import {
  IMAGE_LIMIT,
  MAX_EDGE,
  NOT_AN_IMAGE,
  TOO_LARGE,
  extensionFor,
  fileProblem,
  fitWithin,
  imagePath,
  sniffImageType,
  uploadFailed,
} from '@/lib/event-images';

const bytes = (...b: (number | string)[]) =>
  new Uint8Array(b.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe('choosing an image (E-18)', () => {
  it('takes any image the browser can redraw, up to 5 MB, but never SVG', () => {
    expect(fileProblem({ type: 'image/png', size: 1000 })).toBeNull();
    expect(fileProblem({ type: 'image/heic', size: IMAGE_LIMIT })).toBeNull();
    expect(fileProblem({ type: 'image/jpeg', size: IMAGE_LIMIT + 1 })).toBe(TOO_LARGE);
    expect(fileProblem({ type: 'image/svg+xml', size: 10 })).toBe(NOT_AN_IMAGE);
    expect(fileProblem({ type: 'application/pdf', size: 10 })).toBe(NOT_AN_IMAGE);
    expect(fileProblem({ type: '', size: 10 })).toBe(NOT_AN_IMAGE);
    expect(uploadFailed(TOO_LARGE)).toBe('Upload failed: the image is larger than 5 MB.');
  });

  it('shrinks to 1600 px on the longest edge, keeping the shape, and never enlarges', () => {
    expect(MAX_EDGE).toBe(1600);
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(900, 3600)).toEqual({ width: 400, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(5000, 1)).toEqual({ width: 1600, height: 1 });
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 });
  });
});

describe('the bytes that arrive (E-18)', () => {
  it('reads PNG, JPEG and WebP from their first bytes, whatever the file claims', () => {
    expect(sniffImageType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(bytes('RIFF', 1, 2, 3, 4, 'WEBPVP8 '))).toBe('image/webp');
  });

  it('refuses anything else: SVG, HTML, GIF, a truncated header, nothing', () => {
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(bytes('<!doctype html>'))).toBeNull();
    expect(sniffImageType(bytes('GIF89a'))).toBeNull();
    expect(sniffImageType(bytes('RIFF', 1, 2, 3, 4, 'WAVE'))).toBeNull();
    expect(sniffImageType(bytes('RIFF'))).toBeNull();
    expect(sniffImageType(bytes(0x89, 'PNG'))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });

  it("stores each image in its own event's folder under a fresh name", () => {
    expect(imagePath('e1', 'logo', 'image/webp', 'abc')).toBe('events/e1/logo-abc.webp');
    expect(imagePath('e1', 'minor', 'image/jpeg', 'x')).toBe('events/e1/minor-x.jpg');
    expect(extensionFor('image/png')).toBe('png');
  });
});
