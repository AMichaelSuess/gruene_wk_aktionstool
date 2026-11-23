import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExcelFile, convertDatumToISO, xlsxUncompressedSize } from "@/lib/excel";
import { excelRowSchema, type ExcelRowInput } from "@/lib/validators";
import { geocodeAddress } from "@/lib/geocoding";
import { normalizeTeamIds, teamsExist, UNBEKANNTES_TEAM_FEHLER } from "@/lib/aktion-teams";
import { WAHLKREIS_LABEL, findWahlkreis, formatWahlkreis } from "@/lib/wahlkreis-label";
import { audit, logServerError } from "@/lib/audit";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MB unpacked
const MAX_ROWS = 2000;
// Geocoding ist auf 1 Anfrage/s gedrosselt und die Warteschlange ist fuer alle
// gemeinsam. Ohne Grenze wuerde ein grosser Import das Anlegen und Bearbeiten
// von Aktionen fuer alle anderen bis zu ~35 Minuten aufhalten.
const MAX_GEOCODED_ADDRESSES = 100;
const DATEI_ZU_GROSS = "Datei zu groß (höchstens 5 MB)";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  // Reject oversized requests before the form data is buffered
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: DATEI_ZU_GROSS }, { status: 413 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: DATEI_ZU_GROSS }, { status: 413 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "Bitte eine Excel-Datei im Format .xlsx hochladen" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();

    // A small zip can expand to gigabytes; check the declared size first
    const unpacked = xlsxUncompressedSize(buffer);
    if (unpacked === null) {
      return NextResponse.json({ error: "Die Datei ist keine gültige Excel-Datei (.xlsx)" }, { status: 400 });
    }
    if (unpacked > MAX_UNCOMPRESSED_BYTES) {
      return NextResponse.json({ error: DATEI_ZU_GROSS }, { status: 413 });
    }

    const rows = await parseExcelFile(buffer);
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Zu viele Zeilen (höchstens ${MAX_ROWS} pro Datei)` },
        { status: 400 }
      );
    }

    // Spalte "Wahlkreis" (Nummer oder Name) einem vorhandenen Eintrag zuordnen
    const wahlkreise = await prisma.wahlkreis.findMany({
      select: { id: true, nummer: true, name: true },
      orderBy: { nummer: "asc" },
    });
    const rowWahlkreisIds = new Map<number, string>();

    // Validate each row
    const results = rows.map((row, index) => {
      const wahlkreis = findWahlkreis(row.wahlkreis, wahlkreise);
      if (wahlkreis) rowWahlkreisIds.set(index, wahlkreis.id);
      const validation = excelRowSchema.safeParse({ ...row, wahlkreis: wahlkreis?.nummer });
      return {
        index,
        row,
        valid: validation.success,
        errors: validation.success
          ? []
          : validation.error.issues.map((e) =>
              e.path[0] === "wahlkreis" ? wahlkreisFehler(row.wahlkreis, wahlkreise) : e.message
            ),
      };
    });

    // Check for past/today dates — only future dates (from tomorrow) are allowed
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    for (const result of results) {
      if (result.valid) {
        const isoDate = convertDatumToISO(result.row.datum);
        const date = new Date(isoDate);
        if (date < tomorrow) {
          result.valid = false;
          result.errors.push("Datum muss in der Zukunft liegen (ab morgen)");
        }
      }
    }

    // Team-Namen aus der Spalte "Teams" in IDs uebersetzen (Gross-/Kleinschreibung egal)
    const alleTeams = await prisma.team.findMany({ select: { id: true, name: true } });
    const teamIdByName = new Map(alleTeams.map((t) => [t.name.trim().toLowerCase(), t.id]));
    const rowTeamIds = new Map<number, string[]>();

    for (const result of results) {
      if (!result.valid || !result.row.teams?.length) continue;
      const ids: string[] = [];
      for (const name of result.row.teams) {
        const teamId = teamIdByName.get(name.toLowerCase());
        if (teamId) {
          ids.push(teamId);
        } else {
          result.valid = false;
          result.errors.push(`Unbekanntes Team: ${name}`);
        }
      }
      rowTeamIds.set(result.index, [...new Set(ids)]);
    }

    // Check for duplicates against existing Aktionen
    for (const result of results) {
      if (!result.valid) continue;
      const isoDate = convertDatumToISO(result.row.datum);
      const existing = await prisma.aktion.findFirst({
        where: {
          titel: result.row.titel,
          datum: new Date(isoDate),
          startzeit: result.row.startzeit,
        },
      });
      if (existing) {
        result.valid = false;
        result.errors.push("Duplikat: Eine Aktion mit diesem Titel, Datum und Startzeit existiert bereits");
      }
    }

    // If import=true in query, actually create the actions
    const doImport = formData.get("import") === "true";

    if (doImport) {
      const validRows = results.filter((r) => r.valid);

      if (validRows.length === 0) {
        return NextResponse.json({ error: "Keine gültigen Zeilen" }, { status: 400 });
      }

      // Beim Hochladen gewaehlte Teams gelten fuer alle Zeilen ohne eigene
      // "Teams"-Angabe. Admins duerfen bewusst keins waehlen; bei Experts wird
      // ohne Auswahl das eigene Team gesetzt.
      let defaultTeamIds = normalizeTeamIds(formData.getAll("teamIds"));
      const ownTeamIds = session.user.teamIds ?? [];
      if (defaultTeamIds.length === 0 && session.user.role === "EXPERT" && ownTeamIds.length > 0) {
        defaultTeamIds = [ownTeamIds[0]];
      }
      if (!(await teamsExist(defaultTeamIds))) {
        return NextResponse.json({ error: UNBEKANNTES_TEAM_FEHLER }, { status: 400 });
      }

      const created = [];
      const geoCache = new Map<string, Awaited<ReturnType<typeof geocodeAddress>>>();
      let ohneKoordinaten = 0;

      for (const { row, index } of validRows) {
        const teamIds = rowTeamIds.get(index) ?? defaultTeamIds;
        const isoDate = convertDatumToISO(row.datum);
        const wahlkreisId = rowWahlkreisIds.get(index);

        if (!wahlkreisId) continue;

        // Geocode
        let latitude: number | null = null;
        let longitude: number | null = null;
        // Same address only once per import (geocoding is throttled to 1/s);
        // beyond the limit, Aktionen are saved without a map point
        if (!geoCache.has(row.adresse)) {
          if (geoCache.size < MAX_GEOCODED_ADDRESSES) {
            geoCache.set(row.adresse, await geocodeAddress(row.adresse));
          } else {
            ohneKoordinaten++;
          }
        }
        const geo = geoCache.get(row.adresse);
        if (geo) {
          latitude = geo.latitude;
          longitude = geo.longitude;
        }

        const aktion = await prisma.aktion.create({
          data: {
            titel: row.titel,
            datum: new Date(isoDate),
            startzeit: row.startzeit,
            endzeit: row.endzeit,
            adresse: row.adresse,
            latitude,
            longitude,
            wahlkreisId,
            // Zeile wurde bereits gegen excelRowSchema validiert, daher ist der
            // Wert garantiert ein gueltiger AktionKategorie-Enumwert.
            kategorie: row.kategorie as ExcelRowInput["kategorie"],
            ansprechpersonName: row.ansprechpersonName,
            ansprechpersonEmail: row.ansprechpersonEmail,
            ansprechpersonTelefon: row.ansprechpersonTelefon,
            maxTeilnehmer: row.maxTeilnehmer || null,
            createdById: session.user.id,
            teams: { create: teamIds.map((teamId) => ({ teamId })) },
          },
        });

        created.push(aktion);
      }

      audit("AKTIONEN_IMPORTIERT", session.user.id, {
        count: created.length,
        zeilen: rows.length,
        ohneKoordinaten,
        teamIds: defaultTeamIds,
      });

      const hinweis =
        ohneKoordinaten > 0
          ? ` ${ohneKoordinaten} Aktion(en) haben noch keinen Kartenpunkt, weil höchstens ${MAX_GEOCODED_ADDRESSES} verschiedene Adressen pro Import gesucht werden. Er wird ergänzt, sobald die Aktion bearbeitet und gespeichert wird.`
          : "";
      return NextResponse.json({
        message: `${created.length} Aktion(en) importiert.${hinweis}`,
        created: created.length,
        total: rows.length,
        ohneKoordinaten,
      });
    }

    // Preview mode: return validation results
    return NextResponse.json({ results, total: rows.length });
  } catch (error) {
    logServerError("POST /api/actions/import", error);
    return NextResponse.json({ error: "Fehler beim Verarbeiten der Datei" }, { status: 500 });
  }
}

function wahlkreisFehler(
  value: number | string | undefined,
  wahlkreise: { nummer: number; name: string }[]
): string {
  if (value === undefined || String(value).trim() === "") return `${WAHLKREIS_LABEL} fehlt`;
  const moeglich = wahlkreise.map((wk) => formatWahlkreis(wk)).join(", ");
  return `${WAHLKREIS_LABEL} „${value}“ unbekannt (möglich: ${moeglich})`;
}
