# Theme `brutalist`: Soft Brutalism × Grüne CI

The default theme (`NEXT_PUBLIC_THEME` unset or `brutalist`). Token mechanics and the shared component patterns are in [theming.md](theming.md). This document describes what the tokens look like in this theme and why.

---

## 1. Design philosophy

**Soft Brutalism** combines the directness of web brutalism (raw grids, hard borders, no decorative filler) with enough restraint to stay accessible and approachable.

| Principle | Implementation |
|---|---|
| **Clarity through contrast** | 2 px black borders separate every element. Content needs no shadow or color to stand out. |
| **Geometric honesty** | No border radius. 90° corners everywhere. Shape comes from structure, not softening. |
| **Tactile interactivity** | Offset drop shadows make interactive elements feel physically present. Hover and active states simulate pressing a physical button. |
| **Intentional color** | A tight palette with one dominant brand color. Accent colors carry semantic meaning only (warning, danger, info). |
| **Bold, uppercase labels** | All labels, nav items and buttons are uppercase with tracked letter spacing. Typography does the visual work. |

---

## 2. Color palette

The palette follows the Grüne corporate design. The CI names are kept in the right-hand column so the mapping stays traceable.

| Token | Value | CI name | Role |
|---|---|---|---|
| `primary` | `#005538` | Tanne | CTA buttons, active states, headings |
| `primary-hover` | `#006644` | Tanne, light | Hover of primary fills |
| `chrome` | `#005538` | Tanne | Header and footer |
| `accent` | `#FFF17A` | Sonne | Active nav link on the green header |
| `cta` / `cta-ink` | `#005538` / `#FFFFFF` | Tanne | Public "Jetzt anmelden" button (same as primary) |
| `bar` / `bar-ink` | `#FFFFFF` / `#000000` | — | Selection bar |
| `ink` | `#000000` | — | Body text, dark badges |
| `line`, `line-strong` | `#000000` | — | All borders |
| `focus` | `#000000` | — | Focus outline, no offset |
| `canvas` | `#FFFFFF` | — | Page background |
| `muted` | `#F5F1E9` | Sand | Table headers |
| `warning` | `#FFF17A` | Sonne | "Geändert" badge |
| `danger` | `#E6007E` | Magenta | Danger buttons, errors |
| `info` | `#0BA1DD` | Himmel | Info badges and hints |
| `success` | `#008939` | Klee | Progress bars, drop zones |
| `highlight` / `highlight-ink` | `#8ABD24` / `#FFFFFF` | Grashalm | Secondary progress bars |

---

## 3. Typography

| Role | Font | Notes |
|---|---|---|
| Headlines (`font-headline`, `h1`–`h6`) | GrueneType Neue (self-hosted), fallback Barlow Condensed / Arial Narrow | Condensed, weight 700, uppercase, `letter-spacing: 0.02em` |
| Body (`font-sans`) | DM Sans 400/700 (self-hosted) | `line-height: 1.6` |

`case-ui` resolves to `uppercase` and `tracking-ui` to `0.025em`, so labels, buttons, badges and nav items are uppercase with tracking.

---

## 4. Shape

- **Borders:** `border-ui` = 2 px, `*-ui-thick` = 3 px (header bottom, footer top, selection bar), `border-badge` = 1 px. All black.
- **Radius:** every `rounded-*` token is `0`. All elements are square.
- **Focus:** 3 px solid black outline, offset 0.

---

## 5. Shadows and the press effect

The signature of this theme: hard offset shadows with zero blur, which look like a solid second layer behind each element.

| Token | Value | Use |
|---|---|---|
| `shadow-ui-xl` | `8px 8px 0 #000` | Dialogs |
| `shadow-ui-lg` | `6px 6px 0 #000` | Login card |
| `shadow-ui` | `4px 4px 0 #000` | Buttons and cards at rest |
| `shadow-ui-sm` | `2px 2px 0 #000` | Hover state, active nav item |
| `shadow-ui-up` | `0 -4px 0 #000` | Selection bar, bottom sheets |
| `shadow-ui-brand` / `-sm` / `-lg` | `4px` / `2px` / `6px` offset in `#005538` | Outline button, public confirmation cards |
| `shadow-ui-selected` | `4px 4px 0 #005538` | Selected action card |
| `shadow-ui-warning` | `3px 3px 0 #ca8a04` | Warning box on the signup confirmation |

**Press-down effect.** As the shadow shrinks, the element moves in the same direction, like a physical button being pushed:

```
Rest:    shadow-ui      (4px)   no translate
Hover:   shadow-ui-sm   (2px)   press-sm → translate 2px 2px
Active:  shadow-none            press    → translate 4px 4px
```

---

## 6. Signature elements

- Sunflower logo (`/logo_white.png` in the header, `/logo_green.png` on the login page) next to the uppercase organisation name.
- Thick 3 px black rule under the header and above the footer.
- Black email footer with Sonne-yellow links; emails use the same square boxes and offset shadows.
- Leaflet's default blue map markers.

---

*Source: the `:root` block in `src/app/globals.css` and the `brutalist` entry in `src/lib/theme.ts`.*
