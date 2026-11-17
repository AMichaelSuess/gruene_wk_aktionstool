# Security Assessment — 2026-11-18

- **Assessed commit:** `12fbad883a6322e4bcf08c27b7982e5478033a86` on branch `main`
- **Step 0 numbers:** 26 route files with 39 handlers · 12 handlers intentionally unauthenticated, 0 unintentionally unguarded · 3 cron endpoints (Bearer `CRON_SECRET`, triggered by Coolify Scheduled Tasks) · 2 outbound integrations from the server (Nominatim `fetch`, SMTP via nodemailer) · 1 middleware (`src/proxy.ts`, page redirects only)
- **Test suite at this commit:** 31 files, 320 tests, all passing (`npx vitest run`)

## Scope Note

This assessment applies the generic security-assessment method (drift check, severity rubric, false-positive gate, F-n findings with fix specifications) to this Next.js 16 / Prisma / NextAuth v5 codebase. The checklist was adapted to the actual attack surface; there is no stack-specific checklist in the repository, so no "skill drift" section applies. Section structure:

1. Authorization & team isolation · 2. Secrets & configuration · 3. Authentication & sessions · 4. Input validation & request limits · 5. Database · 6. API security (rate limits, headers, errors) · 7. External services · 8. Personal data (DSGVO) · 9. Logging & audit · 10. Cron jobs · 11. Frontend & embedding · 12. Dependencies · 13. Security regression tests · 14. Deployment

## Security Posture Verdict

**Good — no CRITICAL or HIGH findings; one MEDIUM availability gap remains.**
Authorization is enforced consistently at the API layer, team isolation goes through two shared helpers (`expertAktionWhere`, `hasAktionAccess`) on every list, export and single-Aktion path, and secrets, cancel tokens and contact details no longer leave the server where they shouldn't. The main remaining risk is availability: two public endpoints accept request bodies of any size. Everything else is low-effort hardening and logging.

## Category Status Matrix

| # | Category | Status | CRIT | HIGH | MED | LOW | INFO |
|---|----------|--------|------|------|-----|-----|------|
| 1 | Authorization & team isolation | ✅ Good | 0 | 0 | 0 | 0 | 1 |
| 2 | Secrets & configuration | ✅ Good | 0 | 0 | 0 | 0 | 0 |
| 3 | Authentication & sessions | ✅ Good | 0 | 0 | 0 | 1 | 2 |
| 4 | Input validation & request limits | ⚠️ Needs Improvement | 0 | 0 | 1 | 2 | 0 |
| 5 | Database | ✅ Good | 0 | 0 | 0 | 0 | 0 |
| 6 | API security | ✅ Good | 0 | 0 | 0 | 2 | 1 |
| 7 | External services | ✅ Good | 0 | 0 | 0 | 0 | 0 |
| 8 | Personal data (DSGVO) | ⚠️ Needs Improvement | 0 | 0 | 0 | 1 | 0 |
| 9 | Logging & audit | ⚠️ Needs Improvement | 0 | 0 | 0 | 1 | 0 |
| 10 | Cron jobs | ✅ Good | 0 | 0 | 0 | 0 | 0 |
| 11 | Frontend & embedding | ✅ Good (CSP counted in 6) | 0 | 0 | 0 | 0 | 0 |
| 12 | Dependencies | ✅ Good | 0 | 0 | 0 | 0 | 1 |
| 13 | Security regression tests | ✅ Good | 0 | 0 | 0 | 0 | 0 |
| 14 | Deployment | ✅ Good | 0 | 0 | 0 | 0 | 0 |
| | **Total** | | **0** | **0** | **1** | **7** | **5** |

---

## 1. Authorization & Team Isolation

Every authenticated handler calls `auth()` and returns 401 without a session; every `/api/admin/*` handler checks `role === "ADMIN"`. Single-Aktion reads and writes (`GET/PUT/DELETE /api/aktionen/[id]`, `GET/DELETE /api/aktionen/[id]/anmeldungen`) load the Aktion and call `hasAktionAccess()` before touching data; list and export paths (`/api/aktionen`, `/api/export`, `/api/export-aktionen`, `/api/aktionen/bulk-kategorie`) scope EXPERT queries with `expertAktionWhere()`. The registration delete is scoped to the checked Aktion (`deleteMany({ where: { id, aktionId } })`). `expertAktionWhere()` handles an expert without teams correctly (falls back to `createdById` only, no empty `in: []`). No IDOR was found.

### F-1 [INFO] Contact-person address decides who receives volunteer data

- **Location:** `src/app/api/cron/daily-summary/route.ts:79-121`, `src/app/api/aktionen/[id]/route.ts:150-180`
- **Current state:** The daily summary mails names, email addresses, phone numbers and Signal names of registrants to `aktion.ansprechpersonEmail`. Any expert with access to an Aktion (including members of a co-assigned team) can set that field to any address.
- **Fix:** None required. Such an expert can already read and export the same registrations, so this adds no new access. Note it as part of the trust model: an expert account is trusted with registrant data of every Aktion it can access.

## 2. Secrets & Configuration

`src/lib/config-check.ts` + `src/instrumentation-node.ts` stop a production start without `DATABASE_URL`, a valid `NEXTAUTH_URL`, a ≥32-character `NEXTAUTH_SECRET`/`AUTH_SECRET` and a ≥32-character `CRON_SECRET`. No secret has a hard-coded fallback. `.env` is git- and docker-ignored; only `.env.example` is tracked. The Dockerfile declares only non-secret build `ARG`s; secrets are runtime-only (documented in `docs/deployment/coolify-deployment.md` §5.1). `prisma/bootstrap.ts` requires a ≥12-character admin password and logs only the email. No findings.

## 3. Authentication & Sessions

Credentials login (`src/lib/credentials.ts`): bcrypt cost 12, dummy-hash comparison for unknown/inactive accounts (equal timing), identical `null` for every failure, 5 failures per email and 20 per IP within 15 minutes. JWT sessions (24 h) re-read `active`, `role` and team memberships from the database every 5 minutes and end the session for deactivated or deleted users (`src/lib/auth.ts:32-46`). Passwords: 12–72 bytes (`src/lib/validators.ts:13-18`).

### F-2 [LOW] Failure counters allow targeted and global login lockout

- **Location:** `src/lib/credentials.ts:7-8,40-42`, `src/lib/rate-limit.ts:67-101`
- **Current state:** Five wrong passwords for an email block that account for 15 minutes, regardless of who sent them. When the counter map holds 10 000 live keys, `isBlocked()` returns `true` for every new key ("fail closed under flood").
- **Fix:** Accept the per-account lockout as the price of brute-force protection (an attacker who knows an admin's address can keep that admin locked out, but cannot get in). For the flood case, prefer evicting the oldest entry over blocking everyone: filling 10 000 email keys takes ~500 source IPs (20 failures each), after which nobody can log in for up to 15 minutes. Changing `isBlocked` to return `false` for unknown keys when full, and having `recordFailure` evict the oldest entry, keeps memory bounded without a global lockout.

### F-3 [INFO] Logout does not revoke the JWT

- **Location:** `src/lib/auth.ts:17-20`
- **Current state:** Stateless JWT, `maxAge` 24 h. A stolen session cookie stays valid until expiry; deactivation takes effect within 5 minutes.
- **Fix:** None required at this scale; the 5-minute re-check covers the relevant case (removing a person's access).

### F-4 [INFO] Login email lookup is case-sensitive

- **Location:** `src/lib/credentials.ts:44-47`
- **Current state:** Accounts are stored lowercase (`emailSchema`), but `findUnique({ where: { email } })` uses the input as typed, so `Admin@…` fails. The rate-limit key is lowercased, so this is not a bypass.
- **Fix:** Use `emailKey` for the lookup: `where: { email: emailKey }`.

## 4. Input Validation & Request Limits

Every write path parses its body with a Zod schema; public free text is length-capped and control characters are rejected. The signup body is capped at 32 KB while streaming (`src/lib/request-body.ts`), and Excel uploads are capped at 5 MB / 100 MB unpacked / 2 000 rows.

### F-5 [MEDIUM] Public unsubscribe endpoints buffer request bodies of any size, without rate limiting

- **Location:** `src/app/api/anmeldungen/abmelden/route.ts:27-29` (`POST`), `src/app/api/anmeldungen/abmelden/info/route.ts:10-12` (`POST`). Pattern to reuse: `src/lib/request-body.ts`, `src/app/api/anmeldungen/route.ts:12-14,42,146-148`. Test to extend: `src/__tests__/security/cancel-token.test.ts`.
- **Current state:** Both handlers call `await req.json()` with no size limit and no rate limiter:
  ```ts
  const parsed = tokenSchema.safeParse(await req.json());
  ```
  Verified on the local dev server: a 60 MB JSON body sent to each endpoint was fully buffered and parsed, then rejected with `400 Ungültiger Abmelde-Link` (0.4–1.0 s per request). The same body to `POST /api/anmeldungen` is refused with `413`. The middleware body limit (`proxyClientMaxBodySize`) does not apply because the `proxy.ts` matcher covers only `/dashboard` and `/admin`.
- **Attack path:** An unauthenticated client sends several concurrent POST requests with bodies of hundreds of megabytes to `/api/anmeldungen/abmelden/info`. Each request is held in memory twice (raw bytes plus the parsed string).
- **Impact:** Memory exhaustion of the single app container: the public signup page, the dashboard and the cron jobs become unavailable until Coolify restarts the container. No data is read or changed.
- **Fix:** In both handlers, replace `await req.json()` with `readJsonLimited(req, 1024)` (a token is 64 hex characters) and add a per-IP limiter:
  ```ts
  import { clientIp, createRateLimiter } from "@/lib/rate-limit";
  import { BodyTooLargeError, readJsonLimited } from "@/lib/request-body";

  const isRateLimited = createRateLimiter(20, 60 * 1000);
  const MAX_BODY_BYTES = 1024;

  export async function POST(req: NextRequest) {
    if (isRateLimited(clientIp(req))) {
      return NextResponse.json({ error: "Zu viele Anfragen. Bitte versuche es später erneut." }, { status: 429 });
    }
    try {
      const parsed = tokenSchema.safeParse(await readJsonLimited(req, MAX_BODY_BYTES));
      // … unchanged …
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return NextResponse.json({ error: "Anfrage zu groß" }, { status: 413 });
      }
      if (error instanceof SyntaxError) {
        return NextResponse.json({ error: "Ungültiger Abmelde-Link" }, { status: 400 });
      }
      return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
    }
  }
  ```
  Apply the same to `abmelden/info/route.ts`. Each module gets its own limiter instance.
- **Why this fix works:** `readJsonLimited` checks `Content-Length` up front and counts bytes while streaming, so a chunked body without a length header is also cut off after 1 KB instead of being buffered.
- **Constraints:** Keep the JSON error messages German; keep the confirmation page (`src/app/(public)/abmeldung/bestaetigen/page.tsx`) treating 400/404 as "invalid link". A 429 should show the existing generic error state.
- **Verification:** Repeat `curl -X POST -H 'Content-Type: application/json' --data-binary @big.json http://localhost:3200/api/anmeldungen/abmelden/info` with a 60 MB file → expect `413` immediately. Add tests to `cancel-token.test.ts`: a body > 1 KB returns 413, and the 21st request from one IP within a minute returns 429.
- **Scope guard:** Do not change the GET redirect (it must stay side-effect-free for mail link scanners). Do not lower the token length check below what a 64-character token needs.
- **Related, [UNVERIFIED]:** The NextAuth credentials callback (`POST /api/auth/callback/credentials`) also took 1.25 s for a 60 MB form body before answering 302, which suggests the body is parsed in full. It belongs to the library; to confirm, watch the process RSS while sending large bodies. If confirmed, the practical fix is a request-body limit at the reverse proxy (Traefik `buffering` middleware with `maxRequestBodyBytes` ≈ 6 MB, enough for the 5 MB Excel upload) in Coolify, which caps every route at once.

### F-6 [LOW] Authenticated JSON routes have no body or array limits

- **Location:** `src/app/api/aktionen/route.ts:146`, `src/app/api/aktionen/[id]/route.ts:103`, `src/app/api/aktionen/bulk-kategorie/route.ts:22`, `src/app/api/admin/*/route.ts` (`req.json()`); `src/lib/validators.ts:34,44,69,147` (`teamIds`, `ids` arrays unbounded)
- **Current state:** Logged-in users can post bodies and arrays of any size; `bulkKategorieSchema.ids` and the `teamIds` arrays have no `.max()`.
- **Fix:** Add `.max(500)` to `bulkKategorieSchema.ids` and `.max(50)` to every `teamIds` array; the reverse-proxy body limit from F-5 covers the body size.

### F-7 [LOW] Participant limit can be exceeded by concurrent signups

- **Location:** `src/app/api/anmeldungen/route.ts:63-94`
- **Current state:** `_count.anmeldungen >= maxTeilnehmer` is checked, then the registration is inserted in a separate statement. Parallel signups for the last place all pass the check.
- **Fix:** Run count and insert in one `prisma.$transaction(..., { isolationLevel: "Serializable" })` and retry once on a serialization error, or accept the overbooking (the contact person sees all registrations).

## 5. Database

Prisma only; the single raw query is the tagged-template `SELECT 1` in `src/app/api/health/route.ts:9`. All dynamic filters come from allow-lists (`KATEGORIE_VALUES`, integer-parsed Wahlkreis numbers, ISO-date regex); `orderBy` is never user-controlled. Timestamps are `timestamptz` (migration `20261117224746_timestamptz`). Passwords are stripped from every user response (`password: _`). Deleting an Aktion cascades registrations; email logs are set null and purged after 7 days. No findings.

## 6. API Security

Rate limits: public list 60/min, public detail 30/min, signup 10/min, "Meine Aktionen" 5/min per IP plus 2/15 min per email. Error responses are generic (`Serverfehler`) and never include stack traces or Prisma messages. Cron auth uses a constant-time hash comparison and fails closed.

### F-8 [LOW] Image sources in the CSP are broader than needed

- **Location:** `next.config.ts:8-11` (`img-src 'self' data: https:`)
- **Current state:** Images may load from any HTTPS host. The inline-script allowance in the same policy (`script-src 'self' 'unsafe-inline'`) is a recorded decision (D-04, enforced by `src/__tests__/security/csp-header.test.ts:97`) and is reviewed under *Previously Accepted Decisions*, not raised again here. No XSS sink was found (no `dangerouslySetInnerHTML`, `innerHTML` or `eval`; every `href` built from data uses config values or IDs).
- **Fix:** Narrow to `img-src 'self' data: https://*.tile.openstreetmap.org` plus any image host a theme actually uses (check `src/lib/theme.ts` and `CampaignHero`), in both the dev and production branches of `cspBase`. Verify the map and hero in both themes.

### F-9 [LOW] `X-Powered-By: Next.js` header is sent

- **Location:** `next.config.ts:31`
- **Current state:** Every response carries `X-Powered-By: Next.js` (seen on the dev server; it is a Next.js default in production too).
- **Fix:** Add `poweredByHeader: false` to `nextConfig`.

### F-10 [INFO] Public detail endpoint also returns cancelled and past Aktionen

- **Location:** `src/app/api/aktionen/[id]/route.ts:41-74`
- **Current state:** The public list hides cancelled, past and already-started Aktionen, but `GET /api/aktionen/<id>` returns any Aktion by ID (without contact data, but with team names and the registration count). IDs are cuids and not enumerable.
- **Fix:** None required. Optional: return 404 to anonymous callers for `ABGESAGT` Aktionen.

## 7. External Services

Nominatim: fixed base URL, query encoded with `URLSearchParams`, 5 s timeout, 1 request/s queue, identifying User-Agent; failures return `null`. SMTP: `requireTLS` unless implicit TLS, TLS ≥ 1.2; failures are caught and logged to `EmailLog`. No SSRF surface: no user-supplied URL is ever fetched server-side. No findings.

## 8. Personal Data (DSGVO)

Registrations are deleted 72 h after the Aktion ends (statistics kept as counts only); email logs after 7 days. Cancel tokens (256 bit) never leave the server except in mails to the registrant. The signup response is identical for new and existing registrations. Exports are restricted by team and audited.

### F-11 [LOW] Volunteer email address travels in URLs

- **Location:** `src/lib/email-templates.ts:163` (link `…/meine-aktionen-bestaetigen?email=…`), `src/app/(public)/meine-aktionen-bestaetigen/page.tsx:17-19`, `src/app/api/anmeldungen/meine-aktionen/route.ts:14-22` (`GET ?email=`)
- **Current state:** The address is in the page URL and in the API query string, so it lands in browser history, and in reverse-proxy access logs if Traefik access logging is enabled.
- **Fix:** Change the API to `POST` with `{ email }` in the body (bounded with `readJsonLimited`), keeping both rate limiters. The page URL can keep the parameter (it comes from the person's own mailbox), or the link can carry a short-lived signed token instead.

## 9. Logging & Audit

`audit()` writes JSON lines (IDs and counts only) for exports, registration deletes, user create/update/delete and hard deletes of Aktionen.

### F-12 [LOW] Failed logins, lockouts, access denials and server errors are not logged

- **Location:** `src/lib/credentials.ts:52-56`, the `403 Kein Zugriff` branches in `src/app/api/aktionen/**`, all `catch { return … "Serverfehler" }` blocks (e.g. `src/app/api/aktionen/route.ts:193-199`, `src/app/api/upload/route.ts:215-217`), `src/app/api/upload/route.ts:139-211` (imports not audited)
- **Current state:** A password-guessing run, an expert probing other teams' Aktionen, or a recurring 500 leaves no trace in the container log. Bulk imports are not audited either.
- **Fix:** Extend `AuditEvent` with `LOGIN_FEHLGESCHLAGEN` (log the IP and a hash of the email address, not the address itself), `LOGIN_GESPERRT`, `ZUGRIFF_VERWEIGERT` (actor, aktionId) and `AKTIONEN_IMPORTIERT` (count, teamIds). In catch blocks, add `console.error("<route>:", error instanceof Error ? error.message : error)` before returning 500. Never log request bodies.

## 10. Cron Jobs

All three endpoints require the bearer secret (constant-time comparison, fail closed). The mail jobs have an in-process run guard plus a 12-hour per-recipient de-duplication via `EmailLog`, so retries do not double-send. Cleanup runs per Aktion in a transaction and isolates failures per Aktion. Both guards assume a single container, which matches the deployment. No findings.

## 11. Frontend & Embedding

No `dangerouslySetInnerHTML`, `innerHTML` or `eval`. All framing is denied except `/embed/*`, which allows `'self'` plus `ALLOWED_EMBED_DOMAIN` only. The embed page's `postMessage` sends only its height (target `*` is harmless for that payload). The unsubscribe link opens a confirmation page and only a click unsubscribes (safe against mail link scanners). CSP: see F-8 and decision D-04. No further findings.

## 12. Dependencies

### F-13 [INFO] `npm audit`: 0 production vulnerabilities, 16 high in dev tooling

- **Location:** `package.json` devDependencies (`eslint-config-next`, `vitest`)
- **Current state:** `npm audit --omit=dev` → 0. The full audit reports 16 high findings that all trace back to `picomatch` ≤ 4.0.7 (ReDoS through extglobs) via ESLint, Vite and Vitest. These packages only run in development and in the Docker build stage on repository-controlled glob patterns; they are not in the runtime image (`npm ci --omit=dev`). Dependabot (npm + docker, weekly) is configured and the base image is pinned by digest.
- **Fix:** Take the Dependabot update when `vitest`/`eslint-config-next` pull a fixed `picomatch`; no manual action needed.

## 13. Security Regression Tests

26 security test files cover auth protection on every protected route, admin-only routes, team isolation (list, detail, export, bulk, registrations), JWT invalidation, login brute force and timing, cancel-token handling, signup enumeration, rate limiting, CSP and HSTS headers, email escaping, SMTP TLS, upload limits, cron auth and cron double-send. They gate the Docker build. The only gap relevant to this report is F-5: no test that the unsubscribe endpoints reject oversized bodies. That test is part of F-5's fix. No separate finding.

## 14. Deployment

Multi-stage build, runtime as `node` (non-root), base image pinned by digest, `.env`/`.git`/`docs` excluded from the build context, migrations run before `next start` and abort startup on failure, HSTS set, database published on `127.0.0.1` only (SSH tunnel), daily S3 backups. `clientIp()` takes the last `X-Forwarded-For` entry, which is correct only while port 3000 is reachable solely through Traefik (Coolify "Ports Exposes", no host port mapping). The deployment guide documents exactly that setup. No findings.

---

## Previously Accepted Decisions (ADR Review)

The repository has no ADR directory; settled decisions are recorded in `CLAUDE.md` and in code comments.

| Decision | Where | Verdict |
|----------|-------|---------|
| **No double opt-in:** signups count immediately; accepted risk that third parties can register someone else's address, mitigated by rate limiting, honeypot and a uniform response | `CLAUDE.md` → Constraints | **Valid.** All three mitigations are in place: 10 signups/min per IP (`src/app/api/anmeldungen/route.ts:12`), honeypot (`:45-48`), and existing registrations answered like new ones, with existing cancel links sent only to the mailbox owner (`:96-139`). Revisit if abuse reports come in or a signup ever triggers mail to someone other than the entered address. |
| **In-memory rate limiting and run guards for a single container** | `src/lib/rate-limit.ts:1-6`, `src/lib/cron-guard.ts:4-9` | **Valid.** Production runs one container (`docs/deployment/coolify-deployment.md`). Revisit as soon as a second replica or a zero-downtime rolling deploy with overlapping containers is configured: limits then multiply and the cron run guard no longer prevents double sends (the `EmailLog` 12 h check still does, though not atomically). |
| **Client IP = last `X-Forwarded-For` entry (exactly one trusted proxy)** | `src/lib/rate-limit.ts:8-26` | **Valid** for Traefik-only access. Revisit if a CDN or second proxy is put in front, or a host port mapping for 3000 is added. |
| **D-04: no CSP nonces; production keeps `script-src 'self' 'unsafe-inline'`** | `src/__tests__/security/csp-header.test.ts:97-104` (the decision record itself is not in the repository) | **Valid, with one caveat.** Its premise still holds: there is no XSS sink in the codebase, and React escapes all rendered data. Revisit when (a) any `dangerouslySetInnerHTML`, `innerHTML`, user-controlled `href`/`src` or Markdown/HTML rendering of stored data is introduced, or (b) a nonce policy via `src/proxy.ts` becomes affordable (it forces dynamic rendering of every page). Until then, a single XSS bug on the dashboard would have the full export rights of the logged-in expert. Caveat: the rationale lives only in a test name. Record it in `CLAUDE.md` next to the double-opt-in decision so that a future reader finds the trade-off. |
| **Stateless JWT with 5-minute re-check instead of server-side sessions** | `src/lib/auth.ts:17-46` | **Valid** (see F-3). |
| **Container time zone stays UTC** | `Dockerfile:56-57` | **Valid**; date logic that depends on local time uses `Europe/Berlin` explicitly (`src/lib/aktion-zeit.ts`, `send-erinnerungen`). |

## Prioritized Action List

| Priority | Finding | Effort |
|----------|---------|--------|
| **P1** | F-5: size limit and rate limit on the unsubscribe endpoints (+ proxy body limit if the login part is confirmed) | S |
| **P2** | F-12: log failed logins, denials, server errors, imports | S |
| **P2** | Record decision D-04 (CSP without nonces) in `CLAUDE.md` | S |
| **P3** | F-8: narrow `img-src` | S |
| **P3** | F-2: no global lockout when the failure map is full | S |
| **P3** | F-6: array limits on `ids`/`teamIds` | S |
| **P3** | F-11: "Meine Aktionen" request via POST | S |
| **P3** | F-9: `poweredByHeader: false` | S |
| **P3** | F-7: transactional capacity check (or accept) | S |
| **P3** | F-4: lowercase email lookup at login | S |

## Positive Findings

Keep these intact; they are deliberate strengths:

- **Two central authorization helpers** (`expertAktionWhere`, `hasAktionAccess`, plus `keepsOwnTeam` / `removesForeignTeam`) used on every Aktion path. New routes must reuse them instead of hand-written `where` clauses.
- **Public response shaping:** contact email/phone and `createdById` are stripped for anonymous callers *and* for experts without access; registration lists use an explicit `select` that never includes `cancelToken`.
- **Fail-fast configuration check** at startup and **fail-closed cron auth** with constant-time comparison.
- **Login hardening:** dummy-hash timing equalisation, per-email and per-IP failure counters, identical failure result.
- **Bounded memory in the rate limiters** and a streaming body limit for the signup endpoint (`readJsonLimited`).
- **Unsubscribe requires a click** (GET only redirects), protecting volunteers from mail scanners.
- **Consistent HTML escaping** in every email template, covered by `email-escaping.test.ts`.
- **Short retention:** registrations 72 h after the Aktion, email logs 7 days; statistics keep counts only.
- **Excel upload limits** (size, unpacked size against zip bombs, row count) and geocoding throttling.
- **Audit log** for exports and account changes without personal data in the log line.
- **Security tests gate every deployment** (320 tests in the Docker build).

## Executive Summary

The security posture is **good**: no CRITICAL or HIGH finding, and authorization and team isolation are consistent and covered by tests. The most important remaining risk is **availability**. Two public unsubscribe endpoints read request bodies of any size without a rate limit, so an anonymous client can exhaust the single container's memory (F-5, verified locally with 60 MB bodies). The production CSP still allows inline scripts. That is a recorded decision (D-04) whose premise, no XSS sink anywhere, still holds, but it should be written down where people will find it. The remaining findings are low-effort hardening and better logging of failed logins and denied access.

## Statistics

- Route files: 26 · Handlers: 39 · Intentionally public: 12 · Cron (secret-protected): 3 · Unintentionally unguarded: 0
- Outbound server calls: 2 (Nominatim, SMTP)
- Findings: CRITICAL 0 · HIGH 0 · MEDIUM 1 · LOW 7 · INFO 5

## Top Fixes (P1)

1. **F-5** — `readJsonLimited` + per-IP rate limit on `POST /api/anmeldungen/abmelden` and `POST /api/anmeldungen/abmelden/info`; consider a Traefik body limit for all routes.

---

## Appendix: Attack-Surface Inventory

| Route | Methods | Guard |
|-------|---------|-------|
| `/api/aktionen` | GET | public (rate-limited 60/min); session → team-scoped, contact data only with session |
| `/api/aktionen` | POST | session |
| `/api/aktionen/[id]` | GET | public (30/min); contact data only with `hasAktionAccess` |
| `/api/aktionen/[id]` | PUT, DELETE | session + `hasAktionAccess` (+ team-change rules on PUT) |
| `/api/aktionen/[id]/anmeldungen` | GET, DELETE | session + `hasAktionAccess`; delete scoped to Aktion |
| `/api/aktionen/bulk-kategorie` | PATCH | session; EXPERT scoped by `expertAktionWhere` |
| `/api/anmeldungen` | POST | public (10/min, 32 KB, honeypot) |
| `/api/anmeldungen/abmelden` | GET | public (redirect only) |
| `/api/anmeldungen/abmelden` | POST | public, cancel token (**no rate limit, no body limit — F-5**) |
| `/api/anmeldungen/abmelden/info` | POST | public, cancel token (**no rate limit, no body limit — F-5**) |
| `/api/anmeldungen/meine-aktionen` | GET | public (5/min per IP, 2/15 min per email) |
| `/api/export` | GET | session; EXPERT scoped; audited |
| `/api/export-aktionen` | GET | session; EXPERT scoped; audited |
| `/api/upload` | POST | session; 5 MB / 100 MB unpacked / 2 000 rows |
| `/api/teams` | GET | session |
| `/api/user/teams` | GET | session (own teams) |
| `/api/wahlkreise` | GET | public |
| `/api/vorlage` | GET | public |
| `/api/health` | GET | public (`{status}` only) |
| `/api/admin/users` | GET, POST, PUT, DELETE | ADMIN; changes audited |
| `/api/admin/teams` | GET, POST, PUT, DELETE | ADMIN |
| `/api/admin/wahlkreise` | GET, PUT | ADMIN |
| `/api/admin/aktionen/[id]` | DELETE | ADMIN; audited |
| `/api/admin/stats` | GET | ADMIN |
| `/api/admin/export-stats` | GET | ADMIN; audited |
| `/api/auth/[...nextauth]` | GET, POST | NextAuth (credentials, failure counters) |
| `/api/cron/daily-summary` | POST | Bearer `CRON_SECRET`, run guard, 12 h de-dup |
| `/api/cron/send-erinnerungen` | POST | Bearer `CRON_SECRET`, run guard, 12 h de-dup |
| `/api/cron/cleanup-anmeldungen` | POST | Bearer `CRON_SECRET` |
| `/dashboard/*`, `/admin/*` (pages) | — | `src/proxy.ts` redirect (session / ADMIN); data access enforced by the APIs above |

**Outbound calls:** `src/lib/geocoding.ts:59` (Nominatim, fixed URL, 5 s timeout, 1 req/s) · `src/lib/email.ts:36` (SMTP, TLS required). Browser-side: OpenStreetMap tiles.

**Environment variables read:** secrets `NEXTAUTH_SECRET`/`AUTH_SECRET`, `CRON_SECRET`, `SMTP_PASSWORD`, `DATABASE_URL`, `BOOTSTRAP_ADMIN_PASSWORD` (bootstrap only); everything else is non-secret configuration (organisation, DSB, Aufsicht, hosting, theme, map, `NEXTAUTH_URL`, `ALLOWED_EMBED_DOMAIN`).

---

## Changes Since Last Assessment

Compared with `security-assessment-2026-11-17.md` (baseline at commit `7e793bb`, 30 findings). Prior IDs are prefixed `2026-11-17/`. Each status was checked against the code at `12fbad8`.

### (a) Resolved

| Prior finding | Evidence now |
|---------------|--------------|
| 2026-11-17/F-1 [HIGH] registration delete not scoped to the Aktion | `deleteMany({ where: { id: anmeldungId, aktionId: id } })` in `src/app/api/aktionen/[id]/anmeldungen/route.ts:82` |
| 2026-11-17/F-2 [HIGH] role/teams in JWT never refreshed | 5-minute re-read of `active`, `role`, teams in `src/lib/auth.ts:32-46`; `jwt-invalidation.test.ts` |
| 2026-11-17/F-3 [HIGH] public list exposes contact email/phone | stripped in `src/app/api/aktionen/route.ts:126-133` and `[id]/route.ts:64-72`; `data-sanitization.test.ts:181,209` now assert absence |
| 2026-11-17/F-4 [LOW] experts read other teams' contact data / remove co-teams | public shape without `hasAktionAccess`; `removesForeignTeam()` |
| 2026-11-17/F-5 [LOW] no fail-fast configuration check | `src/lib/config-check.ts`, `src/instrumentation-node.ts` |
| 2026-11-17/F-6 [MEDIUM] no brute-force protection, timing leak | failure counters + dummy hash in `src/lib/credentials.ts` (side effect: new F-2) |
| 2026-11-17/F-7 [LOW] weak password policy | 12–72 bytes, `src/lib/validators.ts:13-18` |
| 2026-11-17/F-9 [LOW] timestamps without time zone | migration `20261117224746_timestamptz` |
| 2026-11-17/F-10 [MEDIUM] signup accepts unbounded bodies/arrays/strings | `readJsonLimited` 32 KB, `aktionIds` ≤ 100, name caps (see (c) for the same pattern on new endpoints) |
| 2026-11-17/F-11 [MEDIUM] Excel upload limits | 5 MB / 100 MB unpacked / 2 000 rows, `src/app/api/upload/route.ts:10-57` |
| 2026-11-17/F-12 [LOW] smaller validation gaps | control characters rejected in names; Zod on team PUT; invalid `wahlkreis`/`datum` ignored |
| 2026-11-17/F-13 [MEDIUM] rate-limit key client-controlled, maps unbounded | last `X-Forwarded-For` entry, `maxKeys` bound in `src/lib/rate-limit.ts` (side effect: new F-2) |
| 2026-11-17/F-14 [MEDIUM] one-click unsubscribe via GET | GET only redirects to a confirmation page; POST unsubscribes |
| 2026-11-17/F-15 [LOW] CSP inline scripts; no HSTS | HSTS added (`next.config.ts:26-28`). Inline scripts remain by decision D-04 (see ADR review) |
| 2026-11-17/F-16 [MEDIUM] SMTP without required TLS | `requireTLS` + TLS ≥ 1.2, `src/lib/email.ts:8-21` |
| 2026-11-17/F-17 [LOW] Nominatim without timeout/throttle | 5 s timeout, 1 req/s queue |
| 2026-11-17/F-18 [HIGH] signup reveals existing registrations | uniform response, `anmeldung-enumeration.test.ts` |
| 2026-11-17/F-19 [MEDIUM] `EmailLog` kept forever | deleted after 7 days by `cleanup-anmeldungen` |
| 2026-11-17/F-20 [MEDIUM] late registrations never deleted | started Aktionen refuse signups; sweep includes already-cleaned Aktionen |
| 2026-11-17/F-22 [LOW] registration list returns cancel tokens | explicit `select` without `cancelToken` |
| 2026-11-17/F-23 [MEDIUM] no audit trail | `src/lib/audit.ts` for exports, user changes, deletes (remaining gaps: new F-12) |
| 2026-11-17/F-24 [MEDIUM] cron auth fails open | `src/lib/cron-auth.ts` fails closed, constant-time |
| 2026-11-17/F-25 [LOW] mail cron not idempotent | run guard + 12 h de-duplication, `src/lib/cron-guard.ts` |
| 2026-11-17/F-27 [HIGH] outdated Next.js/Auth.js/nodemailer/zod | Next 16.4.6, next-auth beta.32, nodemailer 10, zod 4.6.7; `npm audit --omit=dev` = 0 |
| 2026-11-17/F-28 [LOW] no alerting, unused deps, floating base image | Dependabot (npm + docker), image pinned by digest, unused deps removed |
| 2026-11-17/F-29 [MEDIUM] key controls without regression tests | 26 security test files / 320 tests; the leak-accepting assertion was inverted |
| 2026-11-17/F-30 [LOW] legacy guide tells operators to seed production | `docs/DEPLOYMENT.md:3,296` now warn against seeding; bootstrap via `npm run db:bootstrap` |

### (b) Still open

| Prior finding | Status |
|---------------|--------|
| 2026-11-17/F-8 [INFO] cancel tokens stored in plaintext | Unchanged; still no action needed (256-bit tokens, they only allow unsubscribing). |
| 2026-11-17/F-21 [MEDIUM] no double opt-in | Accepted decision (`CLAUDE.md` → Constraints); mitigations verified, see ADR review. |
| 2026-11-17/F-26 [INFO] no XSS sinks | Still true; this is the premise of decision D-04. |

### (c) Regressions

No control was removed or weakened. One **new gap was introduced by a fix**, though. The fix for 2026-11-17/F-14 (commit `a4d00c4`) added two public POST endpoints (`/api/anmeldungen/abmelden`, `/api/anmeldungen/abmelden/info`) that read JSON with a plain `req.json()`. That happened two commits after the fix for 2026-11-17/F-10 (`c38be9f`) had introduced `readJsonLimited` for exactly this reason. The result is new F-5. The body-limit control lived in one route, not in a rule, so the next public route did not inherit it.

**Guard to prevent recurrence:** add a test (`src/__tests__/security/public-body-limits.test.ts`) that lists every route module under `src/app/api/` whose `POST`/`PUT`/`PATCH` handler can be reached without a session (today: `anmeldungen`, `anmeldungen/abmelden`, `anmeldungen/abmelden/info`). For each, it sends a body larger than the route's limit and expects `413`. Alternatively or additionally, add an ESLint `no-restricted-syntax` rule that forbids `req.json()` / `request.json()` in `src/app/api/**` (allowing `readJsonLimited`). Either one would have failed on `a4d00c4`.
