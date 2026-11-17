# Security Assessment — 2026-11-17

- **Commit:** `7e793bbab5b58967c19dcaa0e5fe98f361ccaa90` (branch `main`; working tree clean apart from an untracked, non-code `docs/rewrite.md`)
- **Step 0 numbers:** 25 `route.ts` files / **37 route handlers** · **13 handlers callable without a session** (10 public by design, 3 cron handlers gated only by `CRON_SECRET`) · **1 public handler returning personal data it should not** (`GET /api/aktionen`, F-3) · **3 cron jobs** (externally triggered) · **2 outbound integrations** (Nominatim `fetch`, SMTP via nodemailer) · **60** environment variables read explicitly (+ `DATABASE_URL`, `NEXTAUTH_SECRET`/`AUTH_SECRET`, `AUTH_TRUST_HOST` read implicitly by Prisma/Auth.js)
- **Scope:** everything under `src/`, `prisma/`, `next.config.ts`, `Dockerfile`, `.dockerignore`, `.env.example`, `docs/deployment/`, `docs/DEPLOYMENT.md`, git history (secrets), `npm audit`.

## Method adaptation

The audit follows a fixed 15-section method (drift check, severity rubric, false-positive gate, F-{n} findings). Checklist items with no equivalent in this stack were dropped:

- **Refresh-token rotation / reuse detection / session table** — Auth.js JWT strategy has no refresh token or server-side session; replaced by JWT-claim staleness (F-2).
- **Field-level encryption of a third-party credential (AES-GCM, key derivation, transformer, key rotation)** — the app stores no third-party credential; section 4 is reduced to password hashing and token storage.
- **ORM query-builder / `orderBy` injection, global validation pipe, content-type middleware, framework throttler guard, helmet** — replaced by Prisma `where` construction, per-route Zod parsing, hand-written rate limiters and `next.config.ts` headers.
- **Third-party queue ingestion, acknowledgement semantics, per-account polling loops** — no equivalent; section 8 covers Nominatim and SMTP instead.
- **Structured logger redaction, request-ID propagation, log transports** — the app has no logger (three `console.*` calls); section 10 covers the `EmailLog` table and audit trail.
- **In-process schedulers** — jobs are HTTP endpoints triggered by Coolify Scheduled Tasks.
- **SPA runtime-config injection, nginx header includes, client-side token storage** — Next.js renders and serves everything; the session lives in an httpOnly Auth.js cookie.
- **Integration tests against a real database, migration `down()` scripts, separate staging environment** — none exist (Prisma migrations are forward-only; one production deployment).

**Documentation drift found in Step 0:** `CLAUDE.md` lists `POST /api/aktionen/[id]/anmeldungen` as the signup route — the real signup route is `POST /api/anmeldungen`; `[id]/anmeldungen` serves `GET`/`DELETE` for experts. `CLAUDE.md` also says `src/proxy.ts` is "exported as middleware" — it is a default export using the Next.js 16 `proxy` convention, matching only `/dashboard/:path*` and `/admin/:path*`. Unlisted routes found and audited: `GET /api/health`, `GET /api/teams`, `GET /api/user/teams`, `PATCH /api/aktionen/bulk-kategorie`, `GET /api/admin/export-stats`, `GET|PUT /api/admin/wahlkreise`, `DELETE /api/admin/aktionen/[id]`, page `/embed/aktion/[id]`.

## Security Posture Verdict

**⚠️ Needs Improvement — no unauthenticated takeover path, but the personal-data boundary leaks in four places.** Authentication, role checks on `/api/admin/*`, team scoping of list/export queries, HTML escaping in emails and the container build are solid. However, the public action list hands out every contact person's email and mobile number (F-3), the public signup form answers "is this email already registered for this action?" (a political-participation oracle, F-18), an expert can delete any volunteer's registration by ID across teams (F-1), and role/team changes never reach an already-issued session (F-2). Next.js and Auth.js are many security releases behind (F-27).

## Category Status Matrix

| # | Section | Status | CRIT | HIGH | MED | LOW | INFO |
|---|---|---|---|---|---|---|---|
| 1 | Authorization & Team Isolation | ❌ Critical | 0 | 3 | 0 | 1 | 0 |
| 2 | Secrets & Configuration | ✅ Good | 0 | 0 | 0 | 1 | 0 |
| 3 | Authentication | ⚠️ Needs Improvement | 0 | 0 | 1 | 1 | 0 |
| 4 | Password Hashing & Token Storage | ✅ Good | 0 | 0 | 0 | 0 | 1 |
| 5 | Database Security | ✅ Good | 0 | 0 | 0 | 1 | 0 |
| 6 | Input Validation | ⚠️ Needs Improvement | 0 | 0 | 2 | 1 | 0 |
| 7 | API Security | ⚠️ Needs Improvement | 0 | 0 | 2 | 1 | 0 |
| 8 | External Services (Nominatim, SMTP) | ⚠️ Needs Improvement | 0 | 0 | 1 | 1 | 0 |
| 9 | Personal Data (DSGVO) | ❌ Critical | 0 | 1 | 3 | 1 | 0 |
| 10 | Logging & Audit Trail | ⚠️ Needs Improvement | 0 | 0 | 1 | 0 | 0 |
| 11 | Scheduled Jobs (Cron Endpoints) | ⚠️ Needs Improvement | 0 | 0 | 1 | 1 | 0 |
| 12 | Frontend | ✅ Good | 0 | 0 | 0 | 0 | 1 |
| 13 | Dependencies & Supply Chain | ❌ Critical | 0 | 1 | 0 | 1 | 0 |
| 14 | Testing & Security Regression | ⚠️ Needs Improvement | 0 | 0 | 1 | 0 | 0 |
| 15 | Deployment & Configuration | ✅ Good | 0 | 0 | 0 | 1 | 0 |
| | **Total** | | **0** | **5** | **12** | **11** | **2** |

Status rule: ❌ = at least one open CRITICAL/HIGH · ⚠️ = at least one MEDIUM · ✅ = LOW/INFO only.

**Upstream candidates:** every finding except F-5's default-domain detail and F-30 concerns code shared with the upstream repository; keep each fix in its own commit so it can be cherry-picked.

---

## 1. Authorization & Team Isolation

Isolation model verified in code: `hasAktionAccess()` (ADMIN, creator, or member of any assigned team) guards every single-Aktion handler (`PUT`/`DELETE /api/aktionen/[id]`, `GET`/`DELETE /api/aktionen/[id]/anmeldungen`); `expertAktionWhere()` scopes `GET /api/aktionen`, `/api/export`, `/api/export-aktionen` and `PATCH /api/aktionen/bulk-kategorie` (the `Object.assign` keeps `id IN (…)` AND the team `OR`). The empty-`teamIds` case degrades to "created by me" rather than "everything". All 13 `/api/admin/*` handlers check `role === "ADMIN"` (401/403). `GET /api/teams` (all team names) is authenticated-only by design, because experts may assign any team.

### F-1 [HIGH] Expert can delete any volunteer registration across teams (unscoped `anmeldungId`)

Rubric class is "cross-team write" (CRITICAL); rated HIGH because the attacker must already know the target registration's ID (a cuid with ~41 random bits — not guessable over HTTP, but known to anyone who previously had access to that action, e.g. a former team member or a co-team that was later removed).

- **Location**: `src/app/api/aktionen/[id]/anmeldungen/route.ts:38-70` (DELETE handler, delete at line 68). UI caller: `src/app/dashboard/aktionen/[id]/anmeldungen/page.tsx` (unchanged by the fix). Test: `src/__tests__/security/team-isolation.test.ts`.
- **Current state**: access is checked against the Aktion in the path, but the delete uses only the query parameter:
  ```ts
  if (!hasAktionAccess(session.user, aktion)) { … 403 }
  await prisma.anmeldung.delete({ where: { id: anmeldungId } });
  ```
- **Attack path**: EXPERT of team A sends `DELETE /api/aktionen/<an Aktion of team A>/anmeldungen?anmeldungId=<registration of a team-B Aktion>`. The access check passes on the team-A Aktion; the team-B registration is deleted. A non-existent ID makes `delete` throw → unhandled 500, which also gives an existence oracle.
- **Impact**: cross-team destructive write on volunteer registrations (data loss; volunteer silently disappears from the other team's list, daily summary and reminders).
- **Fix**:
  ```ts
  const result = await prisma.anmeldung.deleteMany({
    where: { id: anmeldungId, aktionId: id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Anmeldung nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ message: "Anmeldung gelöscht" });
  ```
- **Why this fix works**: the registration is matched by both its ID and the Aktion whose access was just verified, so a foreign ID matches zero rows; `deleteMany` returns a count instead of throwing, removing the 500/200 oracle.
- **Constraints**: German error string; general fix → separate commit (upstream candidate); commit only after user review; tests run in the Docker build.
- **Verification**: add to `team-isolation.test.ts`: "EXPERT kann KEINE Anmeldung einer fremden Aktion über die eigene Aktion löschen → 404" — mock `aktion.findUnique` (own team) and assert `anmeldung.deleteMany` was called with `{ where: { id: "fremd", aktionId: "eigene" } }` and that the response is 404 when `count` is 0. `npm test`.
- **Scope guard**: do not change `hasAktionAccess()`; do not switch to a lookup by `anmeldungId` alone followed by an access check on *its* Aktion without also keeping the path Aktion check — both IDs must agree.

### F-2 [HIGH] Role and team membership in the JWT are never refreshed; sessions roll indefinitely

- **Location**: `src/lib/auth.ts:49-70` (`jwt` callback). Related: `src/app/api/admin/users/route.ts` (PUT changes `role`/`teamIds`), `src/__tests__/security/jwt-invalidation.test.ts`.
- **Current state**: `role` and `teamIds` are copied into the token once at login. The 5-minute re-check reads only `active`:
  ```ts
  const dbUser = await prisma.user.findUnique({ where: { id: token.sub! }, select: { active: true } });
  ```
  Auth.js re-signs the JWT with a fresh 24 h expiry on every `/api/auth/session` call (verified in `node_modules/@auth/core/lib/actions/session.js`), and the `SessionProvider` calls it whenever a tab regains focus — an active user's token never expires.
- **Attack path**: (a) An ADMIN is demoted to EXPERT via `PUT /api/admin/users` → keeps `role: "ADMIN"` in the cookie and full admin API access for as long as they keep using the app. (b) An EXPERT is removed from team B → keeps `teamIds` containing B and can continue to `GET /api/aktionen/[id]/anmeldungen` and `GET /api/export?format=xlsx` for all of team B's volunteers.
- **Impact**: revocation of privileges does not work; cross-team read of volunteer PII (name, email, phone, Signal) and retained admin rights after demotion. Only deactivation (`active=false`) revokes access.
- **Fix**: refresh the claims during the existing periodic check (and shorten nothing else):
  ```ts
  const dbUser = await prisma.user.findUnique({
    where: { id: token.sub! },
    select: { active: true, role: true, teams: { select: { teamId: true } } },
  });
  if (!dbUser || !dbUser.active) return null;
  token.role = dbUser.role;
  token.teamIds = dbUser.teams.map((t) => t.teamId);
  token.lastChecked = Date.now();
  ```
- **Why this fix works**: every `auth()` call runs the `jwt` callback; once `lastChecked` is older than 5 minutes the claims are re-read from the database and the `session` callback exposes the fresh values, so changes take effect within ≤ 5 minutes even if the cookie is never rewritten.
- **Constraints**: `src/proxy.ts` imports the same `auth` — the query also runs there (already the case for `active`). No schema change. Update the admin UI hint only if it promises immediate effect. Commit after review; upstream candidate.
- **Verification**: extend `jwt-invalidation.test.ts`: "Rolle und Teams werden beim Re-Check aus der DB übernommen" — token with `role: "ADMIN", teamIds: ["a","b"]`, `lastChecked` 6 minutes old, DB returns `{ active: true, role: "EXPERT", teams: [{ teamId: "a" }] }` → returned token has `role: "EXPERT"`, `teamIds: ["a"]`. Manual: demote a logged-in admin, wait 5 min, `GET /api/admin/users` → 401.
- **Scope guard**: keep the JWT strategy and the 5-minute interval; do not move to database sessions; do not drop the `active` check.

### F-3 [HIGH] Public action list exposes every contact person's email address and mobile number

- **Location**: `src/app/api/aktionen/route.ts:92-149` (public branch at 58 and 106). Test that currently accepts the leak: `src/__tests__/security/data-sanitization.test.ts` ("Ansprechperson-E-Mail ist OK da öffentlich"). Related detail endpoint: `src/app/api/aktionen/[id]/route.ts:66-70`.
- **Current state**: `findMany({ include: … })` returns all scalar columns and the handler returns them unchanged for anonymous callers. Verified against the local dev server: `GET /api/aktionen?public=true` without a session returns `ansprechpersonEmail`, `ansprechpersonTelefon`, `createdById`, `createdAt`, `updatedAt`. The detail endpoint strips email and phone for anonymous callers, and the public UI (`AktionCard`, `AktionMap`) shows only the name — so the list endpoint defeats a protection the app deliberately has elsewhere. The expert guide (`docs/anleitung-wahlkampfexperten.md:106`) asks for the contact person's *Handynummer*.
- **Attack path**: unauthenticated `curl https://<domain>/api/aktionen` (60 req/min, bypassable — F-13) → names, email addresses and mobile numbers of every contact person of every upcoming action, plus internal user IDs.
- **Impact**: public leak of individual PII of party volunteers/staff (spam, harassment, doxxing of campaign workers); internal user cuids exposed.
- **Fix**: strip the fields for the public branch (anonymous or `public=true`):
  ```ts
  const isPublicView = !session || isPublic;
  const body = isPublicView
    ? filtered.map(({ ansprechpersonEmail: _e, ansprechpersonTelefon: _t, createdById: _c, ...rest }) => rest)
    : filtered;
  return NextResponse.json(body);
  ```
  Apply the same removal of `createdById` in `src/app/api/aktionen/[id]/route.ts` for anonymous callers. Update the sanitization test to assert the absence of `ansprechpersonEmail`, `ansprechpersonTelefon` and `createdById`.
- **Why this fix works**: anonymous and public-view responses are built from an explicit removal of the personal fields after filtering, so the public page (which only renders the name) keeps working while the API no longer carries the data.
- **Constraints**: the authenticated dashboard list (no `public=true`) must keep the fields — the dashboard and the edit form need them. Upstream candidate. Commit after review.
- **Verification**: `curl -s 'http://localhost:3200/api/aktionen?public=true' | jq '.[0] | keys'` shows no `ansprechperson{Email,Telefon}`/`createdById`; logged-in dashboard still shows contact data; updated test passes.
- **Scope guard**: do not remove `ansprechpersonName` (shown publicly by design); do not change the email templates — volunteers who registered must keep receiving the contact details in their confirmation mail.

### F-4 [LOW] Experts read contact data of other teams' actions; experts can unassign co-teams

- **Location**: `src/app/api/aktionen/[id]/route.ts:38-73` (GET returns the full Aktion to any session); `src/lib/aktion-teams.ts:134-143` (`keepsOwnTeam`).
- **Current state**: any EXPERT receives contact email/phone and team list of any Aktion by ID. `keepsOwnTeam()` only requires the editor to keep one of *their* teams, so an expert of team A can remove team B from a shared A+B Aktion, cutting B's members (other than the creator) off from its registrations.
- **Fix**: accept as design or (a) return the stripped public shape to EXPERTs without `hasAktionAccess`; (b) only let the creator or an ADMIN remove a team the editor is not a member of. Document the decision in `CLAUDE.md`.

## 2. Secrets & Configuration

No secret is tracked: `git ls-files` contains only `.env.example` (placeholders), and a history search (`git log --all -p -S`) shows only placeholder values for `NEXTAUTH_SECRET`, `CRON_SECRET`, `SMTP_PASSWORD`. `.dockerignore` excludes `.env`, `.env*.local`, `.git`. The Dockerfile declares only non-secret build `ARG`s; the Coolify guide marks secrets runtime-only. The local `.env` was not read.

### F-5 [LOW] No fail-fast configuration check; mail links fall back to another Kreisverband's domain

- **Location**: `src/lib/email-templates.ts:17`, `src/app/api/anmeldungen/abmelden/route.ts:4-5`, `src/lib/email.ts:13-14`; no `instrumentation.ts`.
- **Current state**: `const baseUrl = process.env.NEXTAUTH_URL ?? "https://aktionen.gruene-mitte.de";` — a deployment for another Kreisverband that forgets `NEXTAUTH_URL` mails unsubscribe links (with valid `cancelToken`s) pointing at the Berlin-Mitte server. `CRON_SECRET` is likewise unchecked (exploitable consequence in F-24).
- **Fix**: add `src/instrumentation.ts` with `register()` that, when `NODE_ENV === "production"`, throws if `NEXTAUTH_URL`, `NEXTAUTH_SECRET`/`AUTH_SECRET` (≥ 32 chars), `CRON_SECRET` (≥ 32 chars), `DATABASE_URL`, `SMTP_HOST`, `EMAIL_FROM` are missing; remove the hard-coded domain fallbacks (use `NEXTAUTH_URL` only). Configuration stays in env vars, not code.

## 3. Authentication

Auth.js v5 Credentials provider, JWT strategy (24 h, rolling), bcryptjs cost 12, `active` re-checked every 5 minutes (tested). Auth.js supplies CSRF protection for the sign-in POST and httpOnly, `__Secure-`-prefixed cookies under HTTPS. Logout cannot revoke an issued JWT — inherent to the documented JWT-strategy decision and acceptable with the 5-minute re-check once F-2 is fixed.

### F-6 [MEDIUM] No brute-force protection on login; account existence leaks via timing

- **Location**: `src/lib/auth.ts:14-38` (`authorize`). Route: `POST /api/auth/callback/credentials` (`src/app/api/auth/[...nextauth]/route.ts`).
- **Current state**: no rate limit, no failed-attempt counter, no lockout. For an unknown or inactive email `authorize` returns before `bcrypt.compare`, so the response is ~250 ms faster than for an existing account.
- **Attack path**: unauthenticated attacker scripts the credentials callback (fetch CSRF token from `/api/auth/csrf`, then POST) with a password list against the expert emails (often guessable `vorname.nachname@…`), unlimited and in parallel; timing first confirms which addresses have accounts.
- **Impact**: takeover of an EXPERT (team volunteer PII export) or ADMIN account (all PII, user management). Minimum password length is only 8 (F-7).
- **Fix**: in `authorize(credentials, request)` (Auth.js v5 passes the `Request` as second argument) use the shared limiter from F-13: max 5 failed attempts per email per 15 min and 20 per client IP per 15 min; when limited, return `null` without calling bcrypt. For unknown/inactive users run `await bcrypt.compare(password, DUMMY_HASH)` (a constant cost-12 hash generated once and stored in code) before returning `null`. Reset the per-email counter on success.
- **Why this fix works**: online guessing becomes bounded per account and per source, and every failed path performs one bcrypt comparison, so timing no longer distinguishes existing accounts.
- **Constraints**: in-memory state is acceptable (single container on Coolify) but resets on deploy — document this. A persistent lockout would need a schema change via `npx prisma migrate dev --name add_login_lockout` with `timestamptz`; not required for this fix. Error shown to users stays the generic Auth.js "CredentialsSignin" (German message on the login page unchanged). Upstream candidate.
- **Verification**: unit test calling the exported `authorize` logic (extract it into `src/lib/credentials.ts` for testability): 6th wrong attempt for the same email returns `null` without invoking `bcrypt.compare`; unknown email calls `bcrypt.compare` once. Manual: 6 wrong logins → 6th fails even with the right password until the window expires.
- **Scope guard**: do not reveal "account locked" vs "wrong password" in the UI; do not lower the bcrypt cost; do not add a CAPTCHA service (DSGVO, third-party).

### F-7 [LOW] Weak password policy for managed accounts

- **Location**: `src/lib/validators.ts:19,28` (`min(8)`), `prisma/bootstrap.ts` (min 12).
- **Current state**: admin-created and admin-reset passwords need only 8 characters; bcrypt silently ignores bytes beyond 72.
- **Fix**: raise to `min(12)` and add `.max(72, "Passwort darf höchstens 72 Zeichen lang sein")` in `userSchema` and `userUpdateSchema`; same message style in German.

## 4. Password Hashing & Token Storage

### F-8 [INFO] Cancel tokens are stored in plaintext

- **Location**: `prisma/schema.prisma:140`, `src/app/api/anmeldungen/route.ts:85` (`crypto.randomBytes(32)`).
- **Current state**: 256-bit random tokens, unique index, looked up by equality. Storing a SHA-256 hash would only protect against an attacker who already has database read access (and therefore the PII itself). No action required; revisit if tokens ever grant more than unsubscribing.

## 5. Database Security

Prisma parameterises every query; the only raw SQL is the tagged-template `SELECT 1` in `/api/health`. The database listens only on the Coolify-internal network with the host port bound to `127.0.0.1` (`docs/deployment/coolify-deployment.md` §2). Dynamic `where` objects are built from `searchParams.get()` strings only, so operator injection via objects is not possible on GET routes.

### F-9 [LOW] All timestamps are `timestamp(3)` without time zone

- **Location**: every `DateTime` in `prisma/schema.prisma` (e.g. `createdAt`, `gesendetAm`, `geloeschtAm`); migrations `prisma/migrations/*/migration.sql` (`TIMESTAMP(3)`).
- **Current state**: violates the project rule (UTC in `timestamptz`). Prisma writes UTC, so behaviour is correct today, but any tool or SQL console in a non-UTC session misreads retention-relevant columns (`createdAt` used by the cleanup and daily-summary logic).
- **Fix**: add `@db.Timestamptz(3)` to all `DateTime` fields except `@db.Date` columns and generate the migration with `npx prisma migrate dev --name timestamptz` (Postgres converts in place, interpreting existing values as UTC when the session time zone is UTC — run with `SET TIME ZONE 'UTC'` semantics; verify on a copy first).

## 6. Input Validation

Every POST/PUT body except `PUT /api/admin/teams` is parsed with a Zod schema from `src/lib/validators.ts`; Prisma calls use explicit field lists (no body spread into `create`/`update`), so `role`, `active`, `createdById` and `status` cannot be mass-assigned. Excel exports were verified to write user text as shared strings (`t="s"`), not formulas — a value like `=HYPERLINK(...)` is not evaluated.

### F-10 [MEDIUM] Public signup accepts unbounded bodies, arrays and strings

- **Location**: `src/lib/validators.ts:70-98` (`anmeldungSchema`), `src/app/api/anmeldungen/route.ts:41-145`.
- **Current state**: `aktionIds: z.array(z.string()).min(1)` has no maximum and no de-duplication; `vorname`/`nachname` have only `min(2)`; the handler runs one `findUnique` (and possibly one `create`) **per array element, sequentially**; `req.json()` has no size cap. Installed `zod` 4.3.6 is also affected by GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized constrained collections).
- **Attack path**: unauthenticated `POST /api/anmeldungen` with `aktionIds` of 200 000 random strings and a 50 MB `nachname` → hundreds of thousands of sequential DB round-trips and large allocations per request; repeated with rotating `X-Forwarded-For` (F-13).
- **Impact**: denial of service of the public signup and the database during campaign peaks.
- **Fix**:
  ```ts
  aktionIds: z.array(z.string().max(40)).min(1, "Bitte wähle mindestens eine Aktion")
    .max(50, "Bitte wähle höchstens 50 Aktionen"),
  vorname: z.string().trim().min(2, …).max(100, "Vorname darf höchstens 100 Zeichen lang sein"),
  nachname: z.string().trim().min(2, …).max(100, "Nachname darf höchstens 100 Zeichen lang sein"),
  email: emailSchema().max(254) // in emailSchema
  ```
  In the route, before `req.json()`: reject `Number(req.headers.get("content-length") ?? 0) > 32_768` with 413 `{ error: "Anfrage zu groß" }`; de-duplicate with `[...new Set(validated.aktionIds)]`; load all Aktionen with one `findMany({ where: { id: { in: ids } } … })`. Add `.max()` limits to `aktionSchema` strings too (titel 200, adresse 300, ansprechpersonName 100, ansprechpersonTelefon 50) and to `excelRowSchema`.
- **Why this fix works**: work per request becomes bounded (≤ 50 IDs, one lookup query) and oversized payloads are rejected before parsing.
- **Constraints**: German validation messages; check the largest realistic selection on the public page (all upcoming actions) stays below 50 — raise the cap if a campaign has more upcoming actions. Upgrade `zod` (F-27). Upstream candidate.
- **Verification**: `input-validation.test.ts`: 51 `aktionIds` → 400; 101-char `vorname` → 400; duplicate IDs create one registration. `npm test`.
- **Scope guard**: do not tighten the character set of names (umlauts, hyphens, accents must keep working for the target audience).

### F-11 [MEDIUM] Excel upload has no file-size, row-count or decompression limit

- **Location**: `src/app/api/upload/route.ts:17-24` (formData/arrayBuffer), `:138` (geocoding per row); `src/lib/excel.ts` `parseExcelFile`.
- **Current state**: any session can upload any size; `file.arrayBuffer()` buffers it fully, ExcelJS (JSZip) inflates the whole workbook in memory on the request thread, and import geocodes every row sequentially with no delay.
- **Attack path**: an authenticated EXPERT (or a stolen expert session) uploads a 5 MB zip-bomb `.xlsx` that inflates to several GB, or a sheet with 100 000 rows and `import=true`.
- **Impact**: Node process OOM/hang (whole app down for volunteers); Nominatim usage-policy violation → IP ban, breaking geocoding (F-17).
- **Fix**: before `arrayBuffer()`: `if (!(file instanceof File) || file.size > 2 * 1024 * 1024) return 413 { error: "Datei zu groß (max. 2 MB)" }`; require the `.xlsx` extension; after parsing: `if (rows.length > 500) return 400 { error: "Zu viele Zeilen (max. 500)" }`. In the import loop wait 1100 ms between geocoding calls (reuse the delay from `geocodeAddresses`).
- **Why this fix works**: a 2 MB cap bounds both the buffer and (together with the row cap) the realistic inflated size; serial geocoding respects Nominatim's 1 req/s policy.
- **Constraints**: German messages; check the largest real import file the campaign uses before choosing the caps. Upstream candidate.
- **Verification**: test with a mocked `File` of 3 MB → 413 and `parseExcelFile` not called; 501-row mock → 400.
- **Scope guard**: keep the preview/import two-step flow; do not move parsing to the browser.

### F-12 [LOW] Smaller validation gaps

- **Location**: `src/lib/excel.ts:220-231` (`createAnmeldungenTxt`), `src/app/api/admin/teams/route.ts:58-71`, `src/app/api/aktionen/route.ts:70-90`.
- **Current state**: public free-text names may contain line breaks, so a volunteer can inject extra lines into the Signal text export that experts paste into group chats; `PUT /api/admin/teams` destructures the body without Zod; invalid `wahlkreis`/`datum` query values (`NaN`, `Invalid Date`) make Prisma throw in a handler without `try/catch` → 500.
- **Fix**: reject control characters in `vorname`/`nachname` (`.regex(/^[^\p{Cc}]*$/u)`) and collapse whitespace in the TXT export; parse the team PUT with `teamSchema.extend({ id: z.string().min(1) })`; validate `wahlkreis` numbers and `datum` with Zod or ignore invalid values.

## 7. API Security

Security headers (`next.config.ts`): `X-Frame-Options: DENY` + `frame-ancestors 'none'` on all non-embed routes, `frame-ancestors 'self' <ALLOWED_EMBED_DOMAIN>` only on `/embed/*` (path regex verified), `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Error responses are generic German strings; ZodError details are returned only for 400s.

### F-13 [MEDIUM] Rate limiters are keyed on a client-controlled header and grow without bound

- **Location**: identical copies in `src/app/api/aktionen/route.ts:18-41`, `src/app/api/aktionen/[id]/route.ts:22-48`, `src/app/api/anmeldungen/route.ts:9-49`, `src/app/api/anmeldungen/meine-aktionen/route.ts:8-66`.
- **Current state**: `const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";` — the whole header string is the key; entries are never evicted. Verified locally: the 31st request with `X-Forwarded-For: 203.0.113.7` gets 429, the next one with `203.0.113.8` gets through. Behind Traefik the header becomes `"<spoofed>, <real-ip>"`, still unique per spoofed value.
- **Attack path**: unauthenticated script adds a random `X-Forwarded-For` per request → unlimited signups (F-10, F-21), unlimited `GET /api/anmeldungen/meine-aktionen?email=<anyone>` mails (the per-email limit of 2/15 min still holds, but rotating addresses turns the server into a mailer for arbitrary recipients with the party's sender identity), unlimited scraping of F-3; every new key adds a `Map` entry until the process runs out of memory.
- **Impact**: all four rate limits are ineffective; SMTP quota exhaustion / sender-domain blacklisting; memory-exhaustion DoS.
- **Fix**: create `src/lib/rate-limit.ts` and use it in all four routes (and in F-6):
  ```ts
  export function clientIp(req: Request): string {
    // Traefik appends the peer address as the LAST entry; earlier entries are client-supplied.
    const xff = req.headers.get("x-forwarded-for");
    const last = xff?.split(",").map((s) => s.trim()).filter(Boolean).pop();
    return last || req.headers.get("x-real-ip") || "unknown";
  }
  export function createRateLimiter(limit: number, windowMs: number, maxKeys = 10_000) {
    const map = new Map<string, { count: number; resetAt: number }>();
    return (key: string): boolean => {
      const now = Date.now();
      if (map.size >= maxKeys) for (const [k, v] of map) if (now > v.resetAt) map.delete(k);
      if (map.size >= maxKeys) return true; // fail closed under flood
      const e = map.get(key);
      if (!e || now > e.resetAt) { map.set(key, { count: 1, resetAt: now + windowMs }); return false; }
      return ++e.count > limit;
    };
  }
  ```
- **Why this fix works**: the right-most hop is written by the trusted proxy and cannot be forged by the client; expired entries are purged and the map is capped.
- **Constraints**: **[verify]** that exactly one proxy (Coolify's Traefik) sits in front of the container — send a request with a fake `X-Forwarded-For` in production and log what the app sees before relying on the last hop. If Cloudflare or another proxy is added later, the trusted hop index changes. Keep German 429 messages. Existing `rate-limiting*.test.ts` set `x-forwarded-for` to single IPs and keep working. Upstream candidate.
- **Verification**: new test: requests with `x-forwarded-for: "1.1.1.1, 9.9.9.9"` and `"2.2.2.2, 9.9.9.9"` share one bucket (31st → 429); map size stays ≤ `maxKeys` after 20 000 distinct keys.
- **Scope guard**: do not remove the per-email limiter in `meine-aktionen`; do not switch to an external rate-limit service.

### F-14 [MEDIUM] One-click unsubscribe via GET is triggered by mail link scanners

- **Location**: `src/app/api/anmeldungen/abmelden/route.ts:7-47` (delete at 32); links built in `src/lib/email-templates.ts:46-48`; landing page `src/app/(public)/abmeldung/page.tsx`.
- **Current state**: `GET /api/anmeldungen/abmelden?token=…` deletes the registration immediately.
- **Attack path**: no attacker needed — Microsoft Defender Safe Links, Proofpoint and similar scanners fetch every link in incoming mail. A volunteer with such a mailbox is silently unregistered right after the confirmation, change or reminder mail arrives; the contact person sees an "Abmeldung" in the daily summary.
- **Impact**: integrity loss of registrations (people turn up unregistered or are dropped from reminders); also any prefetching browser/proxy can trigger it.
- **Fix**: make GET non-destructive. `GET /api/anmeldungen/abmelden?token=…` redirects to a new page `/abmeldung/bestaetigen?token=…` that shows the action title (fetched via a new `POST /api/anmeldungen/abmelden/info` or server-side lookup) and one large button "Jetzt von der Aktion abmelden"; the button sends `POST /api/anmeldungen/abmelden` with `{ token }`, which performs the current delete + `EmailLog` entry and returns JSON; the page then shows the existing success text.
- **Why this fix works**: scanners issue GETs only; deletion now requires a POST triggered by a human click.
- **Constraints**: links in already-sent emails keep the same URL and must keep working (they now land on the confirmation page). The page must be plain and clearly worded for older users — one button, no extra steps. German UI strings. Upstream candidate.
- **Verification**: update `cancel-token.test.ts`: GET with a valid token → redirect to `/abmeldung/bestaetigen?token=…` and `anmeldung.delete` **not** called; POST with the token → deleted + `EmailLog` created; POST with an unknown token → 404/redirect to `?fehler=1`.
- **Scope guard**: keep the 256-bit token and the `ABMELDUNG` log entry (the daily summary depends on it); do not require a login.

### F-15 [LOW] CSP allows inline scripts; no HSTS header

- **Location**: `next.config.ts:9-11`; `src/__tests__/security/csp-header.test.ts` ("nonce out of scope per D-04").
- **Current state**: production `script-src 'self' 'unsafe-inline'` — the CSP gives no protection if an XSS sink appears; nonces were deliberately excluded (decision D-04, still a reasonable trade-off because no `dangerouslySetInnerHTML` exists). No `Strict-Transport-Security` is set by the app or documented for Traefik.
- **Fix**: add `{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }` to `sharedHeaders` (production only); revisit nonces when Next.js `proxy`-based nonce support is adopted.

## 8. External Services (Nominatim, SMTP)

Nominatim is called with a constant host and URL-encoded parameters (`URLSearchParams`) — no SSRF. SMTP host comes from env only.

### F-16 [MEDIUM] SMTP does not require TLS on port 587

- **Location**: `src/lib/email.ts:6-14`.
- **Current state**: `secure: process.env.SMTP_SECURE === "true"` with the documented default `SMTP_SECURE=false`, port 587 and no `requireTLS`. Nodemailer then uses STARTTLS only if the server advertises it.
- **Attack path**: an attacker on the network path between the server and the mail provider strips the `STARTTLS` capability → nodemailer authenticates and sends in cleartext.
- **Impact**: disclosure of `SMTP_PASSWORD` (sending as the party) and of every mail body: cancel tokens, daily summaries with volunteer names, emails, phone numbers, Signal handles.
- **Fix**:
  ```ts
  const secure = process.env.SMTP_SECURE === "true";
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587, secure,
    requireTLS: !secure,
    tls: { minVersion: "TLSv1.2" },
    auth: { … },
  });
  ```
- **Why this fix works**: `requireTLS` makes nodemailer abort if STARTTLS is not offered or fails, so credentials and content never travel in cleartext.
- **Constraints**: local development with an empty `SMTP_HOST` must keep "skipping" mail (failures are logged, not thrown). Confirm the production provider supports STARTTLS on 587 before deploying. Upstream candidate.
- **Verification**: unit test that `createTransport` was called with `requireTLS: true` when `SMTP_SECURE` is unset; after deploy, `EmailLog` shows `GESENDET` for a test signup.
- **Scope guard**: do not set `tls.rejectUnauthorized: false` to "fix" a certificate error.

### F-17 [LOW] Nominatim calls have no timeout and no throttle on import

- **Location**: `src/lib/geocoding.ts:22-29`; callers `src/app/api/aktionen/route.ts:166-172`, `src/app/api/aktionen/[id]/route.ts`, `src/app/api/upload/route.ts:138`.
- **Current state**: a hanging Nominatim response hangs the create/edit/import request; import fires one request per row back-to-back (policy: max 1/s); the `User-Agent` reads `ORG_SHORT_NAME`, which is never set (only `NEXT_PUBLIC_ORG_SHORT_NAME` exists).
- **Fix**: pass `signal: AbortSignal.timeout(5000)`; throttle import (F-11); read `NEXT_PUBLIC_ORG_SHORT_NAME` and add a contact URL (`WEBSITE_URL`) to the User-Agent as Nominatim requires.

## 9. Personal Data (DSGVO)

**Inventory.** Volunteers (`Anmeldung`): `vorname`, `nachname`, `email`, `telefon`, `signalName`, `cancelToken`, `createdAt` — and, by context, participation in a party's campaign, i.e. a **political opinion (Art. 9 DSGVO special category)**. Contact persons (`Aktion`): `ansprechpersonName/Email/Telefon`. Accounts (`User`): name, email, bcrypt hash. `EmailLog`: recipient email, type, `aktionId`, status (for `ABMELDUNG` the volunteer's full name). `AktionStatistik`: counts only. Exports: `/api/export` (xlsx/txt with full volunteer PII), daily summary mail to the contact-person address set on the Aktion. Deletion: `cleanup-anmeldungen` deletes registrations 72 h after the action ends and keeps a count — matching the Datenschutzerklärung *for the `anmeldungen` table only*. Backups retain deleted data for the Coolify backup retention (documented in the deployment guide).

### F-18 [HIGH] Public signup reveals whether an email address is registered for an action

- **Location**: `src/app/api/anmeldungen/route.ts:84-107` (unique-violation branch at 102); consumers `src/components/AnmeldeFormular.tsx:113-116`, `src/app/(public)/anmelden/page.tsx:31,64,78-90`, `src/app/embed/aktion/[id]/page.tsx:14,67-91`.
- **Current state**: a duplicate `(aktionId, email)` yields `results: [{ aktionId, error: "Bereits angemeldet" }]`; when every requested ID is a duplicate, **no email is sent**, so the probe is silent exactly when the answer is "yes".
- **Attack path**: unauthenticated `POST /api/anmeldungen` with `{ aktionIds: ["<id>"], email: "target@example.org", vorname: "xx", nachname: "xx", telefon: "030123456", datenschutz: true }` for each public action ID (from `GET /api/aktionen`). "Bereits angemeldet" → the target is registered for that action, silently. "success" → the target is now registered and gets a confirmation mail (noisy, but the attacker already learned "no").
- **Impact**: public disclosure of an individual's participation in party campaign actions (special-category personal data) to anyone who knows their email address — employers, neighbours, political opponents.
- **Fix**: make the response independent of prior registrations.
  1. In the `catch` for the unique violation, load the existing registration (`findUnique({ where: { aktionId_email: { aktionId, email } }, select: { cancelToken: true } })`) and push `{ aktionId, success: true }` to `results`.
  2. Send the confirmation mail only if at least one **new** registration was created; include already-existing registrations (with their existing `cancelToken`) in that mail so the real owner sees the full picture. If all requested actions were duplicates, send nothing.
  3. Remove the "bereits angemeldet" branches from `AnmeldeFormular.tsx`, `anmelden/page.tsx` and `embed/aktion/[id]/page.tsx`; on the success screen add the sentence "Falls du schon angemeldet warst, bleibt deine Anmeldung einfach bestehen."
- **Why this fix works**: the requester receives an identical response and the observable side effects (no mail when nothing new was created) no longer depend on whether the target was already registered; only the mailbox owner learns about existing registrations.
- **Constraints**: this changes visible behaviour for volunteers (the on-screen "bereits angemeldet" hint disappears) — **needs the user's decision** before implementation; wording must stay simple for older users. "Aktion ist bereits voll" is checked before the duplicate check and leaks nothing; keep that order. German strings. Upstream candidate.
- **Verification**: test — mock `anmeldung.create` to throw a unique error → response body equals the body for a fresh registration (`success: true`, same message); `sendEmail` not called when all IDs were duplicates. Manual: register twice with the same email; second response is indistinguishable.
- **Scope guard**: do not remove the `@@unique([aktionId, email])` constraint; do not "fix" this by adding a CAPTCHA only — the oracle needs one request per action.

### F-19 [MEDIUM] `EmailLog` keeps volunteer emails, action links and names forever — contradicting the Datenschutzerklärung

- **Location**: `prisma/schema.prisma:147-157`; writers `src/lib/email.ts:28-55`, `src/app/api/anmeldungen/abmelden/route.ts:35-42`; cleanup `src/app/api/cron/cleanup-anmeldungen/route.ts`; statement `src/app/(public)/datenschutz/page.tsx:158-165`.
- **Current state**: every mail writes `empfaengerEmail` (+ `aktionId` for `AENDERUNG`, `ABSAGE`, `ABMELDUNG`; `ABMELDUNG` also stores `"ABMELDUNG: Vorname Nachname"`). Nothing ever deletes `EmailLog` rows (`grep emailLog.delete` → none). The privacy policy says registration data is deleted 72 h after the action and that afterwards "ein Rückschluss auf einzelne Personen ist … nicht mehr möglich".
- **Attack path**: anyone with database or backup access (operator, Coolify admin, an attacker after a breach) can reconstruct which email addresses signed up, changed or cancelled which action, indefinitely.
- **Impact**: retention of special-category data beyond the stated period; the published privacy statement is factually wrong (Art. 5(1)(e), Art. 13 DSGVO); larger breach impact.
- **Fix**: in `cleanup-anmeldungen` (runs hourly), after the per-Aktion loop:
  ```ts
  const EMAIL_LOG_RETENTION_DAYS = 7;
  const emailLogCutoff = new Date(Date.now() - EMAIL_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count: emailLogsDeleted } = await prisma.emailLog.deleteMany({
    where: { gesendetAm: { lt: emailLogCutoff } },
  });
  ```
  and return `emailLogsDeleted` in the JSON. Also delete `EmailLog` rows with `aktionId = aktion.id` inside the existing per-Aktion transaction. Add one sentence on "Versandprotokolle (E-Mail-Adresse, Art der Nachricht) werden nach 7 Tagen gelöscht" to the Datenschutzerklärung.
- **Why this fix works**: the daily summary only reads today's `ABMELDUNG` rows, so a 7-day window keeps all functionality while bounding retention.
- **Constraints**: the daily summary must still find same-day `ABMELDUNG` logs (window ≥ 1 day). Changing the privacy text is a legal statement — have the Kreisvorstand/DSB confirm the wording. Upstream candidate.
- **Verification**: extend a cron test: `emailLog.deleteMany` called with `gesendetAm.lt` ≈ now − 7 days; manual: insert an old `EmailLog` row locally, `curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3200/api/cron/cleanup-anmeldungen` → row gone.
- **Scope guard**: do not drop the `EmailLog` table or stop logging failures — it is the only delivery audit; do not shorten the 72 h registration rule.

### F-20 [MEDIUM] Registrations made after an action's cleanup are never deleted

- **Location**: `src/app/api/anmeldungen/route.ts:66-82` (only `ABGESAGT` and capacity are checked), `src/app/api/cron/cleanup-anmeldungen/route.ts:24-37` (`statistik: null` at line 27) and `:54-68`.
- **Current state**: the API accepts signups for past actions (the UI hides them, the API does not). Once an Aktion has an `AktionStatistik` row, the cleanup query excludes it, so any later registration for it stays forever.
- **Attack path**: any client posts `aktionIds: ["<id of an action that ended last week>"]`; or a stale browser tab submits after the action. The row is never cleaned up.
- **Impact**: indefinite retention of volunteer PII, contrary to the 72 h promise; statistics undercount.
- **Fix**: (1) in the signup loop, after the existence check, reject actions whose start (`datum` + `startzeit`, Europe/Berlin) has passed with `"Aktion nicht verfügbar"` — extract the comparison used in `GET /api/aktionen` (lines 106-134) into `src/lib/aktion-zeit.ts` (`hatBegonnen(aktion, now)`) and use it in both places. (2) In the cleanup, drop `statistik: null`, select `statistik: { select: { id: true } }`, and in the transaction `update` the existing statistic with `anmeldungenCount: { increment: count }` instead of `create` when it exists.
- **Why this fix works**: no new registrations can attach to past actions, and any that exist are swept on the next hourly run without double-creating statistics.
- **Constraints**: no schema change. German error text. Upstream candidate.
- **Verification**: tests — signup for an Aktion dated yesterday → result error "Aktion nicht verfügbar", no `create`; cleanup with an Aktion that already has a statistic and 1 registration → `aktionStatistik.update` with increment, `anmeldung.deleteMany` called.
- **Scope guard**: keep the 72 h threshold and the transaction; do not delete the Aktion itself.

### F-21 [MEDIUM] No double opt-in — anyone can register any email address

- **Location**: `src/app/api/anmeldungen/route.ts` (registration is active immediately), `src/lib/validators.ts:91-93` (`datenschutz: true` is client-asserted).
- **Current state**: the consent checkbox is ticked by whoever submits the form; the address owner never confirms.
- **Attack path**: an attacker registers `victim@example.org` with an invented name for many actions → the victim receives confirmations and reminders from the party; the invented name, the victim's email and an attacker-chosen phone number are delivered to contact persons and exports.
- **Impact**: processing of a third party's data without consent (no provable consent under Art. 7(1)); unsolicited party mail; polluted volunteer lists.
- **Fix**: add `bestaetigtAm DateTime? @db.Timestamptz(3)` and `bestaetigungsToken String? @unique` to `Anmeldung` via `npx prisma migrate dev --name anmeldung_double_opt_in`; on signup send one mail "Bitte bestätige deine Anmeldung" with a link to a confirmation page (POST button, see F-14); exclude unconfirmed rows from exports, daily summary, reminders and capacity counts; delete unconfirmed rows after 24 h in `cleanup-anmeldungen`.
- **Why this fix works**: only the mailbox owner can activate a registration, which also makes consent provable.
- **Constraints**: significant UX change for an older target audience (an extra step, risk of unconfirmed signups) — **product decision required**; it also mitigates F-18's noisy branch. Schema change via generated migration with `timestamptz`. Upstream candidate.
- **Verification**: tests — fresh signup creates a row with `bestaetigtAm: null` and does not appear in `/api/export`; confirmation POST sets `bestaetigtAm`.
- **Scope guard**: keep the existing `cancelToken` flow for confirmed registrations; do not require an account.

### F-22 [LOW] Registration list returns all columns including cancel tokens

- **Location**: `src/app/api/aktionen/[id]/anmeldungen/route.ts:30-35`.
- **Current state**: `findMany` without `select` sends `cancelToken` to the expert's browser (and browser caches). Experts can delete registrations anyway, but the token is a volunteer credential that should not leave the server.
- **Fix**: `select: { id: true, vorname: true, nachname: true, email: true, telefon: true, signalName: true, createdAt: true }`.

## 10. Logging & Audit Trail

The app writes no request logs and only three `console.*` calls (health check error, invalid `WAHLKREISE_JSON`, one client-side `console.error`); no PII or secret is logged to stdout. `EmailLog.status` stores `FEHLER: <SMTP error message>`, which can include the recipient address — covered by F-19's retention.

### F-23 [MEDIUM] No audit trail for bulk PII exports, account changes and deletions

- **Location**: `src/app/api/export/route.ts`, `src/app/api/export-aktionen/route.ts`, `src/app/api/admin/users/route.ts` (POST/PUT/DELETE), `src/app/api/admin/aktionen/[id]/route.ts`, `src/app/api/aktionen/[id]/anmeldungen/route.ts` (DELETE), `src/app/api/admin/export-stats/route.ts`.
- **Current state**: none of these actions is recorded anywhere.
- **Attack path**: a compromised or departing expert exports all volunteer data of their teams (or, with F-2, of former teams); an admin elevates an account to ADMIN. Afterwards nobody can tell who exported what, when — a reportable breach (Art. 33) cannot be scoped.
- **Impact**: no accountability (Art. 5(2)); incident investigation impossible.
- **Fix**: add `src/lib/audit.ts`:
  ```ts
  export function audit(event: string, actorId: string, details: Record<string, string | number | boolean | null>) {
    console.info(JSON.stringify({ audit: true, event, actorId, at: new Date().toISOString(), ...details }));
  }
  ```
  Call it with IDs and counts only (never names, emails, phone numbers or passwords): `EXPORT_ANMELDUNGEN` (`format`, `aktionId`, `teamId`, `wahlkreisId`, `count`), `EXPORT_AKTIONEN`, `EXPORT_STATISTIK`, `ANMELDUNG_GELOESCHT` (`anmeldungId`, `aktionId`), `USER_ERSTELLT`/`USER_GEAENDERT` (`userId`, changed field names, new `role`/`active`), `USER_GELOESCHT`, `AKTION_ENDGUELTIG_GELOESCHT`.
- **Why this fix works**: Coolify keeps container stdout, so each security-relevant action leaves a timestamped, attributable line without adding personal data to the logs.
- **Constraints**: no schema change needed; if a persistent audit table is preferred later, create it via `npx prisma migrate dev --name audit_log` with `timestamptz` and a retention rule. Check the Coolify log retention period. Upstream candidate.
- **Verification**: unit test spies on `console.info` and asserts one `EXPORT_ANMELDUNGEN` line with `count` and without any email address for an export call.
- **Scope guard**: never log request bodies; never log the password field of `PUT /api/admin/users`.

## 11. Scheduled Jobs (Cron Endpoints)

Three POST endpoints, triggered by Coolify Scheduled Tasks via `curl … http://localhost:3000` inside the container. `cleanup-anmeldungen` runs each Aktion in its own transaction (statistic + delete) and continues after per-Aktion failures.

### F-24 [MEDIUM] Cron authentication fails open when `CRON_SECRET` is unset; comparison is not constant-time

- **Location**: `src/app/api/cron/cleanup-anmeldungen/route.ts:19-22`, `src/app/api/cron/daily-summary/route.ts:8-11`, `src/app/api/cron/send-erinnerungen/route.ts:8-11`; test `src/__tests__/security/cron-auth.test.ts`.
- **Current state**: `if (authHeader !== \`Bearer ${process.env.CRON_SECRET}\`)` — with the variable missing the expected value is the literal string `"Bearer undefined"`. The routes are also reachable from the internet through Traefik (only the in-container `curl` needs them).
- **Attack path**: on a deployment where `CRON_SECRET` was not set (new Kreisverband, renamed variable), an unauthenticated attacker sends `Authorization: Bearer undefined` to `/api/cron/send-erinnerungen` and `/api/cron/daily-summary` repeatedly → every volunteer registered for tomorrow and every contact person receives the mail again on each call (each request runs for minutes because of the 25–45 s delays, so many can run in parallel).
- **Impact**: mass mailing of volunteer PII summaries and reminders on demand (spam, provider quota exhaustion, blacklisting of the party's sender domain); cleanup can be triggered at will (harmless on its own).
- **Fix**: create `src/lib/cron-auth.ts` and use it in all three routes:
  ```ts
  import crypto from "crypto";
  export function isCronAuthorized(req: Request): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) {
      console.error("CRON_SECRET fehlt oder ist zu kurz – Cron-Endpunkte gesperrt");
      return false;
    }
    const given = req.headers.get("authorization") ?? "";
    const a = crypto.createHash("sha256").update(given).digest();
    const b = crypto.createHash("sha256").update(`Bearer ${secret}`).digest();
    return crypto.timingSafeEqual(a, b);
  }
  ```
  Optionally block `/api/cron/*` at the proxy (Coolify: custom Traefik label) since the tasks call `localhost`.
- **Why this fix works**: a missing or short secret now denies every request instead of matching `"Bearer undefined"`, and hashing both sides gives equal-length buffers for a constant-time comparison.
- **Constraints**: the existing secret (`openssl rand -hex 32` = 64 chars) passes the length check; document the minimum in `.env.example` and the Coolify guide. Upstream candidate.
- **Verification**: add to `cron-auth.test.ts`: `vi.stubEnv("CRON_SECRET", "")` + header `Bearer undefined` → 401 for all three routes; 31-char secret → 401.
- **Scope guard**: keep `POST` and the `Bearer` scheme so the documented Scheduled Task commands keep working.

### F-25 [LOW] Mail-sending cron jobs are not idempotent and have no overlap guard

- **Location**: `src/app/api/cron/daily-summary/route.ts:13-169`, `src/app/api/cron/send-erinnerungen/route.ts:17-107`.
- **Current state**: a retried or double-triggered task (Coolify retry, manual run) resends all summaries/reminders; runs can overlap because each takes minutes.
- **Fix**: before sending, check `EmailLog` for an entry of the same `typ` and recipient on the same (Berlin) date and skip it; or keep an in-process `running` flag per route and return 409 while a run is active.

## 12. Frontend

### F-26 [INFO] No XSS sinks; embed messaging is harmless

- **Location**: `src/app/embed/aktion/[id]/page.tsx:17-25`, `next.config.ts:15-50`.
- **Current state**: no `dangerouslySetInnerHTML`, `innerHTML` or `eval` in `src/`; React escapes all API data; no tokens in `localStorage`/`sessionStorage`; client-side role gating in `/admin` and `/dashboard` is backed by API checks. The embed page posts only its height via `postMessage(…, "*")`. `ALLOWED_EMBED_DOMAIN` is inserted into `frame-ancestors` unvalidated — an operator value, but a typo such as `*` would allow framing from anywhere. Optional: validate it as an `https://` origin at build time.

## 13. Dependencies & Supply Chain

`npm audit --omit=dev`: **20 vulnerable packages (4 critical, 13 high, 3 moderate)**; full tree: 36 (4 critical, 17 high, 13 moderate, 2 low). Lockfile committed; the Dockerfile uses `npm ci`; all packages come from the npm registry.

### F-27 [HIGH] Next.js, Auth.js, nodemailer and zod are many security releases behind

- **Location**: `package.json` (`next` 16.1.7, `eslint-config-next` 16.1.7, `next-auth` ^5.0.0-beta.30 → installed beta.30, `nodemailer` ^7.0.7 → 7.0.13, `zod` ^4.3.6, `exceljs` 4.4.0 → `uuid` <11.1.1); `package-lock.json`.
- **Current state** (reachability-adjusted):
  - **next 16.1.7** — fixed only in ≥ 16.4.1 (latest 16.4.6): unauthenticated RCE in the Image Optimization API via AVIF/SVG (GHSA-2xp9-vwfh-vxw4, GHSA-2464-fhr4-w9xw) — the optimizer is **enabled** (`next/image` in `src/components/BrandLogo.tsx`), only local images are configured, exploitability with local SVG/PNG files is **[UNVERIFIED]**; several proxy/middleware bypasses (GHSA-492v-c6pp-mqqv, GHSA-267c-6grr-h53f) — limited impact here because every API route checks the session itself, they only expose dashboard/admin page shells; multiple DoS and cache-poisoning advisories on the public request path.
  - **next-auth 5.0.0-beta.30** — GHSA-8fpg-xm3f-6cx3: on a configuration error (e.g. missing `AUTH_SECRET`) `auth()` returns a truthy error object. Every route here checks `if (!session)` first; most then dereference `session.user.*` and crash (500 — failing closed by accident), but `GET /api/teams` never touches `session.user` and would serve all team names to anyone. Fixed in 5.0.0-beta.32.
  - **nodemailer 7.0.13** — address-parser and header-injection advisories; recipient values come from Zod-validated emails, so reachability is low; fixed in 10.x (major).
  - **zod 4.3.6** — memory exhaustion on oversized collections (relevant to F-10); fixed in 4.6.6.
- **Attack path**: unauthenticated requests to `/_next/image` or other Next.js internals exploiting a published advisory; or a misconfigured redeploy turning the auth check into a fail-open (Auth.js).
- **Impact**: potential remote code execution (server compromise = all volunteer PII and secrets) [UNVERIFIED]; denial of service; auth bypass under misconfiguration.
- **Fix**: `npm install next@16.4.6 eslint-config-next@16.4.6 next-auth@5.0.0-beta.32 zod@^4.6.7`; then `npm install nodemailer@^10` (check the changelog for `createTransport`/`sendMail` changes; the API used here is stable); `npm audit fix` for transitive packages. Remove unused production dependencies `@auth/prisma-adapter` and `node-cron` (F-28), which also removes one critical advisory path. Run `npm run lint`, `npm test`, `npm run build` and verify both themes (`NEXT_PUBLIC_THEME=emerald npm run build && NEXT_PUBLIC_THEME=emerald npx next start -p 3210`).
- **Why this fix works**: the advisories are fixed in those releases; nothing in the app needs patching beyond the version bumps.
- **Constraints**: one commit per upgrade group so a regression can be bisected; failing tests block the Docker build; the upgrade is general (upstream candidate). Next.js minor upgrades can change `proxy` behaviour — re-test login redirects for `/dashboard` and `/admin`.
- **Verification**: `npm audit --omit=dev` reports no critical/high for `next`, `next-auth`, `zod`, `nodemailer`; full test suite green; manual login, signup, export, upload smoke test.
- **Scope guard**: do not switch Auth.js to v4 or to database sessions as part of this; do not run `npm audit fix --force` blindly (it proposes downgrading `exceljs` to 3.4.0).

### F-28 [LOW] No dependency alerting; unused production dependencies; floating base image

- **Location**: no `.github/` (no Dependabot/Renovate); `package.json` (`@auth/prisma-adapter`, `node-cron` are imported nowhere in `src/` or `prisma/`); `Dockerfile:4` (`node:24-bookworm-slim`).
- **Current state**: F-27 accumulated unnoticed; unused packages add audit noise and attack surface; the base image tag floats, so builds are not reproducible and pick up OS patches only on rebuild.
- **Fix**: remove the two unused packages; enable Dependabot security alerts on the fork (or a monthly `npm audit --omit=dev` checklist item); pin the base image by digest and bump it deliberately.

## 14. Testing & Security Regression

132 security test cases in `src/__tests__/security/` (vitest, `node` environment) run inside the Docker build. All mock Prisma and `auth()`, so they verify the **shape** of `where` clauses and status codes, not database behaviour. Covered: 401 on unauthenticated access for most protected routes (`auth-protection`), 401 for EXPERT on `/api/admin/users|teams|stats` (`role-authorization`), team isolation for registration reads, Aktion edit/delete, both exports and bulk recategorisation (`team-isolation`, `admin-teams`), password removal from user responses, cancel-token generation and unsubscribe, cron bearer check with a set secret, CSP header content, HTML escaping in all mail templates, deactivation via the JWT re-check, the four in-memory rate limits and the honeypot.

### F-29 [MEDIUM] The most important controls have no regression test — one test enshrines a leak

- **Location**: `src/__tests__/security/` (all files), especially `data-sanitization.test.ts` ("Ansprechperson-E-Mail ist OK da öffentlich").
- **Current state**: untested: scoping of `DELETE /api/aktionen/[id]/anmeldungen` (F-1); refresh of `role`/`teamIds` (F-2); absence of contact PII in the public list (F-3 — the test explicitly accepts it); uniform signup response (F-18); cron with missing secret (F-24); `cleanup-anmeldungen` logic and `EmailLog` retention (F-19/F-20); `/api/admin/wahlkreise`, `/api/admin/export-stats`, `DELETE /api/admin/aktionen/[id]` role checks; upload limits (F-11).
- **Attack path**: a future refactor (the multi-team change in the last commits shows how quickly `where` logic changes) silently removes or weakens a control; the build stays green.
- **Impact**: regressions in team isolation or PII exposure ship to production unnoticed.
- **Fix**: add the tests named in the Verification fields of F-1, F-2, F-3, F-18, F-19, F-20, F-24, F-11, plus "EXPERT → 401/403" for `GET|PUT /api/admin/wahlkreise`, `GET /api/admin/export-stats`, `DELETE /api/admin/aktionen/[id]`. Change the comment and assertion in `data-sanitization.test.ts` to require absence of `ansprechpersonEmail`/`ansprechpersonTelefon`/`createdById`.
- **Why this fix works**: each control then has a test that fails if the control is removed, and the build gate turns that into a blocked deployment.
- **Constraints**: tests gate the Docker build — keep them deterministic and fast (mocked Prisma, no network). Upstream candidate.
- **Verification**: temporarily revert each fix locally → the matching test fails; `npm test` green with the fix.
- **Scope guard**: do not weaken existing assertions to make new code pass; do not add tests that require a live database to the build gate.

## 15. Deployment & Configuration

Verified good: multi-stage Dockerfile, runtime stage as user `node`, production-only dependencies, `.next` the only writable path; `npm test` gates the image build; `prisma migrate deploy` runs before `next start` and aborts startup on failure (`sh -c "… && exec …"`); database private with the host port bound to `127.0.0.1`; secrets runtime-only; build-time variables declared as `ARG`; daily database backups to S3 with the retention caveat documented; production is set up with `prisma/bootstrap.ts` (no demo accounts, password ≥ 12 chars, deleted from Coolify afterwards). The seed is not reachable from the runtime image in normal operation (`tsx` is a devDependency and nothing invokes `prisma db seed`).

### F-30 [LOW] Legacy deployment guide still instructs seeding production with known passwords

- **Location**: `docs/DEPLOYMENT.md:276-291, 511`.
- **Current state**: tells operators to run `npx prisma db seed` on the production server, creating `admin@…/admin1234` and `expert@…/expert1234`, and describes a systemd/nginx setup this fork does not use.
- **Fix**: replace the section with a pointer to `docs/deployment/coolify-deployment.md` §7 (bootstrap) and a warning never to seed production; fork-specific change (the file comes from upstream — keep it in a separate commit).

---

## Previously Accepted Decisions

No ADRs exist in this repository. Documented design decisions found in `CLAUDE.md`, `docs/` and test comments were treated like ADRs (not re-litigated; assumptions checked):

| Decision | Source | Verdict |
|---|---|---|
| JWT session strategy with 5-minute DB re-check (SEC-04) | `src/lib/auth.ts`, `jwt-invalidation.test.ts` | **Assumption partly broken** — revocation works for `active` only; role/team changes never propagate (F-2). |
| Fire-and-forget email; `sendEmail` never throws, logs to `EmailLog` | `CLAUDE.md` | Holds. Retention of the log is the gap (F-19). |
| Experts may assign any team; must keep one own team when editing others' actions | `CLAUDE.md`, `src/lib/aktion-teams.ts` | Holds; side effect noted in F-4. |
| Contact-person email is public | comment in `data-sanitization.test.ts` | **Contradicted** by the detail endpoint and the public UI, which both hide it (F-3). |
| CSP without nonces ("D-04") | `csp-header.test.ts` | Holds while no HTML sink exists; `unsafe-inline` scripts noted (F-15). |
| Registration data deleted 72 h after the action, only counts kept | Datenschutzerklärung, `cleanup-anmeldungen` | **Broken** by `EmailLog` retention (F-19) and late signups (F-20). |
| Tests gate the Docker build | `Dockerfile`, `CLAUDE.md` | Holds; coverage gaps in F-29. |
| Kreisverband configured via env vars only | `CLAUDE.md` | Holds, except hard-coded domain fallbacks (F-5). |

No prior assessment exists — this report is the baseline; there is no "Changes Since Last Assessment" pass.

## Prioritized Action List

| Prio | Finding | Action | Effort |
|---|---|---|---|
| P1 | F-1 | Scope registration delete to the path Aktion | S |
| P1 | F-3 | Strip contact email/phone/`createdById` from public responses + fix test | S |
| P1 | F-2 | Refresh `role`/`teamIds` in the JWT re-check | S |
| P1 | F-24 | `isCronAuthorized()` — fail closed, constant-time | S |
| P1 | F-27 | Upgrade Next.js, Auth.js, zod, nodemailer; remove unused deps | M |
| P1 | F-18 | Uniform signup response (needs UX decision) | M |
| P1 | F-19 | Delete `EmailLog` rows after 7 days + privacy text | S |
| P2 | F-13 | Shared rate limiter with trusted-hop IP and bounded map | M |
| P2 | F-6 | Login throttling + constant-time failure path | M |
| P2 | F-10 | Bounds on signup payload; one query per request | S |
| P2 | F-20 | Reject signups for started actions; sweep late signups | S |
| P2 | F-14 | Confirmation page + POST for unsubscribe | M |
| P2 | F-16 | `requireTLS` for SMTP | S |
| P2 | F-11 | Upload size/row caps, throttled geocoding | S |
| P2 | F-23 | Audit log lines for exports and account changes | S |
| P2 | F-29 | Regression tests for the controls above | M |
| P3 | F-21 | Double opt-in (product decision) | L |
| P3 | F-5, F-7, F-12, F-15, F-17, F-22, F-25, F-28, F-30 | Hardening items | S each |
| P3 | F-9 | `timestamptz` migration | M |
| P3 | F-4 | Decide expert visibility / co-team removal rule | S |

## Positive Findings

Keep these — a later "fix" must not regress them:

- **Per-route authorization** in every handler (not only in `proxy.ts`), with consistent 401/403 and German messages; all `/api/admin/*` handlers check `ADMIN`.
- **Centralised team scoping** (`expertAktionWhere`, `hasAktionAccess`, `keepsOwnTeam`) with a safe empty-teams fallback ("created by me", never "everything").
- **No mass assignment**: Prisma `create`/`update` use explicit field lists; `role`, `active`, `status`, `createdById` are never taken from the body unchecked.
- **HTML escaping in all mail templates** (`escapeHtml`, `phoneLink`, `encodeURIComponent` for tokens), with tests per template.
- **256-bit cancel tokens** (`crypto.randomBytes(32)`), unique-indexed, not returned by the signup response.
- **Excel exports write user text as strings**, not formulas (verified).
- **Public action detail strips contact email/phone**; password hashes stripped from all user responses (tested).
- **bcrypt cost 12**, deactivation propagates within 5 minutes.
- **Transactional cleanup** with an anonymised statistics snapshot; per-Aktion error isolation.
- **Strict framing policy** (`DENY` + `frame-ancestors 'none'`, scoped exception for `/embed/*` only).
- **Container hardening**: non-root, multi-stage, tests gate the build, migrations abort startup on failure, DB not internet-reachable, no secrets in the repo or its history, no secrets as build args, production bootstrap without demo accounts.
- **Self-hosted fonts and no third-party scripts** (DSGVO).

## Appendix — Attack-Surface Inventory (Step 0)

**Route handlers × guards** (`session` = `auth()` must return a session; `team` = `hasAktionAccess`/`expertAktionWhere`; `ADMIN` = role check):

| Route | Method | Guard | Personal data returned / changed |
|---|---|---|---|
| `/api/aktionen` | GET | none (public) / session → team | contact PII leaked publicly (F-3) |
| `/api/aktionen` | POST | session | creates Aktion |
| `/api/aktionen/[id]` | GET | none; contact PII stripped for anonymous | contact PII to any session (F-4) |
| `/api/aktionen/[id]` | PUT, DELETE | session + team | mails all registrants |
| `/api/aktionen/[id]/anmeldungen` | GET | session + team | volunteer PII incl. `cancelToken` (F-22) |
| `/api/aktionen/[id]/anmeldungen` | DELETE | session + team **on path Aktion only** | F-1 |
| `/api/aktionen/bulk-kategorie` | PATCH | session + team (where) | — |
| `/api/anmeldungen` | POST | none; IP rate limit (F-13), honeypot | creates registration, oracle (F-18) |
| `/api/anmeldungen/abmelden` | GET | 256-bit token | deletes registration (F-14) |
| `/api/anmeldungen/meine-aktionen` | GET | none; IP + per-email limit | mails overview to the address; constant response |
| `/api/export` | GET | session + team (where) | bulk volunteer PII (xlsx/txt) |
| `/api/export-aktionen` | GET | session + team (where) | contact names |
| `/api/upload` | POST | session | creates Aktionen (F-11) |
| `/api/teams` | GET | session | team names |
| `/api/user/teams` | GET | session | own teams |
| `/api/wahlkreise` | GET | none | district names |
| `/api/vorlage` | GET | none | template file |
| `/api/health` | GET | none | `{status}` only |
| `/api/auth/[...nextauth]` | GET, POST | Auth.js (CSRF token on sign-in) | login (F-6) |
| `/api/admin/users` | GET, POST, PUT, DELETE | session + ADMIN | accounts (hash stripped) |
| `/api/admin/teams` | GET, POST, PUT, DELETE | session + ADMIN | — |
| `/api/admin/wahlkreise` | GET, PUT | session + ADMIN | — |
| `/api/admin/stats`, `/api/admin/export-stats` | GET | session + ADMIN | counts only |
| `/api/admin/aktionen/[id]` | DELETE | session + ADMIN | hard delete |
| `/api/cron/cleanup-anmeldungen` | POST | Bearer `CRON_SECRET` (F-24) | deletes registrations |
| `/api/cron/daily-summary` | POST | Bearer `CRON_SECRET` (F-24) | mails volunteer PII to contact persons |
| `/api/cron/send-erinnerungen` | POST | Bearer `CRON_SECRET` (F-24) | mails volunteers |

Pages: `src/proxy.ts` redirects `/dashboard/*` (session) and `/admin/*` (ADMIN); public pages `/`, `/anmelden`, `/abmeldung`, `/meine-aktionen-bestaetigen`, `/datenschutz`, `/impressum`, `/login`, `/embed/aktion/[id]` (frameable from `ALLOWED_EMBED_DOMAIN`).

**Scheduled jobs:** `daily-summary` (19:00 UTC), `cleanup-anmeldungen` (hourly), `send-erinnerungen` (17:00 UTC) — Coolify Scheduled Tasks calling `http://localhost:3000` inside the container.

**Outbound calls:** `https://nominatim.openstreetmap.org/search` (`src/lib/geocoding.ts:22`, address + city, no credentials); SMTP via nodemailer (`src/lib/email.ts`, host/credentials from env). Browser-side: OpenStreetMap tiles (`connect-src`/`img-src`).

---

## Executive Summary

**Verdict: ⚠️ Needs Improvement.** The application has no unauthenticated takeover path and its basic authorization architecture — per-route session and role checks plus centralised team scoping — is sound and tested. The most important risk is the handling of personal data at the edges: the public action list exposes every contact person's email and mobile number (F-3), the public signup form silently confirms whether an email address is registered for a party action (F-18), and an expert can delete registrations of other teams by ID (F-1). Revoking a role or team membership does not reach existing sessions (F-2), and Next.js/Auth.js carry critical advisories (F-27). All P1 items are small, local code changes.

## Statistics

- Route files 25 · route handlers 37 · handlers without session 13 (3 of them secret-gated cron) · public handlers leaking PII 1 · cron jobs 3 · outbound integrations 2 · env vars read 60 (+3 implicit)
- Findings: **CRITICAL 0 · HIGH 5 · MEDIUM 12 · LOW 11 · INFO 2** (30 total)
- `npm audit --omit=dev`: 20 vulnerable packages (4 critical, 13 high, 3 moderate)

## Top Fixes (P1)

1. **F-1** — scope `DELETE /api/aktionen/[id]/anmeldungen` to the path Aktion (S)
2. **F-3** — strip contact email/phone/`createdById` from public action responses (S)
3. **F-2** — refresh `role` and `teamIds` in the 5-minute JWT re-check (S)
4. **F-24** — fail-closed, constant-time cron authentication (S)
5. **F-27** — upgrade Next.js, Auth.js, zod, nodemailer; drop unused deps (M)
6. **F-18** — make the signup response independent of existing registrations (M, needs UX decision)
7. **F-19** — delete `EmailLog` rows after 7 days and align the Datenschutzerklärung (S)
