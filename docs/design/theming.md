# Theming

The app ships with several visual themes. Components never hard-code a look: they use **semantic design tokens** (`bg-primary`, `border-line`, `rounded-card`, `shadow-ui`, `case-ui`, …), and each theme assigns its own values to those tokens.

| Theme | Look | Description |
|---|---|---|
| `brutalist` (default) | Square, 2 px black borders, hard offset shadows, uppercase labels | [theme-brutalist.md](theme-brutalist.md) |
| `emerald` | Rounded, soft shadows, wide grotesque type, chevron graphic | [theme-emerald.md](theme-emerald.md) |

This document covers the mechanism, the token reference and the component patterns shared by all themes. The theme documents describe each theme's look and values.

---

## 1. How it works

```
NEXT_PUBLIC_THEME=emerald            (build time: .env locally, Coolify build variable in production)
        │
        ▼
src/lib/theme.ts                     parses the name → `theme` object (logo, chevrons, map marker, email colors)
        │
        ▼
src/app/layout.tsx                   <html data-theme={theme.name}>
        │
        ▼
src/app/globals.css                  :root { --t-* }                      ← brutalist values (default)
                                     :root[data-theme="emerald"] { --t-* } ← emerald values
                                     @theme inline { --color-primary: var(--t-primary); … }
        │
        ▼
Components                           bg-primary, border-ui, rounded-card, shadow-ui, case-ui, …
```

- **Build-time only.** `NEXT_PUBLIC_THEME` is embedded during `next build` and declared as `ARG` in the `Dockerfile`. Changing it needs a rebuild (Coolify: redeploy), not a restart. Unknown or missing values fall back to `brutalist`.
- **CSS tokens** live in [`src/app/globals.css`](../../src/app/globals.css). Every visual decision is a `--t-*` variable. The `@theme inline` block maps them to Tailwind utilities.
- **Non-CSS settings** live in [`src/lib/theme.ts`](../../src/lib/theme.ts): logo images (or a text wordmark), the chevron band, map marker colors and the email palette.
- **Emails** cannot use CSS variables, so [`src/lib/email-templates.ts`](../../src/lib/email-templates.ts) reads literal values from `theme.email`.

---

## 2. Token reference

### 2.1 Colors

| Utility suffix | Variable | Role | brutalist | emerald |
|---|---|---|---|---|
| `primary` | `--t-primary` | CTA buttons, active states, headings | `#005538` | `#003C40` |
| `primary-hover` | `--t-primary-hover` | Hover of primary fills | `#006644` | `#004C50` |
| `chrome` | `--t-chrome` | Header and footer background | `#005538` | `#002D2D` |
| `accent` | `--t-accent` | Highlight text on chrome (active nav, wordmark) | `#FFF17A` | `#C8DA20` |
| `cta` / `cta-ink` / `cta-hover` | `--t-cta*` | Main public call to action ("Jetzt anmelden") | `#005538` / `#FFF` / `#006644` | `#FFD2E8` / `#002D2D` / `#F6BBD8` |
| `bar` / `bar-ink` | `--t-bar*` | Sticky selection bar on the public page | `#FFF` / `#000` | `#002D2D` / `#FFF` |
| `ink` | `--t-ink` | Body text, dark fills | `#000000` | `#002D2D` |
| `line` | `--t-line` | Container borders and dividers | `#000000` | `#C9D7D6` |
| `line-strong` | `--t-line-strong` | Borders of form controls and clickable chips (≥ 3:1 against white) | `#000000` | `#5C7A7C` |
| `focus` | `--t-focus` | Focus outline | `#000000` | `#003C40` |
| `canvas` | `--t-canvas` | Page background | `#FFFFFF` | `#F5F8F7` |
| `muted` | `--t-muted` | Table headers, subtle fills | `#F5F1E9` | `#E8F0EF` |
| `warning` | `--t-warning` | "Geändert" badge | `#FFF17A` | `#C8DA20` |
| `danger` | `--t-danger` | Danger buttons, errors, "Abgesagt" | `#E6007E` | `#B4004E` |
| `info` | `--t-info` | Info badges and hints | `#0BA1DD` | `#00677F` |
| `success` | `--t-success` | Progress bars, drop zones | `#008939` | `#004C50` |
| `highlight` / `highlight-ink` | `--t-highlight*` | Secondary progress bars and their text | `#8ABD24` / `#FFF` | `#C8DA20` / `#002D2D` |

Use them with any color utility: `bg-primary`, `text-ink`, `border-line-strong`, `divide-line`, `outline-focus`, `accent-primary`, `stroke-accent`, opacity modifiers such as `bg-ink/60`.

`white`, `gray-*`, `red-*` and `green-*` are shared neutrals with the same values in every theme.

### 2.2 Typography

| Token | Variable | brutalist | emerald |
|---|---|---|---|
| `font-sans` (body) | `--t-font-sans` | DM Sans | Archivo |
| `font-headline` | `--t-font-headline` | GrueneType Neue | Archivo, 125 % width |
| `case-ui` | `--t-case` | `uppercase` | `none` |
| `tracking-ui` | `--t-tracking` | `0.025em` | `0` |
| — (h1–h6) | `--t-heading-tracking`, `--t-headline-stretch` | `0.02em`, normal | `0`, `125%` |

`h1`–`h6` get the headline font, `--t-case` and `--t-heading-tracking` from a global rule. That rule is unlayered, so it beats Tailwind utilities on headings.

### 2.3 Shape

| Utility | Variable | Use | brutalist | emerald |
|---|---|---|---|---|
| `border-ui` | `--t-border` | Default border width (also `border-t-ui`, `-b-`, `-l-`, `-r-`, `divide-y-ui`) | `2px` | `1px` |
| `border-t-ui-thick`, `border-b-ui-thick` | `--t-border-thick` | Header/footer and bottom-sheet edges | `3px` | `0` |
| `border-badge` | `--t-border-badge` | Badges and chips | `1px` | `0` |
| `rounded-card` | `--t-radius-card` | Cards, panels, dialogs, tables | `0` | `1rem` |
| `rounded-control` | `--t-radius-control` | Inputs, selects, inline error boxes | `0` | `0.5rem` |
| `rounded-button` | `--t-radius-button` | Buttons, nav items, filter chips, segmented toggles | `0` | pill |
| `rounded-badge` | `--t-radius-badge` | Badges | `0` | pill |

### 2.4 Elevation and interaction

| Utility | Use | brutalist | emerald |
|---|---|---|---|
| `shadow-ui-sm` | Hover state, active nav item | `2px 2px 0 #000` | soft, small |
| `shadow-ui` | Interactive elements at rest | `4px 4px 0 #000` | soft |
| `shadow-ui-lg` | Elevated cards (login) | `6px 6px 0 #000` | soft, larger |
| `shadow-ui-xl` | Dialogs | `8px 8px 0 #000` | soft, largest |
| `shadow-ui-brand`, `-brand-sm`, `-brand-lg` | Outline button, public confirmation cards | brand-colored offset | soft |
| `shadow-ui-selected` | Selected clickable card | `4px 4px 0 #005538` | 2 px emerald ring + soft shadow |
| `shadow-ui-up` | Bottom sheets (negative Y) | `0 -4px 0 #000` | soft, upward |
| `shadow-ui-warning` | Warning boxes | `3px 3px 0 #ca8a04` | soft |
| `press-sm`, `press`, `press-none` | "Pressed" translate on hover/active/disabled | `2px` / `4px` / none | no movement |

The press utilities exist so the brutalist "push the button down" effect can be switched off per theme. Always pair `hover:shadow-ui-sm` with `hover:press-sm` and `active:shadow-none` with `active:press`.

---

## 3. Writing UI

### Rules

1. **Only use tokens for anything theme-specific.** No hex colors, no `border-black`, no `border-2`, no `uppercase`, no `rounded-*` sizes, no arbitrary `shadow-[…]`.
2. **Pick the role, not the look.** A container border is `border-line`. A form control border is `border-line-strong`. A header is `bg-chrome`, not `bg-primary`.
3. **Every bordered surface needs a radius token** (`rounded-card`, `rounded-control`, `rounded-button` or `rounded-badge`). It is `0` in brutalist, so forgetting it only shows up in other themes.
4. **Check both themes.** Build or run with `NEXT_PUBLIC_THEME=emerald` before considering UI work done.
5. **Contrast.** Light accents (`accent`, `warning`, `highlight`, `cta` in emerald) are backgrounds or text on dark surfaces only, never text on white. Text on them uses `ink`, `cta-ink` or `highlight-ink`.
6. **Target audience.** Many volunteers are older and less tech-savvy. Keep labels clear, controls large (`min-h-[44px]` for touch targets) and focus outlines visible.

### Component patterns

These are the class strings the shared components use (see `src/components/ui/`).

**Button** — base, applied to every variant:
```
inline-flex items-center rounded-button justify-center font-bold case-ui tracking-ui transition-all
focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus
disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:press-none
```

| Variant | Classes |
|---|---|
| `primary` | `bg-primary text-white border-ui border-line shadow-ui hover:shadow-ui-sm hover:press-sm active:shadow-none active:press` |
| `secondary` | `bg-white text-ink border-ui border-line shadow-ui hover:shadow-ui-sm hover:press-sm active:shadow-none active:press` |
| `danger` | `bg-danger text-white border-ui border-line shadow-ui hover:shadow-ui-sm hover:press-sm active:shadow-none active:press` |
| `outline` | `bg-white text-primary border-ui border-primary shadow-ui-brand hover:shadow-ui-brand-sm hover:press-sm active:shadow-none active:press` |
| `action` | `bg-white text-ink border-ui border-line hover:border-primary hover:text-primary` |
| `ghost` | `bg-transparent text-primary border-ui border-transparent hover:border-line hover:shadow-ui` |

Sizes: `sm` `px-3 py-1.5 text-sm` · `md` `px-4 py-2 text-base` · `lg` `px-6 py-3 text-lg`

**Public call to action** (selection bar):
```
rounded-button bg-cta text-cta-ink hover:bg-cta-hover font-headline font-bold case-ui px-6 py-3
border-ui border-line shadow-ui hover:shadow-ui-sm hover:press-sm active:shadow-none active:press
```

**Card:** `bg-white rounded-card border-ui border-line p-4 md:p-6`
**Card title:** `font-headline font-bold text-lg case-ui tracking-ui text-primary`
**Elevated card:** add `shadow-ui-lg` (or `shadow-ui-brand-lg` on public confirmation pages)
**Clickable card:** `shadow-ui hover:shadow-ui-sm hover:press-sm transition-all`; selected: `border-primary shadow-ui-selected`

**Input / Select:**
```
w-full px-3 py-2 rounded-control border-ui border-line-strong bg-white transition-shadow
focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus placeholder:text-gray-400
```
Error state: `border-danger` instead of `border-line-strong`; message `mt-1 text-sm font-bold text-danger`.
Label: `text-sm font-bold case-ui tracking-ui text-ink`.

**Badge:** `inline-flex items-center rounded-badge px-2 py-0.5 text-xs font-bold case-ui tracking-ui border-badge border-line` plus one of `bg-gray-100 text-ink` · `bg-primary text-white` · `bg-warning text-ink` · `bg-danger text-white` · `bg-info text-white`.

**Filter chip:** `rounded-button text-xs px-2 py-1 font-bold case-ui tracking-ui border-ui`; active `bg-primary text-white border-line`; idle `bg-white text-ink border-line-strong hover:bg-ink hover:text-white`.

**Dialog:** `<dialog class="backdrop:bg-ink/60 bg-white rounded-card border-ui border-line shadow-ui-xl p-0 max-w-lg w-full mx-4">`, header divider `border-b-ui border-line`.

**Header:** `bg-chrome text-white sticky top-0 z-50 border-b-ui-thick border-line`. Nav links: active `text-accent`, idle `text-white/70 hover:text-white`.
**Footer:** `bg-chrome text-white/70 text-sm border-t-ui-thick border-line`
**Logo:** `<BrandLogo variant="onDark" size={36} />`. It renders nothing when the theme has no logo, so add `wordmarkClass` to the organisation name next to it.
**Chevron band:** `<ChevronBand />`, rendered only when the theme enables it.

**Sidebar:** `w-64 shrink-0 bg-white border-r-ui border-line p-4`. Nav item: `flex items-center gap-3 rounded-button px-3 py-2 text-sm font-bold case-ui tracking-ui border-ui transition-colors`; active `bg-primary text-white border-line shadow-ui-sm`; idle `text-ink border-transparent hover:border-line hover:shadow-ui-sm`.

**Bottom sheet:** `fixed bottom-0 inset-x-0 bg-bar border-t-ui-thick border-line shadow-ui-up`.

**Tables:** wrapper `rounded-card border-ui border-line overflow-hidden shadow-ui`, head `bg-muted border-b-ui border-line`, body `divide-y-ui divide-line`.

---

## 4. Adding a theme

1. **CSS:** in `src/app/globals.css`, add a `:root[data-theme="<name>"] { … }` block that sets **every** `--t-*` variable. Copy the `emerald` block as a starting point. A variable you leave out silently falls back to brutalist.
2. **Fonts:** self-host new fonts in `public/fonts/` with an `@font-face` rule. Do not load them from a font CDN, because that is a DSGVO problem. Check the font license.
3. **Theme module:** in `src/lib/theme.ts`, add the name to `THEME_NAMES` and add a `ThemeConfig` entry with logo, chevrons, map marker and the email palette.
4. **Theme-specific CSS:** put rules beyond tokens (such as heading weights or Leaflet tweaks) under the `[data-theme="<name>"]` selector at the end of `globals.css`.
5. **Docs:** add `docs/design/theme-<name>.md` and a row to the table at the top of this file. Add the value to the `NEXT_PUBLIC_THEME` description in `.env.example` and `docs/deployment/coolify-deployment.md`.
6. **Verify:** build with the new theme and check the public list, map, signup form, login, dashboard, admin overview and one rendered email.

---

## 5. Usage guide for Claude Code

Paste this block into `CLAUDE.md` (or a fork's) so generated UI follows the token system:

```markdown
## Design system: themed tokens

UI is themed (NEXT_PUBLIC_THEME = brutalist | emerald). See docs/design/theming.md.

- Never hard-code theme-specific styling: no hex colors, border-black, border-2, uppercase,
  rounded-<size> or shadow-[…]. Use tokens instead:
  colors bg-/text-/border-{primary, chrome, accent, cta, ink, line, line-strong, muted,
  warning, danger, info, success, highlight}; border-ui / border-*-ui / border-*-ui-thick /
  border-badge; rounded-{card, control, button, badge}; shadow-ui{-sm,-lg,-xl,-brand,-selected,-up};
  case-ui + tracking-ui for labels; hover:press-sm / active:press with the shadow hover pattern.
- Reuse src/components/ui/ (Button, Card, Input, Select, Badge, Dialog) before writing new markup.
- Header/footer: bg-chrome. Form controls: border-line-strong + rounded-control.
- Light accents (accent, warning, highlight, cta) are never text on white.
- Check UI in both themes.
```

---

*Source: `src/app/globals.css`, `src/lib/theme.ts`, `src/components/ui/`. Last checked against the code on 2026-11-08.*
