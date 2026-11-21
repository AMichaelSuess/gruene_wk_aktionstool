# Security Assessment — 2026-11-21

- **Assessed commit**: `ed0f800c02374568f0794b4db8180997cb64b194` (branch `main`)
- **Attack surface (Step 0)**: 28 route files with 42 handlers · 12 handlers intentionally public · 0 unintentionally unguarded handlers · 3 cron endpoints (bearer token) · 2 outbound integrations (Nominatim `fetch`, SMTP via nodemailer)
- **Test suite**: 37 files, 374 tests, all passing (`npx vitest run`)

## Skill Drift

The checklist set was written for a NestJS/TypeORM application. It was applied to this Next.js 16 / Prisma / NextAuth v5 codebase by mapping its concepts onto this stack:

| Checklist concept | Here |
|---|---|
| Guards / `@Roles()` | `auth()` + role check at the top of every route handler; `src/proxy.ts` redirects pages only (matcher `/dashboard/*`, `/admin/*`) |
| Account isolation (`verifyVehicleAccess`) | Team isolation: `expertAktionWhere()` and `hasAktionAccess()` in `src/lib/aktion-teams.ts` |
| Refresh token + session table | Stateless NextAuth JWT (24 h, re-signed on every session read) plus a 5-minute DB re-check in the `jwt` callback |
| Encrypted credential column, HKDF | Not present. No secrets are stored in the database apart from bcrypt password hashes. Checklist 04 is not applicable |
| Webfleet queue consumer | Not present. The only inbound untrusted bulk input is the Excel import |
| ADRs | No ADR directory. The binding decisions are in `CLAUDE.md` → *Constraints* ("Kein Double-Opt-in", "CSP ohne Nonces (D-04)") |

Areas that exist here but not in the checklist set, and were audited under the closest section: the expert view of `/admin` and `/admin/users` (07, 01), self-service name and password changes (03), user deletion and anonymisation (09), the Signal text export (06), and the daily summary mail to a free-text contact address (09).

## Security Posture Verdict

**Good. No critical or high findings, three medium ones.** Every handler checks authentication and role itself. Team isolation is applied consistently, including the endpoints added since the last assessment (`/api/user/*`, the expert branch of `/api/admin/users` and `/api/admin/stats`). The medium findings are design gaps: state-changing APIs accept requests from same-site origins without an Origin check, a password change does not end existing sessions, and the signup response time shows whether an address was already registered.

## Category Status Matrix

| # | Section | Status | C | H | M | L | I |
|---|---|---|---|---|---|---|---|
| 01 | Authorization & Team Isolation | ✅ Good | 0 | 0 | 0 | 1 | 1 |
| 02 | Secrets & Credentials | ✅ Good | 0 | 0 | 0 | 0 | 0 |
| 03 | Authentication | ⚠️ Needs Improvement | 0 | 0 | 1 | 1 | 0 |
| 04 | Credential Encryption | n/a | – | – | – | – | – |
| 05 | Database Security | ✅ Good | 0 | 0 | 0 | 0 | 0 |
| 06 | Input Validation | ✅ Good | 0 | 0 | 0 | 1 | 0 |
| 07 | API Security | ⚠️ Needs Improvement | 0 | 0 | 1 | 0 | 1 |
| 08 | External APIs | ✅ Good | 0 | 0 | 0 | 1 | 0 |
| 09 | Sensitive Data | ⚠️ Needs Improvement | 0 | 0 | 1 | 1 | 0 |
| 10 | Logging | ✅ Good | 0 | 0 | 0 | 0 | 1 |
| 11 | Scheduled Jobs | ✅ Good | 0 | 0 | 0 | 0 | 0 |
| 12 | Frontend | ✅ Good | 0 | 0 | 0 | 0 | 0 |
| 13 | Dependencies | ✅ Good | 0 | 0 | 0 | 1 | 0 |
| 14 | Testing | ✅ Good | 0 | 0 | 0 | 0 | 0 |
| 15 | Deployment | ✅ Good | 0 | 0 | 0 | 0 | 0 |

---

## 01 · Authorization & Team Isolation

All 42 handlers were traced. Every non-public handler calls `auth()` and returns 401 without a session. ADMIN-only handlers (`/api/admin/teams`, `/api/admin/wahlkreise`, `/api/admin/export-stats`, writes on `/api/admin/users`, `DELETE /api/admin/aktionen/[id]`) check `role !== "ADMIN"`. Single-Aktion handlers call `hasAktionAccess()` before reading or writing. List and export queries use `expertAktionWhere()`. `DELETE /api/aktionen/[id]/anmeldungen` scopes the delete to `{ id, aktionId }`. `PATCH /api/aktionen/bulk-kategorie` merges the expert filter into `updateMany`. The new expert branches of `GET /api/admin/users` and `GET /api/admin/stats` are restricted to the expert's own `teamIds`, and the membership list only shows teams the two people share.

### F-1 [LOW] An admin can demote or deactivate their own account, including the last admin

- **Location**: `src/app/api/admin/users/route.ts:118-176` (`PUT`)
- **Current state**: `DELETE` refuses `id === session.user.id`, but `PUT` accepts `{ id: <self>, role: "EXPERT" }` or `{ id: <self>, active: false }`. Nothing checks whether another active admin remains.
- **Fix**: In `PUT`, when `validated.id === session.user.id` and the request sets `role: "EXPERT"` or `active: false`, return 400 "Du kannst dir die Admin-Rolle nicht selbst entziehen." Optionally also refuse any change that would leave `prisma.user.count({ where: { role: "ADMIN", active: true } })` at 0. Recovery today needs DB access (`prisma/bootstrap.ts`).

### F-2 [INFO] Experts see the email addresses of all active admins and of their team co-members

- **Location**: `src/app/api/admin/users/route.ts:23-45`
- **Current state**: Deliberate since `906b1c5` (contact persons). The fields are limited to `id, name, email, role, active` and the shared teams. Password hashes and other teams are not included. Recorded here so the posture is explicit. Any later widening, for example to inactive accounts or to all teams, should be treated as a finding.

## 02 · Secrets & Credentials

No findings. `git ls-files` contains no `.env*` apart from `.env.example`. `.dockerignore` excludes `.env` and `.env*.local`, and the runtime stage copies only `.next`, `public`, `dist`, `prisma` and the manifests. No secret is a build `ARG`: only `NEXT_PUBLIC_*`, `ORG_FULL_NAME` and `ALLOWED_EMBED_DOMAIN` are. `checkConfig()` (`src/lib/config-check.ts`) stops a production start when `NEXTAUTH_SECRET`/`AUTH_SECRET` or `CRON_SECRET` is missing or shorter than 32 characters, and `isCronAuthorized()` fails closed in that case too. There are no fallback secrets. The only defaults are non-secret sender names in `src/lib/email.ts:23-24`.

## 03 · Authentication

Login (`src/lib/credentials.ts`) uses bcrypt cost 12 and compares against a dummy hash for unknown or inactive accounts, so timing does not reveal which accounts exist. It returns `null` for every failure class, counts failures per email (5/15 min) and per IP (20/15 min) with a bounded map that evicts entries instead of blocking, and writes the email address only as an HMAC pseudonym in audit lines. Passwords are 12–72 bytes. The `jwt` callback re-reads `active`, `role`, `name` and teams every 5 minutes and on `trigger: "update"`, and ignores the client-supplied `session` argument.

### F-3 [MEDIUM] Changing or resetting a password does not end existing sessions, and sessions have no absolute lifetime

- **Location**: `src/lib/auth.ts:17-51`; `src/app/api/user/passwort/route.ts:54-57`; `src/app/api/admin/users/route.ts:134`; `prisma/schema.prisma:38-51` (`User`)
- **Current state**: The session is a stateless JWT with `maxAge: 24h`. Auth.js re-signs it with a new 24 h expiry on every session read (`@auth/core/lib/actions/session.js`, JWT branch: "Refresh JWT expiry by re-signing it"), and the client's `SessionProvider` reads the session on page load and window focus. The 5-minute check in the `jwt` callback only revokes on `!dbUser || !dbUser.active`:
  ```ts
  if (!dbUser || !dbUser.active) {
    return null; // Session invalidiert — deaktivierter oder gelöschter Nutzer
  }
  ```
  The password routes only update `User.password`.
- **Attack path**: An attacker obtains an expert's session, for example from a shared or unlocked computer at a campaign office or a copied cookie. The victim notices and changes their password, or an admin resets it. The attacker's cookie keeps working. As long as it is used at least once every 24 h it never expires.
- **Impact**: Continued read access to registrants' names, email addresses, phone numbers and Signal handles for the victim's teams (export included), and write access to their Aktionen. Changing the password, the step users are told to take, does not remove the attacker. Only deactivating the account does.
- **Fix**:
  1. Add `sessionVersion Int @default(0)` to `User` in `prisma/schema.prisma` and generate the migration with `npx prisma migrate dev --name session_version`.
  2. In `authorizeCredentials()` return `sessionVersion: user.sessionVersion` and store it in the token in the `jwt` callback (`token.sessionVersion = user.sessionVersion`). Also set `token.loginAt = Date.now()`.
  3. In the periodic check, select `sessionVersion` too and revoke on mismatch or age:
     ```ts
     const MAX_SESSION_AGE = 7 * 24 * 60 * 60 * 1000; // absolute lifetime
     if (
       !dbUser || !dbUser.active ||
       dbUser.sessionVersion !== token.sessionVersion ||
       Date.now() - ((token.loginAt as number) ?? 0) > MAX_SESSION_AGE
     ) {
       return null;
     }
     ```
  4. Increment the version (`sessionVersion: { increment: 1 }`) wherever a password is set: `POST /api/user/passwort`, `PUT /api/admin/users` when `password` is present, and the anonymising branch of `DELETE /api/admin/users`.
  5. On the account page (`src/app/dashboard/konto/page.tsx`), after a successful change, call `signOut({ callbackUrl: "/login" })` and show "Passwort geändert. Bitte melde dich mit dem neuen Passwort an." This also ends the current session, which is simpler and clearer than trying to keep it alive.
- **Why this fix works**: The version in the token is fixed at login. Any password change moves the DB value, so every older token fails the check within at most 5 minutes. `loginAt` is not refreshed by the rolling re-sign, so it caps the total lifetime.
- **Constraints**: The migration must be generated, not hand-written. Existing tokens carry no `sessionVersion`, so `undefined !== 0` logs everyone out once after deploy, which is acceptable. Do not move `token.loginAt` into the `trigger === "update"` path.
- **Verification**: Extend `src/__tests__/security/jwt-invalidation.test.ts`: a token with `sessionVersion: 0` and `lastChecked` older than 5 minutes, against a DB user with `sessionVersion: 1`, must make the `jwt` callback return `null`. The same applies to a token with `loginAt` 8 days ago. Manually: log in in two browsers, change the password in one, wait 5 minutes, and the other must land on `/login`.
- **Scope guard**: Do not shorten the 5-minute DB interval to "fix" this; it exists to limit DB load. Do not switch to the database session strategy, which is a core-dependency change.

### F-4 [LOW] Five wrong passwords lock any known account, admins included, for 15 minutes

- **Location**: `src/lib/credentials.ts:7-9, 41-43`
- **Current state**: `emailFailures` blocks an email after 5 failures in 15 minutes, from any IP. Anyone who knows an admin's address can keep that admin locked out by sending 5 attempts every 15 minutes. This is the usual trade-off of per-account limits. It is an availability issue only.
- **Fix** (optional): Count failures per `(email, ip)` with limit 5 and keep a higher per-email limit (e.g. 50) as the backstop against distributed guessing. Then a single attacker can no longer lock out the real owner from their own IP.

## 04 · Credential Encryption

Not applicable. Nothing is encrypted at the application layer. The only credential at rest is the bcrypt hash in `users.password`, and the cancel tokens are 256-bit random values stored in plaintext. That is acceptable because they only allow deleting one's own registration, and they are deleted 72 h after the Aktion.

## 05 · Database Security

No findings. Raw SQL appears twice, both as tagged templates with bound parameters: `pg_advisory_xact_lock(hashtext(${aktionId}))` in `src/app/api/anmeldungen/route.ts:102` and `SELECT 1` in the health check. No query parameter reaches `orderBy`. Filters from query strings are allow-listed (`KATEGORIE_VALUES`, integer Wahlkreis numbers, ISO-date regex), and invalid values are dropped rather than passed to Prisma. Every `DateTime` column is `@db.Timestamptz(3)` apart from the calendar dates `Aktion.datum` and `AktionStatistik.aktionDatum` (`@db.Date`), which are intentionally dates. Responses that include `User` strip `password` explicitly (`src/app/api/admin/users/route.ts:53, 104, 167`), and the expert branch uses an explicit `select`.

## 06 · Input Validation

All public write endpoints read the body with `readJsonLimited()` (32 KB for signups, 1 KB for token and email endpoints), so chunked bodies are bounded too. Signup names reject control characters, and the Signal text export of registrations collapses whitespace (`einzeilig`). The Excel import checks the 5 MB upload size, the declared unpacked size (100 MB) and 2,000 rows before validating each row against `excelRowSchema`.

### F-5 [LOW] Free-text fields set by experts and admins have no control-character rule, and the Aktion Signal export does not collapse them

- **Location**: `src/lib/validators.ts:216-232` (`userSchema.name`, `userUpdateSchema.name`: no max, no control-character rule), `:257-260` (`teamSchema.name`: no max), `:262-289` (`aktionSchema.titel`, `adresse`, `ansprechpersonName`: max only), `:334-352` (`excelRowSchema`, same), `:362-366` (`wahlkreisUpdateSchema.name`: no max); `src/lib/excel.ts:22-33` (`formatSignalInfo`)
- **Current state**: An Aktion title containing a newline, from the form or from an Excel cell with Alt+Enter, ends up verbatim in `createAktionenTxt()`. That text is pasted into Signal groups, where it shows up as an extra, seemingly separate line. Only experts and admins can set these fields, so this is about integrity and accidents, not an outside attack.
- **Fix**: Apply `.regex(KEINE_STEUERZEICHEN, …)` and a `.max(100)` (names) or `.max(200)` (titles) to the fields listed. In `formatSignalInfo`, wrap `titel`, `adresse` and `ansprechpersonName` in `einzeilig()`, moving that helper above `formatSignalInfo`, so existing records are covered too.

## 07 · API Security

Rate limits exist on every public endpoint (`/api/aktionen` 60/min, `/api/aktionen/[id]` 30/min, signup 10/min, unsubscribe 20/min, "Meine Aktionen" 5/min per IP and 2/15 min per address). `clientIp()` takes the last `X-Forwarded-For` entry, which is the one Traefik appends. Error responses are generic ("Serverfehler"), and `logServerError()` logs only the error name, Prisma code and the first line of the message. Headers: CSP without `unsafe-eval` in production, `frame-ancestors 'none'` (embed routes: only `ALLOWED_EMBED_DOMAIN`), HSTS, `nosniff`, a referrer policy and no `X-Powered-By`.

### F-6 [MEDIUM] State-changing APIs accept requests from same-site origins: no Origin check, and `req.json()` ignores `Content-Type`

- **Location**: `src/proxy.ts:31-33` (matcher excludes `/api`); every cookie-authenticated `POST` handler that uses `await req.json()`: `src/app/api/admin/users/route.ts:67`, `src/app/api/aktionen/route.ts:147`, `src/app/api/user/passwort/route.ts:29`, `src/app/api/upload/route.ts:28` (multipart)
- **Current state**: The only CSRF defence is the session cookie's `SameSite=Lax` (Auth.js default, `@auth/core/lib/utils/cookie.js:52`). `SameSite` is per *site* (registrable domain), not per origin. Pages on other subdomains of the same domain are same-site, and the browser sends the cookie with their requests. A cross-origin `fetch(…, { method: "POST", mode: "no-cors", credentials: "include", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(…) })` is a "simple request" without a preflight, and `Request.json()` parses the body regardless of its content type. Verified locally on this commit: logged in as admin, a `POST /api/admin/users` with `Origin: https://evil.gruene-mitte.de` and `Content-Type: text/plain` reached the Zod validation of the admin handler. It failed only because the probe deliberately sent a too-short password.
- **Attack path**: Precondition: the attacker can run script, or host a form, on any origin of the same registrable domain as the app. Examples: the Kreisverband website at `www.<domain>` when the app runs at `aktionen.<domain>`, a compromised WordPress plugin there, or any other subdomain the party lets third parties host. An admin who visits that page while logged in sends `POST /api/admin/users` with `{"role":"ADMIN","email":"attacker@…","password":"…"}`, and the attacker now has their own admin account. With an expert victim, the same works for creating Aktionen (`POST /api/aktionen`) or importing them (`POST /api/upload`, multipart form).
- **Impact**: Privilege escalation to ADMIN, and with it read access to every registration (names, email addresses, phone numbers, Signal handles: political-opinion data under Art. 9 GDPR) and full write access. Precondition confirmed 2026-11-21: production runs at `aktionen.gruene-leipzig.de`, and the Kreisverband website `gruene-leipzig.de` is hosted separately. They are the same site, so the browser sends the session cookie with requests from the website.
- **Fix**: Reject state-changing API requests whose `Origin` is not the app's own origin, centrally in `src/proxy.ts`, before NextAuth runs:
  ```ts
  import { auth } from "@/lib/auth";
  import { NextResponse, type NextRequest } from "next/server";

  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  const APP_ORIGIN = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : null;

  function crossOriginWrite(req: NextRequest): boolean {
    if (SAFE_METHODS.has(req.method)) return false;
    const origin = req.headers.get("origin");
    // No Origin: not a browser request (curl, Coolify cron). Browsers always send it on POST/PUT/PATCH/DELETE.
    if (!origin) return false;
    return origin !== (APP_ORIGIN ?? req.nextUrl.origin);
  }

  const pageGuard = auth((req) => { /* existing body of the current default export, unchanged */ });

  export default function middleware(req: NextRequest, ctx: unknown) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      if (crossOriginWrite(req)) {
        return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
      }
      return NextResponse.next();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (pageGuard as any)(req, ctx);
  }

  export const config = {
    matcher: ["/dashboard/:path*", "/admin/:path*", "/api/:path*"],
  };
  ```
- **Why this fix works**: Browsers set `Origin` on every non-GET request, including same-site and `no-cors` ones, and page script cannot forge it. Requests from the app's own pages, and from the embed iframe (whose document is the app's origin), carry the app origin and pass. Server-to-server callers (cron via curl) send no `Origin` and are authenticated separately.
- **Constraints**: `NEXTAUTH_URL` must be exactly the public origin. It is already required in production (`checkConfig`), so a mismatch shows up immediately as 403s on every form, not silently. Keep `/api/auth/*` covered: NextAuth's own CSRF token stays, and the Origin check is additional. Coordinate with the Coolify value for each instance.
- **Verification**: Add `src/__tests__/security/origin-check.test.ts`: call the middleware with `POST /api/admin/users` and `Origin: https://evil.example`, expect 403. With `Origin` equal to `NEXTAUTH_URL`, expect pass-through. Without `Origin`, expect pass-through. With `GET`, expect pass-through. Manually, repeat the curl probe above and expect `403 Kein Zugriff`.
- **Scope guard**: Do not add CORS headers to "allow" the app's own origin; same-origin requests need none. Do not require `Content-Type: application/json` as the only control, because the multipart upload would stay open. Do not exempt the public signup endpoints: browsers send the app origin there too.

### F-7 [INFO] Rate limiting assumes the container is reachable only through Traefik (verified 2026-11-21)

- **Location**: `src/lib/rate-limit.ts:18-26`
- **Current state**: Correct for the documented setup. If port 3000 of the container were published directly, a client could choose the last `X-Forwarded-For` entry itself and bypass every per-IP limit, including the login IP limit. Manual check: in Coolify, the application must have no "Ports Mappings" entry, and `curl http://<server-ip>:3000/api/health` from outside must fail.
- **Verified 2026-11-21 (production, `aktionen.gruene-leipzig.de`)**: Coolify shows "Ports Exposes" `3000` and no port mapping. From outside, `curl -4` and `curl -6` to port 3000 both time out. The host name resolves directly to the server (no CDN), so the last `X-Forwarded-For` entry is Traefik's.

## 08 · External APIs

Nominatim is called with a fixed base URL, a `URLSearchParams` query, a 5 s timeout and a process-wide queue of one request per 1.1 s (`src/lib/geocoding.ts`). The address is the only user-controlled part, and it is sent as a parameter, so there is no SSRF. SMTP enforces STARTTLS (`requireTLS`) and TLS 1.2 when implicit TLS is off.

### F-8 [LOW] One large import blocks geocoding for every other request for up to ~35 minutes

- **Location**: `src/lib/geocoding.ts:29-48`; `src/app/api/upload/route.ts:159-205`; `src/app/api/aktionen/route.ts:153-159`; `src/app/api/aktionen/[id]/route.ts:110-116`
- **Current state**: The queue has no maximum wait. An import of 2,000 rows with distinct addresses enqueues about 2,000 × 1.1 s ≈ 37 minutes. Every Aktion create or edit by anyone during that time waits in the same queue before saving. The proxy will likely time out the import request long before then, while the server keeps working through the queue. Only logged-in experts can trigger it.
- **Fix**: Geocode at most a fixed number of distinct addresses per import (e.g. 100) and save the rest without coordinates. They can be added later by editing the Aktion. Alternatively, give `geocodeAddress()` a maximum queue wait (e.g. 10 s) after which it returns `null` without calling Nominatim.

## 09 · Sensitive Data

Registrations hold name, email, phone and Signal handle. These are data about political activity (Art. 9 GDPR). They are deleted 72 h after the Aktion ends, while a count is kept in `AktionStatistik`. `EmailLog` rows, which hold recipient addresses and, for `ABMELDUNG`, names, are deleted after 7 days. Deleting a user either removes the account or anonymises it (name, address and password replaced, teams removed, deactivated). The registrant list API omits `cancelToken`.

### F-9 [MEDIUM] The signup response time shows whether an address was already registered for an Aktion

- **Location**: `src/app/api/anmeldungen/route.ts:133-164`
- **Current state**: The body is the same for new and existing registrations (the "uniform response" mitigation from the *Kein Double-Opt-in* decision). The confirmation mail, however, is sent synchronously and only when something new was created:
  ```ts
  if (successfulAktionen.length > 0) {
    …
    await sendEmail({ … });
  }
  ```
  A request that only hits existing registrations returns without an SMTP round trip (typically hundreds of milliseconds to seconds faster).
- **Attack path**: Unauthenticated. The attacker sends `POST /api/anmeldungen` with the victim's address and one Aktion ID, then measures the response time. A fast response means the victim was already registered for that Aktion, and the attacker leaves no trace. A slow response means they were not; the attacker has now registered them, and the victim gets a confirmation mail. Within the rate limit (10/min per IP) this can be repeated across Aktionen.
- **Impact**: Disclosure of whether a named person takes part in a specific campaign action, which is political-opinion data. The decision "Kein Double-Opt-in" accepted that strangers can register an address. It relied on the response not revealing existing registrations, and this timing difference breaks that premise.
- **Fix**: Send the confirmation after the response, using `after` from `next/server` (stable in Next.js 15+):
  ```ts
  import { NextRequest, NextResponse, after } from "next/server";
  …
  if (successfulAktionen.length > 0) {
    const emailData = anmeldebestaetigungEmail(…);       // unchanged
    after(() =>
      sendEmail({ to: validated.email, subject: emailData.subject, html: emailData.html, typ: "BESTAETIGUNG" })
    );
  }
  ```
- **Why this fix works**: The response no longer waits for SMTP in either case. The remaining difference is one indexed `findUnique` on the unique-constraint path versus a `create`, which is in the noise of the network round trip.
- **Constraints**: `sendEmail` already catches every error and logs to `EmailLog`, so nothing escapes the `after` callback. Do not await it.
- **Verification**: In `src/__tests__/security/anmeldung-enumeration.test.ts`, mock `after` from `next/server` and assert that the handler returns before the mocked `sendEmail` resolves, for example by giving `sendEmail` a promise that never resolves and expecting the response anyway. Manually, compare response times for a new and an existing registration against a slow SMTP server.
- **Scope guard**: Do not "equalise" by sending a mail in the existing-only case: that would spam victims. Do not add artificial delays.

### F-10 [LOW] The daily summary with all registrants' contact data goes to a free-text address, and changes to it are not logged

- **Location**: `src/app/api/cron/daily-summary/route.ts:79-182`; `src/app/api/aktionen/[id]/route.ts:153-183`; `src/app/api/upload/route.ts:195`
- **Current state**: The summary (names, email addresses, phone numbers, Signal handles of today's registrations and of tomorrow's participants) is sent to `Aktion.ansprechpersonEmail`. That field accepts any address and does not have to belong to a user account. A typo there is a personal-data breach under Art. 33 GDPR. A deliberate change is a way to export data that, unlike `/api/export`, leaves no audit line.
- **Fix**: In `PUT /api/aktionen/[id]`, when `validated.ansprechpersonEmail !== existing.ansprechpersonEmail`, write `audit("USER_GEAENDERT"…)`, or better a new event `ANSPRECHPERSON_GEAENDERT` with `{ aktionId }` only (no address). Optionally show a hint in the Aktion form when the address does not match a user account ("Diese Adresse erhält täglich die Kontaktdaten aller Angemeldeten.").

## 10 · Logging

`audit()` writes one JSON line per security event: exports, imports, user creation, change and deletion, password change, failed and blocked logins, denied access, and hard deletes. By convention it carries only IDs, counts and field names, and email addresses only as HMAC pseudonyms. `logServerError()` trims Prisma messages to the first line. There are no file transports.

### F-11 [INFO] The health check logs the full error object

- **Location**: `src/app/api/health/route.ts:12`
- **Current state**: `console.error("…", error)` prints the whole Prisma error (host and port of the database, stack). It contains no credentials, but it is the only place that bypasses `logServerError()`. Fix: use `logServerError("GET /api/health", error)`.

## 11 · Scheduled Jobs

No findings. The three cron endpoints check a ≥32-character bearer token in constant time (`src/lib/cron-auth.ts`). Both mail jobs have an in-process re-entrancy guard and skip recipients who already got the same mail type within 12 h (`src/lib/cron-guard.ts`), so retries do not double-send. The cleanup runs per Aktion in its own transaction and continues after a failure. It also deletes registrations that arrived after an earlier cleanup. The single-container assumption is documented in `src/lib/rate-limit.ts`. It applies equally to the run guard, which would not prevent parallel runs across two replicas, but the 12 h resend window still would.

## 12 · Frontend

No findings. There is no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in `src`. Every `href`/`src` built from a variable comes from IDs, build-time configuration (`districtConfig`, `theme`) or static navigation, never from stored data. The precondition of D-04 (CSP without nonces) therefore holds, and `src/__tests__/security/csp-header.test.ts` pins the header. Login redirects to the fixed path `/dashboard` and has no `callbackUrl`. The session cookie is `httpOnly`, and no token is stored in `localStorage`.

## 13 · Dependencies

### F-12 [LOW] `npm audit`: 3 high findings, none reachable from a request

- **Location**: `package.json` (`prisma` 6.19.2 → `@prisma/config` → `effect` ≤ 3.22.0)
- **Current state**: `npm audit --omit=dev` reports `effect` "ReDoS in Schema.TemplateLiteral compiled regex", pulled in by the Prisma CLI's config loader. It runs only in `prisma migrate deploy` at container start, on the trusted `prisma.config`/schema. Request handlers use `@prisma/client`, which does not depend on it. Adjusted severity: LOW.
- **Fix**: Take the Prisma update that bumps `effect` once Dependabot proposes it. Do not force `npm audit fix --force`, which would change Prisma majors. Images are pinned by digest, and Dependabot covers npm and Docker weekly (`.github/dependabot.yml`).

## 14 · Testing & Security Regression

No findings. 32 security test files cover auth protection, role checks, team isolation (including the new expert visibility rules), cancel tokens, signup enumeration (response body), capacity races, rate limiting, body limits, upload limits, cron auth and the mail guard, CSP, SMTP TLS, email escaping, audit events and user deletion. The suite gates the Docker build (`Dockerfile:44`). Gaps tied to findings above: there is no test for the Origin check (F-6), session revocation after a password change (F-3) or response timing (F-9). Each finding names the test to add.

## 15 · Deployment & Configuration

No findings. Multi-stage build, the runtime stage installs with `--omit=dev` and runs as `USER node` (only `.next` is writable), and the base image is pinned by digest. `prisma migrate deploy && exec next start` aborts the start if a migration fails, and `checkConfig()` stops a misconfigured production start. Production deploys from the `production` branch only.

---

## Previously Accepted Decisions (ADR Review)

| Decision (CLAUDE.md → Constraints) | Verdict |
|---|---|
| **Kein Double-Opt-in**: signups take effect immediately; risk mitigated by rate limiting, honeypot and a uniform response that does not reveal existing registrations | **Valid, with drift.** Rate limiting (10/min/IP) and the honeypot are in place, and the body is uniform. The response *time* is not (F-9), so one of the three stated mitigations does not fully hold. Fix F-9 rather than revisiting the decision. |
| **CSP ohne Nonces (D-04)**: `script-src 'self' 'unsafe-inline'` accepted while there is no XSS sink | **Valid.** No sink found (section 12), and the CSP test pins the policy. Note the interaction with F-6: the decision text names "the full export rights of the logged-in person" as the stake of an XSS. A same-site CSRF reaches the same stake without any XSS in this app, which is why F-6 is rated MEDIUM. |

## Prioritized Action List

| Priority | Finding | Effort |
|---|---|---|
| P1 | F-6 Origin check for state-changing API requests | S |
| P1 | F-3 Revoke sessions on password change, absolute session lifetime | M |
| P1 | F-9 Send the signup confirmation after the response | S |
| P2 | F-1 Prevent self-demotion and deactivation of the last admin | S |
| P2 | F-10 Audit changes of the contact address that receives the daily summary | S |
| P2 | F-5 Control-character rules and `einzeilig` in the Aktion Signal export | S |
| P3 | F-8 Bound geocoding per import | S |
| P3 | F-4 Per-(email, IP) login failure counting | S |
| P3 | F-11 Health check via `logServerError` | S |
| P3 | F-12 Prisma update when available | S |
| P3 | F-7 Confirm no direct port mapping in Coolify (manual) | S |

## Positive Findings

These are deliberate strengths. A later change should not weaken them.

- **Authorization in every handler**, with shared helpers (`expertAktionWhere`, `hasAktionAccess`, `keepsOwnTeam`, `removesForeignTeam`) instead of per-route ad-hoc logic. Contact data is stripped for anyone without access, including logged-in experts of other teams.
- **Scoped writes**: `deleteMany({ id, aktionId })` for registrations and the expert filter merged into `updateMany` for bulk changes, so foreign IDs in a request have no effect.
- **Login hardening**: dummy-hash comparison, one `null` for every failure class, bounded failure maps that evict rather than block, and pseudonymised audit lines.
- **Fail-closed configuration**: `checkConfig()` stops production starts without strong secrets, and `isCronAuthorized()` rejects all requests without a long enough `CRON_SECRET`.
- **Unsubscribe flow**: the GET link only forwards to a confirmation page (safe against mail link scanners), the token travels in POST bodies, and token endpoints are body-limited and rate-limited.
- **Bounded input everywhere it is public**: streaming body limits, list sizes (`aktionIds` ≤ 100, IDs ≤ 40 characters), zip-bomb check before parsing Excel.
- **Capacity race fixed with an advisory lock** scoped per Aktion, so other Aktionen are not blocked.
- **Data minimisation built in**: 72 h deletion of registrations, 7-day `EmailLog` retention, anonymisation of deleted users who still own Aktionen.
- **HTML escaping in all mail templates**, covered by `email-escaping.test.ts`.
- **Supply chain**: digest-pinned base image, `npm ci`, tests gating the build, Dependabot for npm and Docker.

## Attack-Surface Inventory

### Routes × guards

| Route | Methods | Guard |
|---|---|---|
| `/api/aktionen` | GET · POST | GET public (rate limit 60/min; contact data stripped without a session or with `public=true`); POST session |
| `/api/aktionen/[id]` | GET · PUT · DELETE | GET public (30/min; contact data only with `hasAktionAccess`); PUT/DELETE session + `hasAktionAccess` |
| `/api/aktionen/[id]/anmeldungen` | GET · DELETE | session + `hasAktionAccess`; delete scoped to `aktionId` |
| `/api/aktionen/bulk-kategorie` | PATCH | session; EXPERT filter via `expertAktionWhere` |
| `/api/anmeldungen` | POST | public (10/min/IP, 32 KB body, honeypot) |
| `/api/anmeldungen/abmelden` | GET · POST | public; GET redirect only; POST token (20/min, 1 KB) |
| `/api/anmeldungen/abmelden/info` | POST | public; token (20/min, 1 KB) |
| `/api/anmeldungen/meine-aktionen` | POST | public (5/min/IP, 2/15 min per address, 1 KB) |
| `/api/auth/[...nextauth]` | GET · POST | NextAuth (own CSRF token); credentials rate-limited in `authorizeCredentials` |
| `/api/export` | GET | session; EXPERT via `expertAktionWhere`; audited |
| `/api/export-aktionen` | GET | session; EXPERT via `expertAktionWhere`; audited |
| `/api/upload` | POST | session; 5 MB / 100 MB unpacked / 2,000 rows; audited |
| `/api/teams` | GET | session (all team names) |
| `/api/user/teams` | GET | session (own teams) |
| `/api/user/konto` | GET · PATCH | session (own account; name only) |
| `/api/user/passwort` | POST | session + current password; 5 failures / 15 min per user |
| `/api/admin/users` | GET · POST · PUT · DELETE | GET session (EXPERT: own teams + admins); writes ADMIN |
| `/api/admin/stats` | GET | session (EXPERT: own teams) |
| `/api/admin/teams` | GET · POST · PUT · DELETE | ADMIN |
| `/api/admin/wahlkreise` | GET · PUT | ADMIN |
| `/api/admin/export-stats` | GET | ADMIN; audited |
| `/api/admin/aktionen/[id]` | DELETE | ADMIN (403 + audit otherwise) |
| `/api/cron/daily-summary` | POST | bearer `CRON_SECRET`; run guard; 12 h resend window |
| `/api/cron/send-erinnerungen` | POST | bearer `CRON_SECRET`; run guard; 12 h resend window |
| `/api/cron/cleanup-anmeldungen` | POST | bearer `CRON_SECRET` |
| `/api/health` | GET | public (`{status}` only) |
| `/api/vorlage` | GET | public (static template) |
| `/api/wahlkreise` | GET | public (names and numbers) |

Pages: `src/proxy.ts` redirects `/dashboard/*` without a session and `/admin/*` without ADMIN, except `/admin` and `/admin/users` for experts. Pages fetch data through the APIs above, which enforce access themselves.

### Scheduled jobs

Triggered externally (Coolify scheduled tasks via curl): `daily-summary`, `send-erinnerungen`, `cleanup-anmeldungen`. There is no in-process scheduler.

### Outbound calls

- `https://nominatim.openstreetmap.org/search`: `src/lib/geocoding.ts:59` (fixed host, 5 s timeout, 1 request per 1.1 s)
- SMTP (`SMTP_HOST`): `src/lib/email.ts:8-21` (STARTTLS required, TLS ≥ 1.2)
- Browser only: OSM tiles `https://*.tile.openstreetmap.org` (CSP `img-src`/`connect-src`)

## Executive Summary

The security posture is good. There are no critical or high findings, and authorization holds for all 42 handlers, including the features added since the last assessment. The most important risk is F-6: state-changing APIs trust any same-site origin. If any page on the app's registrable domain is not under the app's control, a logged-in admin who visits it can be made to create an admin account. Its precondition (a shared domain) should be checked first. F-3 (sessions survive a password change) and F-9 (signup timing reveals registrations) are the other two P1 items. All three are small, contained changes with a named regression test.

**Statistics**: 42 handlers (12 public by design, 3 cron, 27 session-guarded), 0 unintentionally unguarded. Findings: 0 critical · 0 high · 3 medium (F-3, F-6, F-9) · 6 low (F-1, F-4, F-5, F-8, F-10, F-12; F-12 reachability-adjusted) · 3 info (F-2, F-7, F-11).

**Top fixes (P1)**: F-6 Origin check · F-3 session revocation on password change · F-9 confirmation mail after the response.

---

## Changes Since Last Assessment

Compared with `security-assessment-2026-11-18.md` (commit `12fbad8`, 13 findings). Prior IDs are prefixed `2026-11-18/`. Each status was checked against the code at `ed0f800`.

### (a) Resolved

| Prior finding | Evidence now |
|---|---|
| 2026-11-18/F-4 [INFO] case-sensitive login lookup | `findUnique({ where: { email: emailKey } })`, `src/lib/credentials.ts:46` (`2d6fb93`) |
| 2026-11-18/F-5 [MEDIUM] unsubscribe endpoints without body or rate limit | `readJsonLimited` 1 KB and 20/min in both handlers (`b1abe0c`), `public-body-limits.test.ts`. Proxy body limit documented (`732c432`) |
| 2026-11-18/F-6 [LOW] unbounded ID arrays | `teamIdsSchema` ≤ 50, `bulkKategorieSchema.ids` ≤ 1000, IDs ≤ 40 characters (`7fc0355`) |
| 2026-11-18/F-7 [LOW] capacity race | per-Aktion `pg_advisory_xact_lock` in a transaction (`0c1ef5a`), `anmeldung-kapazitaet.test.ts` |
| 2026-11-18/F-8 [LOW] broad `img-src` | `img-src 'self' data: https://*.tile.openstreetmap.org` (`5c301da`) |
| 2026-11-18/F-9 [LOW] `X-Powered-By` | `poweredByHeader: false` (`5ca7d4c`) |
| 2026-11-18/F-12 [LOW] failed logins, denials, errors, imports not logged | `LOGIN_FEHLGESCHLAGEN`, `LOGIN_GESPERRT`, `ZUGRIFF_VERWEIGERT`, `AKTIONEN_IMPORTIERT`, `logServerError()` (`43175ef`), `audit-events.test.ts` |
| 2026-11-18/F-13 [INFO] 16 high in dev tooling (`picomatch`) | No longer reported. The current audit shows a different, production-tree advisory (now F-12) |
| D-04 recorded only in a test name | Recorded in `CLAUDE.md` → Constraints (`54ae855`) |

### (b) Still open

| Prior finding | Status |
|---|---|
| 2026-11-18/F-1 [INFO] contact address decides who receives registrant data | Open, **re-rated to LOW as F-10**. The access argument still holds. What is new in this assessment is that a change of this address is the one way registrant data leaves the app without an audit line, now that exports are audited. |
| 2026-11-18/F-2 [LOW] targeted and global login lockout | **Partly resolved.** The global lockout is gone (`a944486`, eviction instead of blocking). The per-account lockout remains as F-4. |
| 2026-11-18/F-3 [INFO] logout does not revoke the JWT | Open, **re-rated to MEDIUM as F-3**. Since `5c966b5`, people can change their own password, and that is the step they would take after a suspected compromise, but it does not end the attacker's session. In addition, Auth.js re-signs the token on every session read, so there is no absolute 24 h limit. The earlier report assumed there was. |
| 2026-11-18/F-10 [INFO] public detail endpoint returns cancelled and past Aktionen | Unchanged, no action needed (not enumerable, no contact data). |
| 2026-11-18/F-11 [LOW] volunteer address in URLs | **Partly resolved.** The API is POST now (`be8fa0a`). The confirmation-mail link still carries `?email=` (`src/lib/email-templates.ts:163`), which was accepted as optional in the prior fix text. |

### New findings that are not regressions

F-6 (same-site CSRF) and F-9 (signup timing) concern code that was already present at `12fbad8`. They were missed by the earlier assessments, not introduced since. F-1, F-5, F-8 and F-11 are likewise pre-existing.

### (c) Regressions

No control was removed or weakened. The features added since `12fbad8` (self-service account page, expert view of `/admin` and `/admin/users`, user deletion with anonymisation, unified sidebar) all check authentication and team scope correctly, and come with tests (`eigenes-konto.test.ts`, `expert-sichtbarkeit.test.ts`, `benutzer-loeschen.test.ts`).

One point needs attention for future features. The self-service password change made an existing gap (F-3) matter more, because the obvious remedy now appears to work and does not. To catch this class of gap next time, the fix for F-3 adds a test asserting that a password change invalidates older tokens. Any new credential-changing endpoint then has a failing example to follow.
