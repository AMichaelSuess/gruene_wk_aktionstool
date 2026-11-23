# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Campaign action coordination platform ("Aktionskoordination") for BÜNDNIS 90/DIE GRÜNEN Berlin-Mitte. Manages campaign actions (Aktionen), volunteer registrations (Anmeldungen), Excel import/export, and email notifications.

**Domain language is German** — models, fields, and UI strings use German terminology throughout.

## Development Commands

This fork runs natively (no DDEV): Node.js 24 via nvm (`.nvmrc`) and a shared local PostgreSQL 17 container on `localhost:5432` (database `gruene_aktionen`).

```bash
npm run dev -- -p 3200                        # Start Next.js dev server (VS Code task "Dev: Next.js" auto-starts it)
npm run build                                 # Production build
npm run lint                                  # ESLint
npm test                                      # Run all tests (vitest)
npm run e2e                                   # End-to-end tests (Playwright, own DB and port 3300)
npx prisma migrate dev --name <n>             # Create migration
npx prisma migrate reset                      # Reset DB + reseed
npx prisma studio --port 3201                 # DB browser
```

Run a single test file:
```bash
npx vitest run src/__tests__/security/auth-protection.test.ts
```

The app runs at `http://localhost:3200` (must match `NEXTAUTH_URL` in `.env`).

Test credentials (after seeding):
- Admin: `admin@gruene-mitte.de` / `admin1234`
- Expert: `expert@gruene-mitte.de` / `expert1234`

## Architecture

**Stack:** Next.js 16 (App Router) · TypeScript · PostgreSQL + Prisma · NextAuth.js v5 · Tailwind CSS v4 · nodemailer/SMTP (email) · ExcelJS

### Route Structure

Page URLs are English (UI text stays German): plural lists, `/new`, `/[id]`, sub-lists under their parent.

- `src/app/(public)/` — public pages: `/` (action list), `/signup?actions=…`, `/unsubscribe?token=…` (the link in emails), `/my-signups?email=…`, `/privacy`, `/imprint`
- `src/app/(auth)/` — `/login`
- `src/app/embed/` — `/embed/actions/[id]`, sign-up form for iframes
- `src/app/manage/` — internal area (login required): `/manage/actions` (`/new`, `/[id]`, `/[id]/signups`), `/manage/statistics`, `/manage/users`, `/manage/account` for experts and admins; `/manage/teams`, `/manage/districts` (Wahlkreise/Stadtbezirke) and `/manage/users/new|[id]` for admins only (enforced in `src/proxy.ts`)
- `src/app/api/` — REST endpoints: auth, action CRUD, export (Excel/Signal), upload, cron jobs

API routes (English, resource-style; JSON fields stay German like the Prisma model):
- `/api/actions` — list (public with `?public=true`), create, `PATCH` bulk category; `/api/actions/[id]` read/update, `DELETE` = hard delete without emails (ADMIN); `POST /api/actions/[id]/cancel` sets ABGESAGT and emails the volunteers
- `/api/actions/[id]/signups` — signups of one action, `DELETE …/signups/[signupId]` (EXPERT+)
- `/api/actions/export`, `/api/actions/import`, `/api/actions/import-template` — Excel/Signal export, Excel import and template (EXPERT+)
- `/api/signups` — public sign-up; `/api/signups/lookup` and `/api/signups/unsubscribe` — unsubscribe via cancelToken (POST, token in the body); `/api/signups/send-overview` — email a volunteer their signups; `/api/signups/export` — export signups (EXPERT+)
- `/api/statistics`, `/api/statistics/export` — statistics (experts: own teams)
- `/api/me`, `/api/me/password`, `/api/me/teams` — own account
- `/api/users`, `/api/users/[id]` — list (experts: members of their teams), create/update/delete (ADMIN)
- `/api/teams`, `/api/teams/[id]` — list (ADMIN also gets Wahlkreis and counts), create/update/delete (ADMIN)
- `/api/districts`, `/api/districts/[id]` — public list (ADMIN also gets counts), update (ADMIN)
- `/api/cron/daily-summary`, `/api/cron/cleanup-signups`, `/api/cron/send-reminders` — cron jobs

### Data Model

Core entities in `prisma/schema.prisma`:
- **User** (ADMIN | EXPERT roles) → belongs to Teams via UserTeam
- **Team** → belongs to Wahlkreis; linked to Aktionen many-to-many via AktionTeam (an Aktion can belong to several teams, e.g. a topic team plus a local team)
- **Wahlkreis** — electoral district
- **Aktion** — campaign action with geocoordinates, contact person, status (AKTIV/ABGESAGT/GEAENDERT)
- **Anmeldung** — volunteer registration, unique per (aktionId, email), has `cancelToken` for self-service unsubscribe
- **EmailLog** — audit trail for sent emails (types: BESTAETIGUNG, AENDERUNG, ABSAGE, TAEGLICHE_UEBERSICHT, ABMELDUNG, ERINNERUNG)
- **AktionStatistik** — snapshot preserved when an Aktion is deleted (for historical reporting)

### Key Lib Modules

- `src/lib/auth.ts` — NextAuth config, JWT strategy, role-based session
- `src/lib/db.ts` — Prisma client singleton
- `src/lib/email.ts` — nodemailer SMTP email sending, always logs to EmailLog
- `src/lib/email-templates.ts` — HTML email template functions (`anmeldebestaetigungEmail`, `aenderungsEmail`, `absageEmail`, `tagesUebersichtEmail`, `erinnerungsEmail`)
- `src/lib/excel.ts` — ExcelJS import parser and export generation (Excel + Signal-text)
- `src/lib/geocoding.ts` — address-to-coordinates via Nominatim
- `src/lib/validators.ts` — Zod schemas for all models
- `src/lib/theme.ts` — active visual theme (from `NEXT_PUBLIC_THEME`): logo, campaign hero, map marker, email palette

### Theming

The UI is themed. `NEXT_PUBLIC_THEME` (build time) selects `brutalist` (default, Soft Brutalism in Grüne CI) or `emerald` (Leipzig OBM campaign 2027). The root layout sets `<html data-theme>`; `src/app/globals.css` defines every visual value as a `--t-*` variable per theme and maps them to Tailwind tokens. Email templates read literal colors from `theme.email`. Full reference: `docs/design/theming.md`; per-theme docs: `docs/design/theme-brutalist.md`, `docs/design/theme-emerald.md`.

### Authorization Pattern

Role checks happen at the API route level. Experts can only access their own team's data (team isolation). The middleware at `src/proxy.ts` (exported as `middleware`) handles route protection — it proxies auth checks rather than directly importing NextAuth (due to Edge runtime constraints).

### Cron Jobs

`/api/cron/daily-summary`, `/api/cron/cleanup-signups`, and `/api/cron/send-reminders` are protected by `Authorization: Bearer <CRON_SECRET>`. Triggered externally via server cron or curl.

## Tests

Two layers:

- **Vitest** (`src/__tests__/`, `npm test`, runs in the Docker build): unit tests and route handler tests with mocked `auth()` and Prisma — auth protection, role authorization, data sanitization, input validation, team isolation, rate limiting, cron auth. Environment `node` (no jsdom), see `vitest.config.ts`. `src/__tests__/routing/route-links.test.ts` checks that every path in the code (`fetch`, `href`, `router.push`, email links) resolves to a page, API route or file in `public/`.
- **Playwright** (`e2e/`, `npm run e2e`, local only): the main flows in a browser against a production build. `e2e/prepare-db.ts` resets the database `<name>_e2e` (from `DATABASE_URL`, refuses any other name), runs the seed and adds the actions from `e2e/fixtures.ts`. The build goes to `.next-e2e` and runs on port 3300, so a dev server on 3200 is unaffected. Mail goes to a local sink that drops it (logged as `FEHLER` in `EmailLog`). A test fails on any browser console error; expected ones are allowed per test via `erlaubteFehler`. `E2E_SKIP_BUILD=1` reuses the last build.

## Environment Variables

See `.env.example`. Key variables:
- `DATABASE_URL` — PostgreSQL connection (local: `postgresql://postgres:<pw>@localhost:5432/gruene_aktionen`)
- `NEXTAUTH_SECRET` — JWT signing key (min 32 chars)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` — SMTP credentials (leave empty to skip email in local dev)
- `EMAIL_FROM`, `EMAIL_FROM_NAME` — sender identity
- `CRON_SECRET` — bearer token for cron endpoints
- `NEXT_PUBLIC_THEME` — visual theme, `brutalist` (default) or `emerald`; baked in at build time

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Aktionskoordination – BÜNDNIS 90/DIE GRÜNEN Berlin-Mitte**

Eine Web-App zur Koordinierung und Anmeldung von Aktiven bei Wahlkampf-Aktionen für BÜNDNIS 90/DIE GRÜNEN Berlin-Mitte. Freiwillige (häufig ältere Mitglieder) können sich über eine öffentliche Seite für Aktionen anmelden; Experten verwalten Aktionen über ein geschütztes Dashboard; Admins verwalten Teams und Nutzer. Die App verarbeitet personenbezogene Daten (Name, E-Mail, Telefon, Signal-Handle) und unterliegt der DSGVO.

**Core Value:** Freiwillige können sich einfach und sicher für Wahlkampf-Aktionen anmelden — zuverlässig, ohne technische Hürden, datenschutzkonform.

### Constraints

- **Tech Stack:** Bestehender Stack (Next.js, Prisma, NextAuth, Tailwind) — kein Austausch von Core-Dependencies
- **Sprache:** UI und Domänensprache ist Deutsch — bleibt so
- **DSGVO:** Alle Änderungen, die personenbezogene Daten betreffen, müssen DSGVO-konform bleiben
- **Zielgruppe:** UI-Änderungen müssen für ältere, weniger technikaffine Nutzer verständlich sein — keine cleveren Tricks, klare Beschriftungen
- **Kein Double-Opt-in (bewusst):** Anmeldungen gelten sofort, ohne Bestätigungslink – ein zusätzlicher Schritt wäre für die Zielgruppe eine Hürde. Akzeptiertes Risiko: Fremde können eine E-Mail-Adresse anmelden. Abgemildert durch Rate-Limiting, Honeypot und eine einheitliche Antwort, die bestehende Anmeldungen nicht verrät
- **CSP ohne Nonces (bewusst, D-04):** Die Content-Security-Policy erlaubt in Produktion `script-src 'self' 'unsafe-inline'`, weil Next.js eigene Inline-Skripte einfügt und Nonces jede Seite dynamisch rendern müssten. Akzeptiert, solange es keine XSS-Senke gibt: kein `dangerouslySetInnerHTML`/`innerHTML`, kein aus Daten gebautes `href`/`src`, kein Rendern von gespeichertem HTML oder Markdown. Wer so etwas einführt, muss die Entscheidung neu treffen (Nonce-CSP über `src/proxy.ts`), denn dann hätte ein XSS-Fehler im Dashboard die vollen Export-Rechte der eingeloggten Person. `src/__tests__/security/csp-header.test.ts` hält den Stand fest
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.9.3 - All application code (strict mode enabled, `noEmit: true`, `isolatedModules: true`)
- CSS - Tailwind utility classes compiled via PostCSS
## Runtime
- Node.js >=20.9.0 (requirement from Next.js; local dev uses v25.8.1)
- npm (lockfile version 3)
- Lockfile: `package-lock.json` present and committed
## Frameworks
- Next.js 16.4.6 - Full-stack React framework using App Router
- React 19.2.3 / react-dom 19.2.3 - UI rendering
- NextAuth.js 5.0.0-beta.32 (`next-auth`) - Session management with JWT strategy
- Tailwind CSS 4.2.1 - Utility-first CSS via `@tailwindcss/postcss` plugin
- PostCSS configured in `postcss.config.mjs`
- Prisma 6.19.2 (client + CLI) - Schema-first ORM, auto-generated on `postinstall`
- Vitest 4.1.0 - Test runner, `node` environment, no jsdom
- Config: `vitest.config.ts`
- `tsx` 4.21.0 - TypeScript execution for seed scripts (`prisma/seed.ts`)
- ESLint 9 with `eslint-config-next` 16.4.6 (core-web-vitals + TypeScript presets)
- Config: `eslint.config.mjs`
## Key Dependencies
- `zod` 4.6.7 - Runtime validation and schema definition for all model inputs (`src/lib/validators.ts`)
- `bcryptjs` 3.0.3 - Password hashing for credential authentication
- `date-fns` 4.1.0 - Date formatting utilities
- `exceljs` 4.4.0 - Excel import (parsing uploaded .xlsx files) and export (generating .xlsx reports)
- `nodemailer` 10.6.0 - SMTP email delivery for registration confirmations, changes, reminders, and daily summaries
- `leaflet` 1.9.4 + `react-leaflet` 5.0.0 - Interactive map rendering for action locations
## TypeScript Configuration
- `strict: true` — full strict mode
- `target: ES2017`
- `moduleResolution: bundler`
- `paths: { "@/*": ["./src/*"] }` — `@/` maps to `src/`
- `incremental: true`
## Next.js Configuration
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
## Development Environment
- Project name: `gruene-aktionen`
- Webserver: nginx-fpm
- PHP version: 8.4 (container base; not used by the app)
- PostgreSQL 16
- Next.js dev server exposed on container port 3000 → https port 3001
- App URL: `https://gruene-aktionen.ddev.site:3001`
- `post-start` hooks: `npm install`, `npx prisma generate`
## Configuration
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_SECRET` — JWT signing secret (min 32 chars required)
- `NEXTAUTH_URL` — canonical app URL
- `AUTH_TRUST_HOST=true` — required for DDEV/proxy setups
- SMTP credentials: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`
- `EMAIL_FROM`, `EMAIL_FROM_NAME` — sender identity
- `CRON_SECRET` — bearer token protecting cron endpoints
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## German Domain Language
- `Aktion` — campaign action
- `Anmeldung` — volunteer registration
- `Wahlkreis` — electoral district
- `Ansprechperson` — contact person
- `Vorname` / `Nachname` — first / last name
- `Datenschutz` — privacy consent
- `Absage` — cancellation
- `Abmeldung` — unsubscribe/deregistration
- `Erinnerung` — reminder
- `Aenderung` — change/modification
- `Tageszeit` — time of day (filter)
- `Uebersicht` — overview/summary
- Umlaut-free spellings in code: `aenderungsEmail`, `absageEmail`, `tagesUebersichtEmail`
- Prisma schema and API response fields match German: `ansprechpersonName`, `ansprechpersonEmail`, `ansprechpersonTelefon`, `createdById`
- Error messages returned from API in German: `"Nicht autorisiert"`, `"Kein Zugriff"`, `"Aktion nicht gefunden"`, `"Serverfehler"`
- Status enum values are German uppercase strings: `AKTIV`, `ABGESAGT`, `GEAENDERT`
## Naming Patterns
- React page files: `page.tsx` (Next.js convention)
- Route handler files: `route.ts`
- Layout files: `layout.tsx`
- Component files: PascalCase, descriptive German names — `AktionCard.tsx`, `AnmeldeFormular.tsx`, `FilterBar.tsx`
- UI primitive files: PascalCase English — `Button.tsx`, `Input.tsx`, `Card.tsx`, `Badge.tsx`, `Dialog.tsx`, `Select.tsx`
- Lib modules: lowercase kebab-free single word — `auth.ts`, `db.ts`, `email.ts`, `excel.ts`, `geocoding.ts`, `validators.ts`
- Template file: `email-templates.ts` (hyphenated exception)
- React components: PascalCase — `DashboardPage`, `EditAktionPage`, `AnmeldeFormular`
- Event handlers: `handle` prefix — `handleSubmit`, `handleCancel`, `handleTouchStart`
- Form update helpers: `updateForm`
- Lib functions: camelCase verbs — `sendEmail`, `geocodeAddress`, `mockAuth`, `createRequest`
- Email template functions: camelCase German names — `anmeldebestaetigungEmail`, `aenderungsEmail`, `absageEmail`, `tagesUebersichtEmail`
- camelCase throughout
- German domain values use German names: `aktionen`, `anmeldungen`, `wahlkreise`, `teamIds`
- Boolean states follow `is`/`has` pattern: `isAdmin`, `isExpanded`, `loading`, `saving`
- Unused destructured variables: discarded with `_` — `const { password: _, ...user } = result`
- `interface` for component props and plain data shapes — `ButtonProps`, `AktionInfo`, `SendEmailParams`
- Named type aliases for union types — `ButtonVariant`, `ButtonSize`
- `z.infer<typeof schema>` for Zod-derived types — `LoginInput`, `AktionInput`, `AnmeldungInput`
- Interfaces are defined inline in the file where they are first used (no separate type files)
- Local interfaces use German domain field names matching Prisma schema exactly
## TypeScript Usage
- `@/*` maps to `src/*` — used throughout: `import { auth } from "@/lib/auth"`, `import Button from "@/components/ui/Button"`
- Avoid. When unavoidable (dynamic Prisma `where` objects, form body destructuring), suppress with inline comment:
- There are 4 such suppressions in the codebase, all in API route handlers for Prisma `where` objects.
- `as unknown as ReturnType<typeof vi.fn>` — used in tests to type-check mocked Prisma methods
- `as any` — used for route handler params in tests (`req as any`)
- `token.sub!` — non-null assertion used once in NextAuth JWT callback
## Import Organization
## Component Patterns
- All interactive components and pages are marked `"use client"` at the top
- Server-only modules (`lib/auth.ts`, `lib/db.ts`, `lib/email.ts`) have no directive
- Layout files that use client hooks (`useSession`, `usePathname`, `useState`) are marked `"use client"`
- Single `form` state object per form, updated with a generic `updateForm` helper
- Separate error state variables for each distinct error type: `error`, `contactError`, `signalError`
- `const [loading, setLoading] = useState(true)` — page-level loading
- `const [saving, setSaving] = useState(false)` — submit-specific loading
- Render guard: `if (loading) return <div>Lade...</div>`
- Client-side `useEffect` + `fetch` — no React Query or SWR
- Multiple parallel fetches: `Promise.all([fetch(...), fetch(...)])`
## Styling & Theming
All UI must work in every theme. See `docs/design/theming.md` for the token table and component class patterns.
- **Never hard-code theme-specific styling:** no hex colors, `border-black`, `border-2`, `uppercase`/`tracking-wide`, `rounded-<size>` or arbitrary `shadow-[…]` in components.
- **Use semantic tokens by role:**
  - Colors: `primary`, `primary-hover`, `chrome` (header/footer), `accent` (highlight on chrome), `cta`/`cta-ink`, `bar`/`bar-ink`, `ink`, `line` (containers), `line-strong` (form controls, clickable chips), `focus`, `canvas`, `muted`, `warning`, `danger`, `info`, `success`, `highlight`/`highlight-ink`
  - Borders: `border-ui`, `border-{t,b,l,r}-ui`, `border-{t,b}-ui-thick`, `border-badge`, `divide-y-ui`
  - Radius: `rounded-card` (cards, panels, dialogs, tables), `rounded-control` (inputs, selects), `rounded-button` (buttons, nav items, chips), `rounded-badge`
  - Elevation: `shadow-ui-sm|ui|ui-lg|ui-xl`, `shadow-ui-brand*`, `shadow-ui-selected`, `shadow-ui-up`; hover pattern `shadow-ui hover:shadow-ui-sm hover:press-sm active:shadow-none active:press`
  - Labels/buttons/badges: `case-ui tracking-ui`; headings: `font-headline`
- **Every bordered surface needs a radius token.** It is `0` in brutalist, so a missing one is only visible in other themes.
- **Reuse `src/components/ui/`** (Button, Card, Input, Select, Badge, Dialog, Toaster/`toast` for results of list actions; form errors stay inline), `BrandLogo` (renders nothing when the theme uses a wordmark; pair the org name with `wordmarkClass`) and `CampaignHero` (via `PublicHeader`).
- **Contrast:** light accents (`accent`, `warning`, `highlight`, `cta` in emerald) are fills or text on dark surfaces, never text on white.
- **New visual values** go into every theme block in `globals.css` (a missing `--t-*` silently falls back to brutalist); email colors go into `theme.email` in `src/lib/theme.ts`.
- **Verify UI changes in both themes**, e.g. `NEXT_PUBLIC_THEME=emerald npm run build && NEXT_PUBLIC_THEME=emerald npx next start -p 3210`.
- **Fonts are self-hosted** in `public/fonts/` (DSGVO: no font CDNs).
## API Route Patterns
## Validation
- One schema per entity: `loginSchema`, `userSchema`, `teamSchema`, `aktionSchema`, `anmeldungSchema`, `excelRowSchema`
- Validation messages are in German: `"Bitte gib eine gültige E-Mail-Adresse ein"`, `"Titel muss mindestens 3 Zeichen lang sein"`
- Inferred TypeScript types exported alongside schemas: `type AktionInput = z.infer<typeof aktionSchema>`
- Complex cross-field validation using `.refine()`: telefon or signalName must be present
## Error Handling
- Wrap Prisma/validation calls in `try/catch`
- Specifically check `error.name === "ZodError"` for 400 vs generic 500
- Do not re-throw — always return a `NextResponse.json` with an appropriate status
- `sendEmail` catches all errors internally, logs to `EmailLog` with `FEHLER:` prefix, returns `false`
- Callers do not need to catch email errors
- `setError(...)` on failed API calls, displayed inline
- No global error boundaries observed
## Prisma Client
## Comments
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Single Next.js 16 app serving both UI (React Server/Client Components) and backend (API Route Handlers)
- No separate backend process — all server logic lives in `src/app/api/` route handlers
- Role-based access control enforced at the API layer, not the middleware layer (middleware only handles route redirects)
- All database access goes through a shared Prisma singleton (`src/lib/db.ts`)
- Frontend pages use client-side fetch to call internal API routes — there are no Server Actions in use
## Layers
- Purpose: Unauthenticated volunteer-facing pages
- Location: `src/app/(public)/`
- Contains: Action listing, registration form, privacy policy, impressum
- Depends on: `src/app/api/actions`, `src/app/api/signups`, `src/app/api/districts`
- Used by: End-users (volunteers)
- Purpose: Expert (campaign team) action management
- Location: `src/app/manage/actions/`
- Contains: Action list, create/edit forms, registrant view
- Depends on: All `/api/actions`, `/api/signups/export`, `/api/actions/import`, `/api/me/teams`, `/api/districts` endpoints
- Used by: Users with EXPERT or ADMIN role
- Purpose: Full platform administration
- Location: `src/app/manage/` (statistics, users, teams, districts)
- Contains: Statistics, team CRUD, user CRUD, district settings
- Depends on: `/api/users`, `/api/teams`, `/api/districts`, `/api/statistics` plus the action endpoints
- Used by: Users with ADMIN role only
- Purpose: All server-side logic, data access, business rules
- Location: `src/app/api/`
- Contains: Route handlers organized by resource (`actions`, `signups`, `statistics`, `me`, `districts`, `teams`, `admin/*`, `cron/*`)
- Depends on: `src/lib/` modules (db, auth, email, excel, validators, geocoding)
- Used by: UI layers via `fetch()`
- Purpose: Shared utilities and integrations
- Location: `src/lib/`
- Contains: Auth config, Prisma client, email sending, email templates, Excel parsing/generation, geocoding, Zod validators
- Depends on: External services (SMTP, Nominatim), Prisma, NextAuth
- Used by: API layer exclusively
- Purpose: Reusable UI components
- Location: `src/components/`
- Contains: Domain components (`AktionCard`, `AktionMap`, `AnmeldeFormular`, `ExcelUpload`, `FilterBar`, `SelectionBar`) and primitives in `src/components/ui/`
- Depends on: Nothing from `src/lib/` directly — all data comes via props or internal fetch
- Used by: Page components in all three UI layers
## Data Flow
- No global client-side state store (no Redux, Zustand, etc.)
- Session state managed by NextAuth `SessionProvider` in `src/app/providers.tsx`; consumed via `useSession()` in client components
- Page-level state is local React state (`useState`)
- Data fetching is imperative `fetch()` in `useEffect` hooks, not React Query or SWR
## Key Abstractions
- Purpose: Restrict EXPERTs to only their team's data
- Implementation: `session.user.teamIds` (array of team IDs) embedded in JWT at login (`src/lib/auth.ts`)
- Enforcement: list/export queries use `expertAktionWhere()` and single-Aktion handlers use `hasAktionAccess()` from `src/lib/aktion-teams.ts` (access = member of any assigned team, or creator). Experts may assign any team; when editing someone else's Aktion they must keep one of their own teams (`keepsOwnTeam()`) and may only remove their own teams (`removesForeignTeam()`; only the creator or an ADMIN removes others). Without access, `GET /api/actions/[id]` returns the public shape (no contact email/phone, no `createdById`), also to logged-in experts
- Examples: `src/app/api/actions/route.ts`, `src/app/api/actions/[id]/route.ts`, `src/app/api/signups/export/route.ts`
- Purpose: Single source of truth for all input shapes
- Location: `src/lib/validators.ts`
- Schemas: `loginSchema`, `userSchema`, `teamSchema`, `aktionSchema`, `anmeldungSchema`, `excelRowSchema`
- Pattern: Every API POST/PUT parses body with `schema.parse(body)` and catches `ZodError` → 400 response
- Purpose: Notify volunteers of registration and changes; notify contact persons of daily summaries
- Sending: `src/lib/email.ts` (`sendEmail()`) wraps nodemailer, always writes to `EmailLog` regardless of success/failure
- Templates: `src/lib/email-templates.ts` — named export functions per type (`anmeldebestaetigungEmail`, `aenderungsEmail`, `absageEmail`, `tagesUebersichtEmail`, `erinnerungsEmail`)
- Purpose: Retain historical participation counts when `Anmeldung` records are deleted or when an `Aktion` is hard-deleted would be blocked
- Note: `AktionStatistik.aktionId` is `onDelete: SetNull`, so an admin hard-delete of an `Aktion` keeps its statistik record (with `aktionId` null)
## Entry Points
- Location: `src/app/(public)/page.tsx`
- Triggers: Any unauthenticated browser request to `/`
- Responsibilities: Renders filterable action list and registration form
- Location: `src/app/api/auth/[...nextauth]/route.ts`
- Triggers: All `/api/auth/*` requests (login, session, signout)
- Responsibilities: Delegates to NextAuth config in `src/lib/auth.ts`
- Location: `src/app/layout.tsx`
- Responsibilities: Wraps entire app in `SessionProvider` via `src/app/providers.tsx`
## Error Handling
- 401 returned when `auth()` returns null (no session) — used consistently across all protected routes
- 403 returned when session exists but role/team check fails
- 400 returned on `ZodError` with `{ error: "Validierungsfehler", details: error }`
- 404 returned when Prisma `findUnique` returns null
- 500 returned as catch-all for unexpected errors (message: "Serverfehler")
- Email send failures are silently logged to `EmailLog` (return value not checked at call sites — fire-and-forget pattern)
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

## Fork Notes

This repository is a fork of `maassfm/gruene_wk_aktionstool` (remote `upstream`, push disabled). Where the generated sections above mention DDEV, Node v25 or `https://gruene-aktionen.ddev.site:3001`, the native setup under "Development Commands" applies instead. Production runs as a Docker container on Coolify (`Dockerfile`, deployed from the `production` branch), not via systemd/Nginx as described in `docs/DEPLOYMENT.md` — see `docs/deployment/coolify-deployment.md`. New production databases are set up with `prisma/bootstrap.ts`, never with the seed.

- **Commit messages:** Conventional Commits in English (`feat:`, `fix:`, `docs:`, `chore:`, `build:`, `test:`, `refactor:` …), imperative subject, body explains why.
- **Workflow:** trunk-based on `main`, no PRs. Pull upstream changes with `git fetch upstream && git merge upstream/main` (merge, never rebase).
- **Upstream candidates:** keep general fixes (bugs, tests, features useful to other Kreisverbände) in separate commits from fork-specific changes, so they can be cherry-picked onto a branch from `upstream/main` for a PR.
- **Keep the diff small:** configure the Kreisverband via environment variables (`.env` locally, Coolify in production), never by changing code. Avoid repo-wide reformatting.
- **Tests gate the Docker build:** `npm test` runs inside the image build, so a failing test blocks every deployment.
- **Build-time variables:** `NEXT_PUBLIC_*`, `ORG_FULL_NAME` and `ALLOWED_EMBED_DOMAIN` are baked in at build time and must be declared as `ARG` in the `Dockerfile`; a new variable of that kind needs an `ARG` there too.
