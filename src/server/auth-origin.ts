/**
 * OAuth must return to the same deploy that stored its PKCE cookie. Only the
 * canonical site or Netlify's trusted deploy URL may be used as an origin.
 */
export function authOrigin(
  canonicalSiteUrl: string,
  requestOrigin: string,
  context: string | undefined,
  deployPrimeUrl: string | undefined,
): string {
  const canonical = new URL(canonicalSiteUrl).origin;
  if (context !== 'deploy-preview' || !deployPrimeUrl) return canonical;
  try {
    const preview = new URL(deployPrimeUrl);
    if (preview.protocol === 'https:' && requestOrigin === preview.origin) return preview.origin;
  } catch {
    // A missing or malformed deploy URL must not make the request host trusted.
  }
  return canonical;
}
