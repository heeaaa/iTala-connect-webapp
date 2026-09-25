import { describe, expect, it } from 'vitest';

import { contrastRatio, isHexColour, luminance, readableOn } from '@/lib/color';

describe('colour helpers (PRD E-19)', () => {
  it('accepts only #RRGGBB', () => {
    expect(isHexColour('#FFCC00')).toBe(true);
    expect(isHexColour('#ffcc00')).toBe(true);
    expect(isHexColour('#FC0')).toBe(false);
    expect(isHexColour('rgb(1,2,3)')).toBe(false);
    expect(() => luminance('red')).toThrow(RangeError);
  });

  it('matches the WCAG contrast figures', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    // Default event theme: muted text on background must stay above AA.
    expect(contrastRatio('#888888', '#0D0D0D')).toBeGreaterThan(4.5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('picks black or white text for a division colour', () => {
    expect(readableOn('#FFCC00')).toBe('#000000');
    expect(readableOn('#3BACDF')).toBe('#000000');
    expect(readableOn('#1B2A52')).toBe('#FFFFFF');
    expect(readableOn('#0D0D0D')).toBe('#FFFFFF');
  });
});
