/**
 * Bezeichnung für die Gebietseinheit, nach der Aktionen gefiltert werden.
 * Default: "Wahlkreis" (Berlin-Mitte). Für andere Wahlen z. B. "Stadtbezirk".
 *
 * NEXT_PUBLIC_WAHLKREIS_LABEL         – Einzahl, z. B. "Stadtbezirk"
 * NEXT_PUBLIC_WAHLKREIS_LABEL_PLURAL  – Mehrzahl (Default: Einzahl + "e")
 * NEXT_PUBLIC_WAHLKREIS_LABEL_SHORT   – Kurzform für enge Stellen
 *                                       (Default: "WK" bzw. die Einzahl, wenn eine eigene gesetzt ist)
 */

export const DEFAULT_WAHLKREIS_LABEL = "Wahlkreis";

export interface WahlkreisLabels {
  singular: string;
  plural: string;
  short: string;
}

export function parseWahlkreisLabels(
  singular: string | undefined,
  plural: string | undefined,
  short: string | undefined,
): WahlkreisLabels {
  const custom = singular?.trim();
  if (!custom) {
    return {
      singular: DEFAULT_WAHLKREIS_LABEL,
      plural: plural?.trim() || "Wahlkreise",
      short: short?.trim() || "WK",
    };
  }
  return {
    singular: custom,
    plural: plural?.trim() || `${custom}e`,
    short: short?.trim() || custom,
  };
}

// NEXT_PUBLIC_*-Variablen müssen wörtlich referenziert werden, damit Next.js sie einbettet
const labels = parseWahlkreisLabels(
  process.env.NEXT_PUBLIC_WAHLKREIS_LABEL,
  process.env.NEXT_PUBLIC_WAHLKREIS_LABEL_PLURAL,
  process.env.NEXT_PUBLIC_WAHLKREIS_LABEL_SHORT,
);

export const WAHLKREIS_LABEL = labels.singular;
export const WAHLKREIS_LABEL_PLURAL = labels.plural;
export const WAHLKREIS_LABEL_SHORT = labels.short;
