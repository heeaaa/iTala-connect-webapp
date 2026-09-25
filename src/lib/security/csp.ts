/**
 * Content Security Policy (X-03). Nonce-based for scripts and style
 * elements. Inline style attributes are allowed through style-src-attr
 * because event pages set their five organiser colours as CSS variables on
 * the page root; attributes cannot run script.
 */
export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** iTala Connect Supabase URL: REST, Auth, Storage and Realtime. */
  supabaseUrl: string;
}

export function buildCsp({ nonce, isDev, supabaseUrl }: CspOptions): string {
  const supabase = new URL(supabaseUrl);
  const realtime = `${supabase.protocol === 'https:' ? 'wss:' : 'ws:'}//${supabase.host}`;

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", `'nonce-${nonce}'`],
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': ["'self'", 'blob:', 'data:', supabase.origin],
    'font-src': ["'self'"],
    'connect-src': ["'self'", supabase.origin, realtime],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };

  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');

  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}
