/**
 * Konfigurationstests: Bezeichnung der Gebietseinheit
 *
 * Prüft, dass "Wahlkreis" über Umgebungsvariablen umbenannt werden kann
 * (z. B. "Stadtbezirk") und die Defaults unverändert bleiben.
 */
import { describe, it, expect } from "vitest";
import {
  findWahlkreis,
  formatWahlkreis,
  formatWahlkreisMitLabel,
  parseNummernAnzeigen,
  parseWahlkreisLabels,
} from "@/lib/wahlkreis-label";

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

describe("parseNummernAnzeigen", () => {
  it("zeigt Nummern ohne Konfiguration an", () => {
    expect(parseNummernAnzeigen(undefined)).toBe(true);
    expect(parseNummernAnzeigen("")).toBe(true);
    expect(parseNummernAnzeigen("true")).toBe(true);
  });

  it("blendet Nummern bei false/0/nein aus", () => {
    for (const wert of ["false", " FALSE ", "0", "nein", "off"]) {
      expect(parseNummernAnzeigen(wert)).toBe(false);
    }
  });
});

describe("formatWahlkreis", () => {
  const ost = { nummer: 3, name: "Ost" };

  it("zeigt Nummer und Name, wenn Nummern angezeigt werden", () => {
    expect(formatWahlkreis(ost, true)).toBe("3: Ost");
    expect(formatWahlkreisMitLabel(ost, "WK", true)).toBe("WK 3: Ost");
  });

  it("zeigt nur den Namen, wenn die Gebiete keine Nummern tragen", () => {
    expect(formatWahlkreis(ost, false)).toBe("Ost");
    expect(formatWahlkreisMitLabel(ost, "Stadtbezirk", false)).toBe("Stadtbezirk Ost");
  });
});

describe("findWahlkreis (Excel-Import)", () => {
  const wahlkreise = [
    { id: "wk-1", nummer: 1, name: "Mitte" },
    { id: "wk-2", nummer: 2, name: "Nordost" },
    { id: "wk-8", nummer: 8, name: "Alt-West" },
  ];

  it("findet per Nummer", () => {
    expect(findWahlkreis(2, wahlkreise)?.id).toBe("wk-2");
    expect(findWahlkreis("8", wahlkreise)?.id).toBe("wk-8");
  });

  it("findet per Name, unabhängig von Groß-/Kleinschreibung und Leerzeichen", () => {
    expect(findWahlkreis("Nordost", wahlkreise)?.id).toBe("wk-2");
    expect(findWahlkreis("  alt-west ", wahlkreise)?.id).toBe("wk-8");
  });

  it("versteht die Schreibweisen aus Oberfläche und Export", () => {
    expect(findWahlkreis("Wahlkreis Mitte", wahlkreise)?.id).toBe("wk-1");
    expect(findWahlkreis("WK 2", wahlkreise)?.id).toBe("wk-2");
    expect(findWahlkreis("8: Alt-West", wahlkreise)?.id).toBe("wk-8");
  });

  it("liefert nichts für Unbekanntes oder leere Zellen", () => {
    expect(findWahlkreis("Süd", wahlkreise)).toBeUndefined();
    expect(findWahlkreis(5, wahlkreise)).toBeUndefined();
    expect(findWahlkreis("", wahlkreise)).toBeUndefined();
    expect(findWahlkreis(undefined, wahlkreise)).toBeUndefined();
  });
});
