import { serverEnv } from '@/env';
import { SAMPLE_SPONSOR_LOGOS } from '@/prototype/league-night';

/**
 * SIMULATED sponsor logos for /prototype/today?sponsors=, as SVG files with
 * the shape of real uploads. Returns 404 unless ENABLE_PROTOTYPES=1.
 */
export async function GET(_request: Request, ctx: RouteContext<'/prototype/sponsor-logo/[name]'>) {
  const key = (await ctx.params).name.replace(/\.svg$/, '');
  const logo =
    serverEnv().ENABLE_PROTOTYPES && Object.hasOwn(SAMPLE_SPONSOR_LOGOS, key) ? SAMPLE_SPONSOR_LOGOS[key] : undefined;
  if (!logo) return new Response('Not found', { status: 404 });
  const { width, height, label } = logo;
  const fontSize = Math.round(Math.min(height * 0.3, (width * 0.8) / (label.length * 0.6)));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="48" fill="#1d1d1b"/>` +
    `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Arial, sans-serif"` +
    ` font-weight="700" font-size="${fontSize}" fill="#ffffff">${label}</text></svg>`;
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
  });
}
