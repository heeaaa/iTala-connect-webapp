/**
 * Colour helpers for organiser-chosen colours (PRD E-19, P-02). Event
 * colours are stored as #RRGGBB; anything else is rejected.
 */

const HEX = /^#([0-9a-f]{6})$/i;

export function isHexColour(value: string): boolean {
  return HEX.test(value);
}

function channels(hex: string): [number, number, number] {
  const m = HEX.exec(hex);
  if (!m) throw new RangeError(`Not a #RRGGBB colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on the given colour. */
export function readableOn(hex: string): '#000000' | '#FFFFFF' {
  return contrastRatio(hex, '#000000') >= contrastRatio(hex, '#FFFFFF') ? '#000000' : '#FFFFFF';
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();

/**
 * Semi and final cards (E-43): the old warm shift of the division colour
 * (red +60, green +40, blue -20), returned as a valid #RRGGBB. The old code
 * returned rgb() into hex maths and painted NaN.
 */
export function playoffColour(divisionColour: string): string {
  const [r, g, b] = isHexColour(divisionColour) ? channels(divisionColour) : [0x88, 0x88, 0x88];
  return `#${hex2(Math.min(255, r + 60))}${hex2(Math.min(255, g + 40))}${hex2(Math.max(0, b - 20))}`;
}
