import { describe, expect, it } from 'vitest';

import { authOrigin } from '@/server/auth-origin';

const canonical = 'https://connect.itala.fyi';
const preview = 'https://deploy-preview-12--itala-connect.netlify.app';

describe('OAuth redirect origin', () => {
  it('uses the canonical domain in production', () => {
    expect(authOrigin(canonical, canonical, 'production', preview)).toBe(canonical);
  });

  it('keeps a Netlify preview callback and its PKCE cookie on the preview host', () => {
    expect(authOrigin(canonical, preview, 'deploy-preview', preview)).toBe(preview);
  });

  it('rejects a forged request host or a malformed deploy URL', () => {
    expect(authOrigin(canonical, 'https://attacker.example', 'deploy-preview', preview)).toBe(canonical);
    expect(authOrigin(canonical, 'https://attacker.example', 'deploy-preview', 'not a URL')).toBe(canonical);
    expect(
      authOrigin(canonical, 'http://deploy-preview-12--itala-connect.netlify.app', 'deploy-preview', preview),
    ).toBe(canonical);
  });
});
