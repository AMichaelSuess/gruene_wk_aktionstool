/**
 * In-memory rate limiting for a single app container.
 *
 * State lives in the process, so counters reset on every deploy/restart.
 * That is acceptable for the single-container Coolify setup.
 */

/**
 * Client IP as seen by the trusted reverse proxy.
 *
 * Production runs behind exactly one proxy (Coolify's Traefik), which appends
 * the address of the peer it received the request from as the LAST entry of
 * X-Forwarded-For. Earlier entries are supplied by the client and can be
 * forged, so they must not be used as a rate-limit key. If another proxy
 * (e.g. a CDN) is ever put in front, this has to take the entry that proxy
 * adds instead.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  const last = xff
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  return last || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Fixed-window limiter. Returns a function that records one hit for `key`
 * and reports whether the key is now over `limit` within `windowMs`.
 *
 * The map is bounded: expired entries are purged when it reaches `maxKeys`,
 * and if it is still full (a flood of distinct keys) every new key is
 * rejected rather than letting memory grow without limit.
 */
export function createRateLimiter(limit: number, windowMs: number, maxKeys = 10_000) {
  const map = new Map<string, { count: number; resetAt: number }>();

  return function isRateLimited(key: string): boolean {
    const now = Date.now();
    const entry = map.get(key);

    if (entry && now <= entry.resetAt) {
      entry.count++;
      return entry.count > limit;
    }

    if (!entry && map.size >= maxKeys) {
      for (const [k, v] of map) {
        if (now > v.resetAt) map.delete(k);
      }
      if (map.size >= maxKeys) return true; // fail closed under flood
    }

    map.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  };
}

/**
 * Counts failures (e.g. wrong passwords) per key within a fixed window.
 * Unlike createRateLimiter, checking does not count as a hit: callers ask
 * `isBlocked` first and call `recordFailure` only when the attempt failed.
 *
 * Bounded at `maxKeys`: expired entries are purged first, then the oldest
 * entry is evicted. Unknown keys are never blocked just because the map is
 * full. Otherwise anyone able to fill it (a few hundred source IPs for the
 * login) could lock every account out, including the admins.
 */
export function createFailureCounter(limit: number, windowMs: number, maxKeys = 10_000) {
  const map = new Map<string, { count: number; resetAt: number }>();

  function makeRoom(now: number) {
    if (map.size < maxKeys) return;
    for (const [k, v] of map) {
      if (now > v.resetAt) map.delete(k);
    }
    if (map.size < maxKeys) return;
    // Map keeps insertion order: the first key is the oldest entry
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }

  return {
    isBlocked(key: string): boolean {
      const now = Date.now();
      const entry = map.get(key);
      if (entry && now <= entry.resetAt) return entry.count >= limit;
      if (entry) map.delete(key);
      return false;
    },
    recordFailure(key: string): void {
      const now = Date.now();
      const entry = map.get(key);
      if (entry && now <= entry.resetAt) {
        entry.count++;
        return;
      }
      if (entry) map.delete(key);
      makeRoom(now);
      map.set(key, { count: 1, resetAt: now + windowMs });
    },
    reset(key: string): void {
      map.delete(key);
    },
  };
}
