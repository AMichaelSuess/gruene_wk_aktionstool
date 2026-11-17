import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExcelFile, convertDatumToISO } from "@/lib/excel";
import { excelRowSchema, type ExcelRowInput } from "@/lib/validators";
import { geocodeAddress } from "@/lib/geocoding";
import { normalizeTeamIds, teamsExist, UNBEKANNTES_TEAM_FEHLER } from "@/lib/aktion-teams";
import { WAHLKREIS_LABEL, findWahlkreis, formatWahlkreis } from "@/lib/wahlkreis-label";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const rows = await parseExcelFile(buffer);

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

      for (const { row, index } of validRows) {
        const teamIds = rowTeamIds.get(index) ?? defaultTeamIds;
        const isoDate = convertDatumToISO(row.datum);
        const wahlkreisId = rowWahlkreisIds.get(index);

        if (!wahlkreisId) continue;

        // Geocode
        let latitude: number | null = null;
        let longitude: number | null = null;
        const geo = await geocodeAddress(row.adresse);
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

      return NextResponse.json({
        message: `${created.length} Aktion(en) importiert`,
        created: created.length,
        total: rows.length,
      });
    }

    // Preview mode: return validation results
    return NextResponse.json({ results, total: rows.length });
  } catch {
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
