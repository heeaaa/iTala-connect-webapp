import { createHash } from 'node:crypto';

import { IMAGE_LIMIT, imagePath, platformImagePath, sniffImageType, type StoredType } from '@/lib/event-images';

import type { ImageSource } from './map-event';

/**
 * The image step of the import (MIGRATION_PLAN.md 12.1 step 4, Phase 7c):
 * old images are either web addresses (the old image bucket) or embedded
 * data. Each becomes a file in the new bucket under the same rules as an
 * upload in the editor: PNG, JPEG or WebP by its own bytes, at most 5 MB, in
 * the event's (or the platform's) folder. The name comes from the content,
 * so importing again reuses the same file.
 */

export type ImageBytes = { bytes: Uint8Array; type: StoredType; path: string } | { problem: string };

/** The bytes of an embedded image, or null when the data cannot be read. */
export function decodeDataUri(uri: string): Uint8Array | null {
  const comma = uri.indexOf(',');
  if (comma < 0 || !/;base64$/i.test(uri.slice(0, comma))) return null;
  const data = uri.slice(comma + 1).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return null;
  return new Uint8Array(Buffer.from(data, 'base64'));
}

/** A short name from the content, the same for the same picture. */
export const contentName = (bytes: Uint8Array) =>
  `legacy-${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}`;

/** Checks bytes as the editor's upload does, and says where they go. */
export function storedImage(
  bytes: Uint8Array,
  place: { eventId: string; kind: 'logo' | 'major' | 'minor' } | { tier: 'primary' | 'secondary' },
): ImageBytes {
  if (bytes.length === 0) return { problem: 'the image is empty' };
  if (bytes.length > IMAGE_LIMIT) return { problem: 'the image is larger than 5 MB (add a smaller one in the editor)' };
  const type = sniffImageType(bytes);
  if (!type) return { problem: 'the file is not a PNG, JPEG or WebP image' };
  const name = contentName(bytes);
  const path =
    'eventId' in place ? imagePath(place.eventId, place.kind, type, name) : platformImagePath(place.tier, type, name);
  return { bytes, type, path };
}

/** Where to get an image's bytes: decoded here, or fetched by the caller. */
export function imageOrigin(source: ImageSource): { bytes: Uint8Array } | { url: string } | { problem: string } {
  if (source.kind === 'url') return { url: source.url };
  const bytes = decodeDataUri(source.dataUri);
  return bytes ? { bytes } : { problem: 'the embedded image cannot be read' };
}
