# Theme `emerald`: Leipzig OBM-Kampagne 2027

Activated with `NEXT_PUBLIC_THEME=emerald`. Based on the design brief for the campaign of the Leipzig mayoral candidate in 2027 ("Einer wie Leipzig", agency: zitronengrau). Token mechanics and the shared component patterns are in [theming.md](theming.md).

---

## 1. Design idea

The campaign look is calm and confident: deep emerald surfaces, a fresh yellow-green and a soft pink as accents, very wide and heavy headlines, and a row of arrows ("chevrons") as the key visual. The app adapts it for a working tool:

| Campaign element | In the app |
|---|---|
| Emerald backgrounds, dark emerald website menu | Dark emerald header/footer (`chrome`), emerald buttons (`primary`) |
| Yellow-green arrows on emerald | Chevron band below the public header, lime wordmark, lime active nav link |
| Pink pill button with ▶ ("Mehr erfahren") | Pink pill "Jetzt anmelden" on the dark selection bar (`cta`) |
| Wide grotesque "Obviously" | Archivo at 125 % width for headings |
| Sentence case, no hard frames | No uppercase, 1 px light borders, rounded corners, soft shadows |

---

## 2. Color palette

Values were measured from the PDF swatches. Ask the agency for the official values before relying on the last digit.

| Brief name | Value | Brief usage | Tokens |
|---|---|---|---|
| Weiß | `#FFFFFF` | Text on photos and dark backgrounds, background | `white`, card surfaces |
| Gelbgrün | `#D4DD74` | Arrow element, backgrounds | `accent`, `warning`, `highlight` |
| Emerald | `#014348` | Backgrounds | `primary`, `focus` |
| Emerald, lighter | `#015457` | Arrow element on emerald | `primary-hover`, `success` |
| Emerald, darker | `#002E33` | Text, website menu | `chrome`, `ink`, `bar`, `cta-ink`, `highlight-ink` |
| Rosa | `#F1CDE0` | Text, backgrounds | `cta` (hover `#E8B6D0`) |

Additions that are not in the brief:

| Token | Value | Why |
|---|---|---|
| `canvas` | `#F5F8F7` | Very light emerald tint, so white cards stand out without hard borders |
| `muted` | `#E8F0EF` | Table headers |
| `line` | `#C9D7D6` | Subtle container borders |
| `line-strong` | `#5C7A7C` | Form controls need ≥ 3:1 contrast against white (WCAG 1.4.11) |
| `danger` | `#B4004E` | Deep raspberry, related to the pink; about 7:1 on white |
| `info` | `#00677F` | Teal, distinguishable from the emerald |

### Contrast rules

- Gelbgrün and Rosa are **never text on white** (about 1.4:1). Use them as fills or as text on emerald.
- Text on Gelbgrün and Rosa is dark emerald (`#002E33`).
- Emerald and dark emerald on white, and white on either, are well above 7:1.

---

## 3. Typography

The campaign typeface is **Obviously** (OH no Type Co, commercial): Regular for body text, Black for H1, Bold for H2. Until a web license is available, the theme uses **Archivo** (SIL Open Font License), a variable font with weight 100–900 and width 62–125 %. It is self-hosted in `public/fonts/` with its license in `Archivo-OFL.txt`.

| Role | Setting |
|---|---|
| H1 | Archivo, width 125 %, weight 900 |
| H2–H6, `font-headline` | Archivo, width 125 %, weight 700 |
| Body | Archivo, normal width (100 %), 400/700 |
| Labels, buttons, badges | Sentence case (`case-ui` = `none`), no letter spacing |

Body text stays at normal width on purpose: the wide cut is harder to read in long text, especially for older volunteers. To follow the brief more strictly, set `font-stretch` on `body` under `[data-theme="emerald"]`.

To switch to Obviously later, add its `@font-face` rules and put `"Obviously"` first in `--t-font-headline` (and `--t-font-sans` if wanted).

---

## 4. Shape

- **Borders:** `border-ui` = 1 px in `line` (light) or `line-strong` (controls). No thick rules (`*-ui-thick` = 0). Badges have no border.
- **Radius:** cards 1rem, inputs 0.5rem, buttons and badges fully rounded (pill).
- **Focus:** 3 px emerald outline with a 2 px offset.

---

## 5. Elevation and interaction

Soft, emerald-tinted shadows (`rgb(0 46 51 / …)`) replace the hard offsets. Elements do not move on hover (`press*` = 0). Hover feedback comes from color changes and a slightly smaller shadow.

A selected action card gets a 2 px emerald ring on top of its 1 px border (`shadow-ui-selected`), so the selection is as obvious as in the brutalist theme.

---

## 6. Signature elements

- **Wordmark instead of logo:** the theme has no logo image. The organisation name is set in the headline font in Gelbgrün on the dark header. Add image paths to `logo` in `src/lib/theme.ts` to use a logo instead.
- **Chevron band:** a 40 px emerald band with Gelbgrün arrows below the public header ([`ChevronBand.tsx`](../../src/components/ChevronBand.tsx)).
- **Dark selection bar:** the sticky "N Aktionen ausgewählt" bar is dark emerald, so the pink pill button reads like the campaign website's call to action.
- **Map markers:** emerald pins with a Gelbgrün dot.
- **Emails:** dark emerald header without logo, Gelbgrün subtitle, rounded cards without shadows, emerald footer with pink links.

---

## 7. Open points

- Official color values and the Obviously web license (agency: zitronengrau).
- Whether the KV Leipzig logo should appear in the header instead of the wordmark.
- Native browser checkboxes and the date picker are only partly themed (color via `accent-primary`).

---

*Source: the `:root[data-theme="emerald"]` block in `src/app/globals.css` and the `emerald` entry in `src/lib/theme.ts`. Design brief: "Design OBM-Kampagne 2027" (PDF).*
