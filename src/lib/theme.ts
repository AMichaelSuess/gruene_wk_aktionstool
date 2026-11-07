/**
 * Visuelles Theme der App.
 *
 * NEXT_PUBLIC_THEME wählt das Theme beim Build:
 *   - "brutalist" (Default) – Soft Brutalism im Grünen-CI
 *   - "emerald"             – Design der Leipziger OBM-Kampagne 2027
 *
 * Farben, Schriften, Rahmen, Radien und Schatten der Oberfläche stehen als
 * CSS-Variablen in src/app/globals.css (Selektor :root[data-theme="…"]).
 * Hier liegt nur, was CSS nicht abdecken kann: Logo, Deko-Grafik und die
 * Farben der E-Mail-Templates (E-Mail-Clients kennen keine CSS-Variablen).
 */

export const THEME_NAMES = ["brutalist", "emerald"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export interface EmailTheme {
  fontFamily: string;
  ink: string;
  canvas: string;
  /** CSS-Werte für border: äußerer Rahmen, Header-Unterkante, Karten, Badges, Trennlinien */
  containerBorder: string;
  headerBorder: string;
  cardBorder: string;
  badgeBorder: string;
  dividerBorder: string;
  headerBg: string;
  headerText: string;
  headerSubtitle: string;
  primary: string;
  primaryText: string;
  warning: string;
  warningText: string;
  danger: string;
  dangerText: string;
  footerBg: string;
  footerText: string;
  footerLink: string;
  /** CSS-Wert für text-transform von Überschriften, Labels und Buttons */
  textTransform: "uppercase" | "none";
  radius: string;
  buttonRadius: string;
  /** box-shadow für Karten; "none" für keinen */
  cardShadow: string;
  buttonShadow: string;
}

export interface ThemeConfig {
  name: ThemeName;
  /**
   * Logo-Bilder für dunkle (Header) und helle Flächen (Login). null = statt
   * eines Bildes wird der Organisationsname als Wortmarke gesetzt.
   */
  logo: { onDark: string; onLight: string } | null;
  /** Pfeil-Grafik der Leipziger Kampagne im öffentlichen Header */
  chevrons: boolean;
  /** Farben für eigene Karten-Marker; null = Standard-Marker von Leaflet */
  mapMarker: { fill: string; stroke: string; dot: string } | null;
  email: EmailTheme;
}

const brutalist: ThemeConfig = {
  name: "brutalist",
  logo: { onDark: "/logo_white.png", onLight: "/logo_green.png" },
  chevrons: false,
  mapMarker: null,
  email: {
    fontFamily: "Arial, sans-serif",
    ink: "#000000",
    canvas: "#FFFFFF",
    containerBorder: "3px solid #000000",
    headerBorder: "3px solid #000000",
    cardBorder: "2px solid #000000",
    badgeBorder: "1px solid #000000",
    dividerBorder: "3px solid #000000",
    headerBg: "#005538",
    headerText: "#FFFFFF",
    headerSubtitle: "#FFF17A",
    primary: "#005538",
    primaryText: "#FFFFFF",
    warning: "#FFF17A",
    warningText: "#000000",
    danger: "#E6007E",
    dangerText: "#FFFFFF",
    footerBg: "#000000",
    footerText: "#FFFFFF",
    footerLink: "#FFF17A",
    textTransform: "uppercase",
    radius: "0",
    buttonRadius: "0",
    cardShadow: "4px 4px 0 #000000",
    buttonShadow: "3px 3px 0 #000000",
  },
};

const emerald: ThemeConfig = {
  name: "emerald",
  logo: null,
  chevrons: true,
  mapMarker: { fill: "#014348", stroke: "#002E33", dot: "#D4DD74" },
  email: {
    fontFamily: "Archivo, Arial, sans-serif",
    ink: "#002E33",
    canvas: "#FFFFFF",
    containerBorder: "1px solid #C9D7D6",
    headerBorder: "none",
    cardBorder: "1px solid #C9D7D6",
    badgeBorder: "none",
    dividerBorder: "1px solid #C9D7D6",
    headerBg: "#002E33",
    headerText: "#FFFFFF",
    headerSubtitle: "#D4DD74",
    primary: "#014348",
    primaryText: "#FFFFFF",
    warning: "#D4DD74",
    warningText: "#002E33",
    danger: "#B4004E",
    dangerText: "#FFFFFF",
    footerBg: "#014348",
    footerText: "#FFFFFF",
    footerLink: "#F1CDE0",
    textTransform: "none",
    radius: "12px",
    buttonRadius: "9999px",
    cardShadow: "none",
    buttonShadow: "none",
  },
};

const THEMES: Record<ThemeName, ThemeConfig> = { brutalist, emerald };

export function parseThemeName(value: string | undefined): ThemeName {
  const name = value?.trim().toLowerCase();
  return THEME_NAMES.includes(name as ThemeName) ? (name as ThemeName) : "brutalist";
}

// NEXT_PUBLIC_*-Variablen müssen wörtlich referenziert werden, damit Next.js sie einbettet
export const theme: ThemeConfig = THEMES[parseThemeName(process.env.NEXT_PUBLIC_THEME)];
