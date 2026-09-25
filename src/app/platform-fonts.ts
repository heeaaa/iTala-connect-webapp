import { Saira } from 'next/font/google';

/*
 * Platform screens (Home, Sign in, admin), Broadcast Package direction.
 * Saira's width axis gives condensed caps for on-air plates and normal
 * width for reading, from one self-hosted variable file (CSP font-src
 * 'self'). Loaded only by platform routes, never on event pages.
 */
const saira = Saira({ subsets: ['latin'], axes: ['wdth'], variable: '--font-platform', display: 'swap' });

export const platformFontClassName = saira.variable;
