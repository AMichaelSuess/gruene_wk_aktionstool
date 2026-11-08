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
  /** Dezente Fläche, z. B. hinter dem alten Wert in Änderungsmails */
  muted: string;
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

/**
 * Kampagnen-Kopfbereich der Startseite (siehe CampaignHero). Alle Maße in
 * Pixeln des Fotos: Das Pfeil-Raster setzt die Pfeile im Foto fort und muss
 * deshalb zum Foto passen.
 */
export interface HeroConfig {
  /** Foto am rechten Rand (ab 1024 px Breite); null = nur Pfeile */
  photo: string | null;
  width: number;
  height: number;
  /** 45°-Pfeile: Abstand, horizontale Bandbreite, Spitze der Mittellinie */
  arrowPeriod: number;
  arrowBandWidth: number;
  arrowTipX: number;
  arrowTipY: number;
}

export interface ThemeConfig {
  name: ThemeName;
  /**
   * Logo-Bilder für dunkle (Header) und helle Flächen (Login). null = statt
   * eines Bildes wird der Organisationsname als Wortmarke gesetzt.
   */
  logo: { onDark: string; onLight: string } | null;
  /** Kampagnen-Kopfbereich, ersetzt auf der Startseite den Header; null = keiner */
  hero: HeroConfig | null;
  /** Farben für eigene Karten-Marker; null = Standard-Marker von Leaflet */
  mapMarker: { fill: string; stroke: string; dot: string } | null;
  email: EmailTheme;
}

const brutalist: ThemeConfig = {
  name: "brutalist",
  logo: { onDark: "/logo_white.png", onLight: "/logo_green.png" },
  hero: null,
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
    muted: "#F5F1E9",
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
  // Ausschnitt aus dem Website-Header der Kampagne (Personenkampagne-Manual),
  // Raster aus den gelbgrünen Pfeilen im Foto ausgemessen
  hero: {
    photo: "/themes/emerald/hero.jpg",
    width: 640,
    height: 328,
    arrowPeriod: 262,
    arrowBandWidth: 124,
    arrowTipX: 124.5,
    arrowTipY: 143.5,
  },
  mapMarker: { fill: "#003C40", stroke: "#002D2D", dot: "#C8DA20" },
  email: {
    fontFamily: "Archivo, Arial, sans-serif",
    ink: "#002D2D",
    canvas: "#FFFFFF",
    containerBorder: "1px solid #C9D7D6",
    headerBorder: "none",
    cardBorder: "1px solid #C9D7D6",
    badgeBorder: "none",
    dividerBorder: "1px solid #C9D7D6",
    headerBg: "#002D2D",
    headerText: "#FFFFFF",
    headerSubtitle: "#C8DA20",
    primary: "#003C40",
    primaryText: "#FFFFFF",
    warning: "#C8DA20",
    warningText: "#002D2D",
    danger: "#B4004E",
    dangerText: "#FFFFFF",
    muted: "#E8F0EF",
    footerBg: "#003C40",
    footerText: "#FFFFFF",
    footerLink: "#FFD2E8",
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
