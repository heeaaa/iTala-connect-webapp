import { describe, expect, it } from 'vitest';

import { authOrigin } from '@/server/auth-origin';

const canonical = 'https://connect.itala.fyi';
const preview = 'https://deploy-preview-12--itala-connect.netlify.app';

describe('OAuth redirect origin', () => {
  it('keeps a callback on the exact trusted production host that set its cookie', () => {
    expect(authOrigin(canonical, canonical)).toBe(canonical);
    expect(authOrigin(canonical, 'https://itala-connect.netlify.app')).toBe('https://itala-connect.netlify.app');
    expect(authOrigin('https://itala-connect.netlify.app', canonical)).toBe(canonical);
  });

  it('keeps a Netlify preview callback and its PKCE cookie on the preview host', () => {
    expect(authOrigin(canonical, preview)).toBe(preview);
  });

  it('rejects forged and malformed hosts', () => {
    expect(authOrigin(canonical, 'https://attacker.example')).toBe(canonical);
    expect(authOrigin(canonical, 'not a URL')).toBe(canonical);
    expect(authOrigin(canonical, 'http://deploy-preview-12--itala-connect.netlify.app')).toBe(canonical);
    expect(authOrigin(canonical, 'https://deploy-preview-12--itala-connect.netlify.app:444')).toBe(canonical);
    expect(authOrigin(canonical, 'https://deploy-preview-12--other-site.netlify.app')).toBe(canonical);
    expect(authOrigin(canonical, 'https://deploy-preview-12--itala-connect.netlify.app.attacker.example')).toBe(
      canonical,
    );
  });
});
