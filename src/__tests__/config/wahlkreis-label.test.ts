/**
 * Konfigurationstests: Bezeichnung der Gebietseinheit
 *
 * Prüft, dass "Wahlkreis" über Umgebungsvariablen umbenannt werden kann
 * (z. B. "Stadtbezirk") und die Defaults unverändert bleiben.
 */
import { describe, it, expect } from "vitest";
import { parseWahlkreisLabels } from "@/lib/wahlkreis-label";

describe("parseWahlkreisLabels", () => {
  it("verwendet ohne Konfiguration 'Wahlkreis' / 'Wahlkreise' / 'WK'", () => {
    expect(parseWahlkreisLabels(undefined, undefined, undefined)).toEqual({
      singular: "Wahlkreis",
      plural: "Wahlkreise",
      short: "WK",
    });
    expect(parseWahlkreisLabels("  ", "", "")).toEqual({
      singular: "Wahlkreis",
      plural: "Wahlkreise",
      short: "WK",
    });
  });

  it("leitet Mehrzahl und Kurzform aus einer eigenen Einzahl ab", () => {
    expect(parseWahlkreisLabels("Stadtbezirk", undefined, undefined)).toEqual({
      singular: "Stadtbezirk",
      plural: "Stadtbezirke",
      short: "Stadtbezirk",
    });
  });

  it("übernimmt explizit gesetzte Mehrzahl und Kurzform", () => {
    expect(parseWahlkreisLabels(" Region ", "Regionen", "Reg.")).toEqual({
      singular: "Region",
      plural: "Regionen",
      short: "Reg.",
    });
  });
});
