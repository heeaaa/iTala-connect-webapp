/** OAuth must return to the exact host that stored its PKCE cookie. */
export function authOrigin(canonicalSiteUrl: string, requestOrigin: string): string {
  const canonical = new URL(canonicalSiteUrl).origin;
  try {
    const requested = new URL(requestOrigin);
    if (requested.origin === canonical) return canonical;
    if (requested.protocol !== 'https:') return canonical;
    if (requested.origin === 'https://connect.itala.fyi' || requested.origin === 'https://itala-connect.netlify.app')
      return requested.origin;
    // Netlify exposes CONTEXT and DEPLOY_PRIME_URL during builds, but not in
    // Functions at runtime. Match only this site's numbered PR deploy hosts.
    if (!requested.port && /^deploy-preview-[1-9]\d*--itala-connect\.netlify\.app$/.test(requested.hostname))
      return requested.origin;
  } catch {
    // An invalid request origin must not become an OAuth redirect.
  }
  return canonical;
}
