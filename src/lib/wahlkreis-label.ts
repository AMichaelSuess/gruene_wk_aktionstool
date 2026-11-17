/**
 * Bezeichnung für die Gebietseinheit, nach der Aktionen gefiltert werden.
 * Default: "Wahlkreis" (Berlin-Mitte). Für andere Wahlen z. B. "Stadtbezirk".
 *
 * NEXT_PUBLIC_WAHLKREIS_LABEL         – Einzahl, z. B. "Stadtbezirk"
 * NEXT_PUBLIC_WAHLKREIS_LABEL_PLURAL  – Mehrzahl (Default: Einzahl + "e")
 * NEXT_PUBLIC_WAHLKREIS_LABEL_SHORT   – Kurzform für enge Stellen
 *                                       (Default: "WK" bzw. die Einzahl, wenn eine eigene gesetzt ist)
 * NEXT_PUBLIC_WAHLKREIS_NUMMERN       – "false", wenn die Gebiete keine Nummern tragen
 *                                       (z. B. Leipziger Stadtbezirke). Die Oberfläche zeigt dann
 *                                       nur Namen; die Nummer bestimmt intern nur die Reihenfolge.
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
export const WAHLKREIS_NUMMERN_ANZEIGEN = parseNummernAnzeigen(process.env.NEXT_PUBLIC_WAHLKREIS_NUMMERN);

export function parseNummernAnzeigen(value: string | undefined): boolean {
  return !["false", "0", "nein", "no", "off"].includes(value?.trim().toLowerCase() ?? "");
}

interface WahlkreisAnzeige {
  nummer: number;
  name: string;
}

/** "3: Ost" bzw. nur "Ost", wenn die Gebiete keine Nummern tragen */
export function formatWahlkreis(wk: WahlkreisAnzeige, mitNummer = WAHLKREIS_NUMMERN_ANZEIGEN): string {
  return mitNummer ? `${wk.nummer}: ${wk.name}` : wk.name;
}

/** "WK 3: Charité, …" bzw. "Stadtbezirk Ost" */
export function formatWahlkreisMitLabel(
  wk: WahlkreisAnzeige,
  label = WAHLKREIS_LABEL_SHORT,
  mitNummer = WAHLKREIS_NUMMERN_ANZEIGEN,
): string {
  return `${label} ${formatWahlkreis(wk, mitNummer)}`;
}

function normalisieren(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function regexEscape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Findet den Wahlkreis zu einer Excel-Zelle. Erlaubt sind die Nummer ("3"),
 * der Name ("Ost", Groß-/Kleinschreibung egal) und die Schreibweisen der
 * Oberfläche und Exporte ("Stadtbezirk Ost", "WK 3", "3: Charité, …").
 */
export function findWahlkreis<T extends WahlkreisAnzeige>(
  value: number | string | null | undefined,
  wahlkreise: T[],
): T | undefined {
  if (typeof value === "number") return wahlkreise.find((wk) => wk.nummer === value);

  const text = normalisieren(value ?? "");
  if (!text) return undefined;

  const nachName = (t: string) => wahlkreise.find((wk) => normalisieren(wk.name) === t);
  const praefixe = [...new Set([WAHLKREIS_LABEL, WAHLKREIS_LABEL_SHORT, DEFAULT_WAHLKREIS_LABEL, "WK"])]
    .map((p) => regexEscape(normalisieren(p)))
    .join("|");
  const ohneLabel = text.replace(new RegExp(`^(${praefixe})\\.?\\s+`), "");

  const treffer = nachName(text) ?? nachName(ohneLabel);
  if (treffer) return treffer;

  const nummer = ohneLabel.match(/^(\d+)(?=$|\s*[:–-])/);
  return nummer ? wahlkreise.find((wk) => wk.nummer === Number(nummer[1])) : undefined;
}
