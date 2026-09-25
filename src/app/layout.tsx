import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'iTala Connect', template: '%s | iTala Connect' },
  description: 'Basketball tournament scheduling, live scores and standings for community leagues.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // Every page is rendered per request so Next.js can apply the CSP nonce
  // set in src/proxy.ts (plan section 9).
  await connection();

  return (
    <html lang="en-NZ" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
