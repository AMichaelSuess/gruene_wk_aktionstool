import ExcelJS from "exceljs";
import { parseKategorie } from "@/lib/kategorien";
import { districtConfig } from "@/lib/district-config";
import { WAHLKREIS_LABEL, WAHLKREIS_NUMMERN_ANZEIGEN } from "@/lib/wahlkreis-label";

function kategorieEmoji(kategorie?: string): string {
  switch (kategorie) {
    case "Haustür":
      return "🚪";
    case "Flyern":
      return "📄";
    case "Infostand":
      return "📢";
    case "Plakatieren":
      return "🪧";
    case "Sonstiges":
    default:
      return "▶️";
  }
}

// One entry per line: collapse line breaks and other whitespace in
// values (older records may still contain them), so no one can add lines.
const einzeilig = (s: string | null | undefined) => (s ?? "").replace(/[\s\p{Cc}]+/gu, " ").trim();

export function formatSignalInfo(
  datumMitTag: string,
  startzeit: string,
  endzeit: string,
  titel: string,
  adresse: string,
  ansprechpersonName: string,
  kategorie?: string
): string {
  const emoji = kategorieEmoji(kategorie);
  return `📆 ${datumMitTag}: ${startzeit}-${endzeit} Uhr ${emoji} ${einzeilig(titel)} 📍${einzeilig(adresse)} 👋 mit ${einzeilig(ansprechpersonName)}`;
}

interface ExcelRow {
  titel: string;
  datum: string;
  startzeit: string;
  endzeit: string;
  adresse: string;
  // Nummer oder Name, wird in der Upload-Route einem Wahlkreis zugeordnet
  wahlkreis: number | string;
  kategorie: string;
  ansprechpersonName: string;
  ansprechpersonEmail: string;
  ansprechpersonTelefon: string;
  maxTeilnehmer?: number | null;
  teams?: string[];
}

// Spalte "Teams": mehrere Team-Namen mit Komma oder Semikolon getrennt
export const TEAMS_SPALTE = "Teams";

export function splitTeamNames(value: unknown): string[] {
  return String(value ?? "")
    .split(/[,;]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

const COLUMN_MAP: Record<string, keyof ExcelRow> = {
  "Titel": "titel",
  "Datum": "datum",
  "Startzeit": "startzeit",
  "Endzeit": "endzeit",
  "Adresse": "adresse",
  // Bisheriger Spaltenname bleibt gültig, damit ältere Vorlagen importierbar sind
  "Wahlkreis": "wahlkreis",
  [WAHLKREIS_LABEL]: "wahlkreis",
  "Kategorie": "kategorie",
  "Ansprechperson Name": "ansprechpersonName",
  "Ansprechperson E-Mail": "ansprechpersonEmail",
  "Ansprechperson Telefon": "ansprechpersonTelefon",
  "Max. Teilnehmer": "maxTeilnehmer",
  [TEAMS_SPALTE]: "teams",
  "Team": "teams",
};

function formatDate(value: ExcelJS.CellValue): string {
  if (value instanceof Date) {
    const d = String(value.getDate()).padStart(2, "0");
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const y = value.getFullYear();
    return `${d}.${m}.${y}`;
  }
  return String(value ?? "").trim();
}

function formatTime(value: ExcelJS.CellValue): string {
  if (value instanceof Date) {
    const h = String(value.getUTCHours()).padStart(2, "0");
    const min = String(value.getUTCMinutes()).padStart(2, "0");
    return `${h}:${min}`;
  }
  return String(value ?? "").trim();
}

export function convertDatumToISO(datum: string): string {
  // TT.MM.JJJJ → YYYY-MM-DD
  const match = datum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return datum; // already ISO or unknown format
}

export async function parseExcelFile(buffer: ArrayBuffer): Promise<ExcelRow[]> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(Buffer.from(buffer) as any);
  const sheet = workbook.worksheets[0];

  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell: ExcelJS.Cell) => {
    headers.push(String(cell.value ?? "").trim());
  });

  const rows: ExcelRow[] = [];
  sheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
    if (rowNumber === 1) return;
    const partial: Partial<ExcelRow> = {};

    row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell, colNumber: number) => {
      const header = headers[colNumber - 1];
      const key = COLUMN_MAP[header];
      if (!key) return;

      const value = cell.value;
      if (key === "datum") {
        partial.datum = formatDate(value);
      } else if (key === "startzeit" || key === "endzeit") {
        partial[key] = formatTime(value);
      } else if (key === "wahlkreis") {
        const text = String(value ?? "").trim();
        partial.wahlkreis = typeof value === "number" ? value : /^\d+$/.test(text) ? Number(text) : text;
      } else if (key === "kategorie") {
        // Deutsche Labels ("Haustür", "Infostand") in Enum-Werte übersetzen.
        // Bei unbekannten Werten den Rohwert durchreichen, damit Zod eine
        // verständliche Fehlermeldung für die Vorschau erzeugt.
        partial.kategorie = parseKategorie(value) ?? String(value ?? "").trim();
      } else if (key === "teams") {
        partial.teams = splitTeamNames(value);
      } else if (key === "maxTeilnehmer") {
        const num = parseInt(String(value ?? ""), 10);
        partial.maxTeilnehmer = isNaN(num) ? null : num;
      } else {
        let strVal: string;
        if (
          value !== null &&
          typeof value === "object" &&
          "text" in value &&
          "hyperlink" in value
        ) {
          // ExcelJS CellHyperlinkValue: Excel erstellt mailto-Links für E-Mail-Adressen
          const hyperlink = String((value as { hyperlink: string }).hyperlink);
          strVal = hyperlink.startsWith("mailto:")
            ? hyperlink.slice("mailto:".length)
            : String((value as { text: string }).text);
        } else {
          strVal = String(value ?? "");
        }
        (partial as Record<string, unknown>)[key] = strVal.trim();
      }
    });

    rows.push(partial as ExcelRow);
  });

  return rows;
}

interface AnmeldungExport {
  vorname: string;
  nachname: string;
  email: string;
  telefon?: string | null;
  signalName?: string | null;
  aktionTitel: string;
  aktionDatum: string;
  aktionOrt: string;
  aktionDatumMitTag: string;
  aktionStartzeit: string;
  aktionEndzeit: string;
  aktionAnsprechpersonName: string;
}

export async function createAnmeldungenExcel(anmeldungen: AnmeldungExport[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Anmeldungen");

  sheet.columns = [
    { header: "Vorname", key: "vorname", width: 15 },
    { header: "Nachname", key: "nachname", width: 15 },
    { header: "E-Mail", key: "email", width: 30 },
    { header: "Telefon", key: "telefon", width: 20 },
    { header: "Signal", key: "signal", width: 20 },
    { header: "Aktion", key: "aktion", width: 30 },
    { header: "Datum", key: "datum", width: 12 },
    { header: "Ort", key: "ort", width: 40 },
    { header: "Signal-Info", key: "signalInfo", width: 70 },
  ];

  for (const a of anmeldungen) {
    sheet.addRow({
      vorname: a.vorname,
      nachname: a.nachname,
      email: a.email,
      telefon: a.telefon || "",
      signal: a.signalName || "",
      aktion: a.aktionTitel,
      datum: a.aktionDatum,
      ort: a.aktionOrt,
      signalInfo: formatSignalInfo(a.aktionDatumMitTag, a.aktionStartzeit, a.aktionEndzeit, a.aktionTitel, a.aktionOrt, a.aktionAnsprechpersonName),
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}


export function createAnmeldungenTxt(anmeldungen: AnmeldungExport[]): string {
  return anmeldungen
    .map((a) => {
      const kontakt = a.signalName
        ? `Signal: ${einzeilig(a.signalName)}`
        : a.telefon
        ? `Tel: ${einzeilig(a.telefon)}`
        : "";
      return `${einzeilig(a.vorname)} ${einzeilig(a.nachname)}${kontakt ? ` – ${kontakt}` : ""}`;
    })
    .join("\n");
}

export interface AktionExport {
  titel: string;
  datum: string;
  datumMitTag: string;
  startzeit: string;
  endzeit: string;
  adresse: string;
  wahlkreis: string;
  kategorie: string;
  teams: string;
  status: string;
  anmeldungen: number;
  maxTeilnehmer?: number | null;
  ansprechpersonName: string;
}

export async function createAktionenExcel(aktionen: AktionExport[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Aktionen");

  sheet.columns = [
    { header: "Titel", key: "titel", width: 30 },
    { header: "Datum", key: "datum", width: 12 },
    { header: "Startzeit", key: "startzeit", width: 10 },
    { header: "Endzeit", key: "endzeit", width: 10 },
    { header: "Adresse", key: "adresse", width: 40 },
    { header: WAHLKREIS_LABEL, key: "wahlkreis", width: 25 },
    { header: "Kategorie", key: "kategorie", width: 12 },
    { header: "Teams", key: "teams", width: 30 },
    { header: "Status", key: "status", width: 12 },
    { header: "Anmeldungen", key: "anmeldungen", width: 14 },
    { header: "Max. Teilnehmer", key: "maxTeilnehmer", width: 15 },
  ];

  for (const a of aktionen) {
    sheet.addRow({
      titel: a.titel,
      datum: a.datum,
      startzeit: a.startzeit,
      endzeit: a.endzeit,
      adresse: a.adresse,
      wahlkreis: a.wahlkreis,
      kategorie: a.kategorie,
      teams: a.teams,
      status: a.status,
      anmeldungen: a.anmeldungen,
      maxTeilnehmer: a.maxTeilnehmer ?? "",
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function createAktionenTxt(aktionen: AktionExport[]): string {
  return aktionen
    .map((a) => formatSignalInfo(a.datumMitTag, a.startzeit, a.endzeit, a.titel, a.adresse, a.ansprechpersonName, a.kategorie))
    .join("\n");
}

export interface AuswertungData {
  totalAktionen: number;
  totalAnmeldungenGesamt: number;
  upcomingAktionen: number;
  pastAktionen: number;
  abgesagteAktionen: number;
  anmeldungenByWahlkreis: { wahlkreis: string; nummer: number; count: number }[];
  staendeByTeam: { team: string; count: number }[];
  anmeldungenByTeam: { team: string; count: number }[];
  byKalenderwoche: { kw: number; year: number; staende: number; anmeldungen: number }[];
}

export async function createAuswertungExcel(data: AuswertungData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Zusammenfassung
  const summary = workbook.addWorksheet("Zusammenfassung");
  summary.columns = [
    { header: "Kennzahl", key: "kennzahl", width: 30 },
    { header: "Wert", key: "wert", width: 12 },
  ];
  summary.addRows([
    { kennzahl: "Aktionen gesamt", wert: data.totalAktionen },
    { kennzahl: "Anmeldungen gesamt", wert: data.totalAnmeldungenGesamt },
    { kennzahl: "Bevorstehende Veranstaltungen", wert: data.upcomingAktionen },
    { kennzahl: "Vergangene Veranstaltungen", wert: data.pastAktionen },
    { kennzahl: "Abgesagte Veranstaltungen", wert: data.abgesagteAktionen },
  ]);

  // Sheet 2: Anmeldungen nach Wahlkreis
  // Excel erlaubt maximal 31 Zeichen pro Blattname
  const wkSheet = workbook.addWorksheet(`Anmeldungen nach ${WAHLKREIS_LABEL}`.slice(0, 31));
  wkSheet.columns = [
    ...(WAHLKREIS_NUMMERN_ANZEIGEN ? [{ header: "Nr.", key: "nummer", width: 6 }] : []),
    { header: WAHLKREIS_LABEL, key: "wahlkreis", width: 30 },
    { header: "Anmeldungen", key: "anmeldungen", width: 14 },
  ];
  for (const wk of data.anmeldungenByWahlkreis) {
    wkSheet.addRow({ nummer: wk.nummer, wahlkreis: wk.wahlkreis, anmeldungen: wk.count });
  }

  // Sheet 3: Nach Team
  const teamSheet = workbook.addWorksheet("Nach Team");
  teamSheet.columns = [
    { header: "Team", key: "team", width: 30 },
    { header: "Stände", key: "staende", width: 10 },
    { header: "Anmeldungen", key: "anmeldungen", width: 14 },
  ];
  const anmeldungenTeamMap = new Map(data.anmeldungenByTeam.map((t) => [t.team, t.count]));
  for (const t of data.staendeByTeam) {
    teamSheet.addRow({
      team: t.team,
      staende: t.count,
      anmeldungen: anmeldungenTeamMap.get(t.team) ?? 0,
    });
  }

  // Sheet 4: Nach Kalenderwoche
  const kwSheet = workbook.addWorksheet("Nach Kalenderwoche");
  kwSheet.columns = [
    { header: "KW", key: "kw", width: 6 },
    { header: "Jahr", key: "year", width: 8 },
    { header: "Stände", key: "staende", width: 10 },
    { header: "Anmeldungen", key: "anmeldungen", width: 14 },
  ];
  for (const kw of data.byKalenderwoche) {
    kwSheet.addRow({ kw: kw.kw, year: kw.year, staende: kw.staende, anmeldungen: kw.anmeldungen });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function createVorlageExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Aktionen");

  sheet.columns = [
    { header: "Titel", key: "titel", width: 30 },
    { header: "Datum", key: "datum", width: 12 },
    { header: "Startzeit", key: "startzeit", width: 10 },
    { header: "Endzeit", key: "endzeit", width: 10 },
    { header: "Adresse", key: "adresse", width: 40 },
    { header: WAHLKREIS_LABEL, key: "wahlkreis", width: WAHLKREIS_NUMMERN_ANZEIGEN ? 10 : 20 },
    { header: "Kategorie", key: "kategorie", width: 12 },
    { header: "Ansprechperson Name", key: "ansprechpersonName", width: 20 },
    { header: "Ansprechperson E-Mail", key: "ansprechpersonEmail", width: 25 },
    { header: "Ansprechperson Telefon", key: "ansprechpersonTelefon", width: 20 },
    { header: "Max. Teilnehmer", key: "maxTeilnehmer", width: 15 },
    { header: TEAMS_SPALTE, key: "teams", width: 30 },
  ];

  const beispielWahlkreis = districtConfig.wahlkreise[0];
  sheet.getCell(1, sheet.getColumn("wahlkreis").number).note = WAHLKREIS_NUMMERN_ANZEIGEN
    ? `Nummer oder Name, z. B. „1“ oder „${beispielWahlkreis?.name ?? ""}“.`
    : `Name, z. B. ${districtConfig.wahlkreise.map((wk) => `„${wk.name}“`).join(", ")}.`;

  sheet.getCell(1, sheet.columns.length).note =
    "Optional: Namen der Teams, mit Komma getrennt (z. B. „Team Flyern, Team Ost“). " +
    "Leer lassen = es gelten die Teams, die beim Hochladen ausgewählt sind.";

  sheet.getColumn("datum").style = { numFmt: "DD.MM.YYYY" };
  sheet.getColumn("startzeit").style = { numFmt: "HH:MM" };
  sheet.getColumn("endzeit").style = { numFmt: "HH:MM" };

  sheet.addRow({
    titel: "Infostand Alexanderplatz",
    datum: new Date(2026, 3, 15),
    startzeit: new Date(Date.UTC(1899, 11, 30, 10, 0)),
    endzeit: new Date(Date.UTC(1899, 11, 30, 13, 0)),
    adresse: "Alexanderplatz 1, 10178 Berlin",
    wahlkreis: WAHLKREIS_NUMMERN_ANZEIGEN ? 1 : (beispielWahlkreis?.name ?? 1),
    kategorie: "Infostand",
    ansprechpersonName: "Max Mustermann",
    ansprechpersonEmail: "max@example.com",
    ansprechpersonTelefon: "030 1234567",
    maxTeilnehmer: "",
    teams: "",
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Total uncompressed size declared in an .xlsx (zip) central directory, or
 * null if the buffer is not a readable zip. Lets the upload reject a zip
 * bomb before ExcelJS inflates the whole workbook in memory. ZIP64 entries
 * (sizes >= 4 GB) are reported as Infinity.
 */
export function xlsxUncompressedSize(buffer: ArrayBuffer): number | null {
  const view = new DataView(buffer);
  const len = buffer.byteLength;
  if (len < 22) return null;

  // End of central directory record: last 22 bytes plus an optional comment
  let eocd = -1;
  for (let i = len - 22; i >= Math.max(0, len - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  let total = 0;

  for (let n = 0; n < entries; n++) {
    if (offset + 46 > len || view.getUint32(offset, true) !== 0x02014b50) return null;
    const size = view.getUint32(offset + 24, true);
    if (size === 0xffffffff) return Infinity;
    total += size;
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
  return total;
}
