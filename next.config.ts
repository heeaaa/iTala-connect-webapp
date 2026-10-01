import type { NextConfig } from 'next';

// Static security headers (X-03). The nonce-based Content-Security-Policy
// is set per request in src/proxy.ts.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Next 16.3's Turbopack disk cache can retain runtime environment values.
    // Netlify restores/scans that cache, so runtime secrets must not be saved there.
    // Development caching stays enabled; prebuild also removes older saved caches.
    turbopackFileSystemCacheForBuild: false,
    // Event logo and sponsor uploads (E-18) go through a Server Action. The
    // browser shrinks them to 1600 px first; 5 MB matches the images bucket.
    serverActions: { bodySizeLimit: '5mb' },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
