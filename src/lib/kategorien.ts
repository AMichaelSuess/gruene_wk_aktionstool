/**
 * Zentrale Konfiguration der Aktions-Kategorien.
 * Die Werte entsprechen dem Prisma-Enum `AktionKategorie`.
 */

export interface KategorieConfig {
  value: string;
  label: string;
}

export const KATEGORIEN: KategorieConfig[] = [
  { value: "HAUSTUER", label: "Haustür" },
  { value: "FLYERN", label: "Flyern" },
  { value: "INFOSTAND", label: "Infostand" },
  { value: "PLAKATIEREN", label: "Plakatieren" },
  { value: "SONSTIGES", label: "Sonstiges" },
];

export const KATEGORIE_VALUES = ["HAUSTUER", "FLYERN", "INFOSTAND", "PLAKATIEREN", "SONSTIGES"] as const;

export function kategorieLabel(value: string | null | undefined): string {
  if (!value) return "";
  const found = KATEGORIEN.find((k) => k.value === value);
  return found ? found.label : value;
}

/**
 * Tolerante Eingabe-Erkennung für Excel-Import und URL-Parameter.
 * Akzeptiert Enum-Werte ("HAUSTUER"), deutsche Labels ("Haustür", "Infostand")
 * sowie umlautfreie Schreibweisen ("Haustuer") — jeweils case-insensitiv.
 * Gibt bei unbekannten Werten `null` zurück.
 */
export function parseKategorie(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

  if (!normalized) return null;

  switch (normalized) {
    case "haustuer":
    case "haustuere":
    case "haustuerwahlkampf":
      return "HAUSTUER";
    case "flyern":
    case "flyer":
    case "flyer verteilen":
      return "FLYERN";
    case "infostand":
    case "infostaende":
    // Frühere Kategorie "Straße" — heißt jetzt "Infostand".
    case "strasse":
    case "strassenwahlkampf":
      return "INFOSTAND";
    case "plakatieren":
    case "plakate":
    case "plakatierung":
      return "PLAKATIEREN";
    case "sonstiges":
    case "sonstige":
      return "SONSTIGES";
    default:
      return null;
  }
}
