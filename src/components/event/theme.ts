import { type CSSProperties } from 'react';

import { isHexColour, readableOn } from '@/lib/color';

/** The five organiser-chosen event colours (PRD E-19, P-02). */
export interface EventTheme {
  primary: string;
  bg: string;
  text: string;
  textSecondary: string;
  heading: string;
}

/** New-event defaults (PRD E-01). */
export const DEFAULT_EVENT_THEME: EventTheme = {
  primary: '#FFCC00',
  bg: '#0D0D0D',
  text: '#E0E0E0',
  textSecondary: '#888888',
  heading: '#FFFFFF',
};

/**
 * CSS variables for an event page root. Everything inside
 * /events/[eventId] reads only these --ev-* tokens, never --brand-*.
 * A value that is not #RRGGBB falls back to the default for that slot.
 */
export function eventThemeVars(theme: EventTheme): CSSProperties {
  const pick = (key: keyof EventTheme) => (isHexColour(theme[key]) ? theme[key] : DEFAULT_EVENT_THEME[key]);
  const accent = pick('primary');
  return {
    '--ev-accent': accent,
    '--ev-on-accent': readableOn(accent),
    '--ev-bg': pick('bg'),
    '--ev-text': pick('text'),
    '--ev-muted': pick('textSecondary'),
    '--ev-heading': pick('heading'),
  } as CSSProperties;
}

/** Per-element division colour (PRD E-20) as --div / --on-div. */
export function divisionVars(color: string): CSSProperties {
  const div = isHexColour(color) ? color : DEFAULT_EVENT_THEME.primary;
  return { '--div': div, '--on-div': readableOn(div) } as CSSProperties;
}
