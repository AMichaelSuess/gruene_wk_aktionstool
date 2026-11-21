const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * True for a browser request that changes data and comes from another origin.
 *
 * The session cookie is SameSite=Lax, which only stops other *sites*. Pages on
 * other subdomains of the same domain count as the same site, so the browser
 * sends the cookie with their requests. Browsers always set `Origin` on
 * POST/PUT/PATCH/DELETE, and page script cannot change it, so comparing it
 * with the app's own origin closes that gap. Requests without `Origin` are not
 * from a browser (curl, Coolify cron jobs) and are authenticated separately.
 */
export function isCrossOriginWrite(
  method: string,
  originHeader: string | null,
  appOrigin: string
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  if (!originHeader) return false;
  return originHeader !== appOrigin;
}

/** Public origin of the app (from NEXTAUTH_URL, else the request's own origin). */
export function appOrigin(requestOrigin: string, nextAuthUrl = process.env.NEXTAUTH_URL): string {
  if (nextAuthUrl) {
    try {
      return new URL(nextAuthUrl).origin;
    } catch {
      // invalid NEXTAUTH_URL stops a production start (config-check); fall back in dev
    }
  }
  return requestOrigin;
}
