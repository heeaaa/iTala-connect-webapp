/**
 * Event logo and sponsor images (PRD E-15 to E-18): the rules shared by the
 * browser (checks and resizing before upload) and the Server Action (checks
 * of the bytes that arrive). Pure, so both sides agree and it is testable.
 */

/** Largest file accepted, before and after compression (E-18; the bucket's own limit too). */
export const IMAGE_LIMIT = 5 * 1024 * 1024;

/**
 * Largest resized image the browser sends: below the 5 MB Server Action
 * limit, which also counts the upload's own form overhead.
 */
export const SEND_LIMIT = 4 * 1024 * 1024;
export const STILL_TOO_LARGE = 'the image is still over 4 MB after resizing. Try a smaller or simpler picture.';

/** Longest edge after compression, in pixels (E-18). */
export const MAX_EDGE = 1600;

/** What the images bucket stores. */
export const STORED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type StoredType = (typeof STORED_TYPES)[number];

export type ImageKind = 'logo' | 'major' | 'minor';

/** "Upload failed: {reason}" (E-18). */
export const uploadFailed = (reason: string) => `Upload failed: ${reason}`;
export const TOO_LARGE = 'the image is larger than 5 MB.';
export const NOT_AN_IMAGE = 'choose a PNG, JPEG or WebP image.';

/**
 * Why a chosen file cannot be used, before any work is done: not an image
 * the browser can turn into a PNG, JPEG or WebP (SVG is refused, as it can
 * carry script), or over 5 MB.
 */
export function fileProblem(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return NOT_AN_IMAGE;
  if (file.size > IMAGE_LIMIT) return TOO_LARGE;
  return null;
}

/** The size that fits within `max` on its longest edge, never enlarged. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * The stored type, read from the file's first bytes rather than trusting its
 * declared type: PNG, JPEG or WebP, else null.
 */
export function sniffImageType(bytes: Uint8Array): StoredType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export const extensionFor = (type: StoredType) =>
  type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp';

/** Where an event's image is stored: its own folder, a fresh name each time so caches never show an old one. */
export const imagePath = (eventId: string, kind: ImageKind, type: StoredType, id: string) =>
  `events/${eventId}/${kind}-${id}.${extensionFor(type)}`;

/** Platform sponsors (PRD S-01): primary show full size on every event, secondary half size. */
export type PlatformTier = 'primary' | 'secondary';

/** Where a platform sponsor is stored: the platform folder, a fresh name each time. */
export const platformImagePath = (tier: PlatformTier, type: StoredType, id: string) =>
  `platform/${tier}-${id}.${extensionFor(type)}`;
