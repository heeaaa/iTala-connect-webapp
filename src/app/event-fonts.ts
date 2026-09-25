import { Archivo, Big_Shoulders, Big_Shoulders_Stencil } from 'next/font/google';

/*
 * Public event page faces (Painted Lines direction), self-hosted by
 * next/font so the CSP's font-src 'self' holds. Big Shoulders: athletic
 * signage numerals and headings. Stencil cut: court numbers, like floor
 * stencils. Archivo: team names and body copy.
 */
const display = Big_Shoulders({
  subsets: ['latin'],
  variable: '--font-ev-display',
  display: 'swap',
  adjustFontFallback: false,
});
const stencil = Big_Shoulders_Stencil({
  subsets: ['latin'],
  variable: '--font-ev-stencil',
  display: 'swap',
  adjustFontFallback: false,
});
const body = Archivo({ subsets: ['latin'], variable: '--font-ev-body', display: 'swap' });

export const eventFontClassName = `${display.variable} ${stencil.variable} ${body.variable}`;
