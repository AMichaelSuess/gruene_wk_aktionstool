/**
 * Konfigurationstests: Aktions-Kategorien
 *
 * Prüft, dass die zentrale Kategorienliste zum Prisma-Enum passt, dass
 * Excel-Import und Validierung alle Kategorien kennen und dass die frühere
 * Kategorie "Straße" weiterhin als "Infostand" importiert wird.
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { AktionKategorie } from "@prisma/client";
import {
  KATEGORIEN,
  KATEGORIE_VALUES,
  kategorieLabel,
  parseKategorie,
} from "@/lib/kategorien";
import { excelRowSchema } from "@/lib/validators";
import { createVorlageExcel, formatSignalInfo, parseExcelFile } from "@/lib/excel";

const ERWARTET = [
  { value: "HAUSTUER", label: "Haustür" },
  { value: "FLYERN", label: "Flyern" },
  { value: "INFOSTAND", label: "Infostand" },
  { value: "PLAKATIEREN", label: "Plakatieren" },
  { value: "SONSTIGES", label: "Sonstiges" },
];

describe("Kategorienliste", () => {
  it("enthält genau die fünf Kategorien in der Anzeige-Reihenfolge", () => {
    expect(KATEGORIEN).toEqual(ERWARTET);
  });

  it("KATEGORIE_VALUES stimmt mit KATEGORIEN überein", () => {
    expect([...KATEGORIE_VALUES]).toEqual(KATEGORIEN.map((k) => k.value));
  });

  it("stimmt mit dem Prisma-Enum AktionKategorie überein", () => {
    expect([...KATEGORIE_VALUES].sort()).toEqual(Object.values(AktionKategorie).sort());
  });

  it("enthält die frühere Kategorie STRASSE nicht mehr", () => {
    expect(KATEGORIE_VALUES).not.toContain("STRASSE");
  });
});

describe("kategorieLabel", () => {
  it.each(ERWARTET)("$value → $label", ({ value, label }) => {
    expect(kategorieLabel(value)).toBe(label);
  });

  it("gibt unbekannte Werte unverändert zurück", () => {
    expect(kategorieLabel("UNBEKANNT")).toBe("UNBEKANNT");
  });

  it("gibt bei fehlendem Wert einen Leerstring zurück", () => {
    expect(kategorieLabel(null)).toBe("");
    expect(kategorieLabel(undefined)).toBe("");
    expect(kategorieLabel("")).toBe("");
  });
});

describe("parseKategorie", () => {
  it.each(ERWARTET)("erkennt Enum-Wert und Label von $label", ({ value, label }) => {
    expect(parseKategorie(value)).toBe(value);
    expect(parseKategorie(label)).toBe(value);
  });

  it.each([
    ["haustür", "HAUSTUER"],
    ["Haustuer", "HAUSTUER"],
    ["  HAUSTÜR  ", "HAUSTUER"],
    ["Haustürwahlkampf", "HAUSTUER"],
    ["flyern", "FLYERN"],
    ["Flyer", "FLYERN"],
    ["Flyer verteilen", "FLYERN"],
    ["INFOSTAND", "INFOSTAND"],
    ["Infostände", "INFOSTAND"],
    ["plakatieren", "PLAKATIEREN"],
    ["Plakate", "PLAKATIEREN"],
    ["Plakatierung", "PLAKATIEREN"],
    ["sonstige", "SONSTIGES"],
  ])("erkennt Schreibweise %j", (eingabe, erwartet) => {
    expect(parseKategorie(eingabe)).toBe(erwartet);
  });

  it.each(["Straße", "Strasse", "STRASSE", "Straßenwahlkampf"])(
    "ordnet die frühere Kategorie %j dem Infostand zu",
    (eingabe) => {
      expect(parseKategorie(eingabe)).toBe("INFOSTAND");
    }
  );

  it.each(["", "   ", "Quatsch", "Telefonieren"])("lehnt %j ab", (eingabe) => {
    expect(parseKategorie(eingabe)).toBeNull();
  });

  it("lehnt null und undefined ab", () => {
    expect(parseKategorie(null)).toBeNull();
    expect(parseKategorie(undefined)).toBeNull();
  });
});

describe("excelRowSchema: Kategorie", () => {
  const row = {
    titel: "Testaktion",
    datum: "15.04.2026",
    startzeit: "10:00",
    endzeit: "12:00",
    adresse: "Alexanderplatz 1, 10178 Berlin",
    wahlkreis: 1,
    ansprechpersonName: "Max Mustermann",
    ansprechpersonEmail: "max@example.com",
    ansprechpersonTelefon: "030 1234567",
  };

  it.each(KATEGORIE_VALUES)("akzeptiert %s", (kategorie) => {
    expect(excelRowSchema.safeParse({ ...row, kategorie }).success).toBe(true);
  });

  it("lehnt STRASSE ab und nennt alle erlaubten Kategorien", () => {
    const result = excelRowSchema.safeParse({ ...row, kategorie: "STRASSE" });
    expect(result.success).toBe(false);
    const message = result.error!.issues[0].message;
    expect(message).toBe(
      "Kategorie fehlt oder ungültig (erlaubt: Haustür, Flyern, Infostand, Plakatieren, Sonstiges)"
    );
  });
});

describe("formatSignalInfo: Emoji je Kategorie", () => {
  function signal(kategorie?: string) {
    return formatSignalInfo("Mi, 15.04.", "10:00", "12:00", "Test", "Alexanderplatz 1", "Max", kategorie);
  }

  it.each([
    ["Haustür", "🚪"],
    ["Flyern", "📄"],
    ["Infostand", "📢"],
    ["Plakatieren", "🪧"],
    ["Sonstiges", "▶️"],
  ])("%s → %s", (label, emoji) => {
    expect(signal(label)).toContain(`Uhr ${emoji} Test`);
  });

  it("nutzt für unbekannte oder fehlende Kategorien das Sonstiges-Emoji", () => {
    expect(signal("Unbekannt")).toContain("Uhr ▶️ Test");
    expect(signal(undefined)).toContain("Uhr ▶️ Test");
  });
});

describe("Excel-Import: Kategorie-Spalte", () => {
  async function importiere(kategorien: string[]) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Aktionen");
    sheet.addRow(["Titel", "Kategorie"]);
    for (const k of kategorien) sheet.addRow([`Aktion ${k}`, k]);
    const buffer = await workbook.xlsx.writeBuffer();
    return parseExcelFile(buffer as ArrayBuffer);
  }

  it("übersetzt Labels in Enum-Werte, auch die frühere Kategorie Straße", async () => {
    const rows = await importiere(["Haustür", "Flyern", "Infostand", "Plakatieren", "Sonstiges", "Straße"]);
    expect(rows.map((r) => r.kategorie)).toEqual([
      "HAUSTUER",
      "FLYERN",
      "INFOSTAND",
      "PLAKATIEREN",
      "SONSTIGES",
      "INFOSTAND",
    ]);
  });

  it("reicht unbekannte Werte unverändert durch, damit die Vorschau einen Fehler zeigt", async () => {
    const rows = await importiere(["Quatsch"]);
    expect(rows[0].kategorie).toBe("Quatsch");
  });

  it("die Beispielzeile der Vorlage ist ein gültiger Infostand", async () => {
    const vorlage = await createVorlageExcel();
    const rows = await parseExcelFile(new Uint8Array(vorlage).buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0].kategorie).toBe("INFOSTAND");
    expect(excelRowSchema.safeParse(rows[0]).success).toBe(true);
  });
});
