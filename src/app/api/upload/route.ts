import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExcelFile, convertDatumToISO } from "@/lib/excel";
import { excelRowSchema, type ExcelRowInput } from "@/lib/validators";
import { geocodeAddress } from "@/lib/geocoding";

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

    // Validate each row
    const results = rows.map((row, index) => {
      const validation = excelRowSchema.safeParse(row);
      return {
        index,
        row,
        valid: validation.success,
        errors: validation.success ? [] : validation.error.issues.map((e) => e.message),
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

      // Get wahlkreise for mapping
      const wahlkreise = await prisma.wahlkreis.findMany();
      const wahlkreisMap = new Map(wahlkreise.map((wk) => [wk.nummer, wk.id]));

      const teamIds = session.user.teamIds ?? [];
      const requestedTeamId = (formData.get("teamId") as string | null) || null;
      let teamId: string | null;
      if (session.user.role === "ADMIN") {
        // Admins stehen über den Teams: gewähltes Team oder bewusst keins
        teamId = requestedTeamId;
      } else if (requestedTeamId) {
        // Team-Isolation: EXPERT darf nur in eigene Teams importieren
        if (!teamIds.includes(requestedTeamId)) {
          return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
        }
        teamId = requestedTeamId;
      } else {
        teamId = teamIds[0] ?? null;
      }

      const created = [];

      for (const { row } of validRows) {
        const isoDate = convertDatumToISO(row.datum);
        const wahlkreisId = wahlkreisMap.get(row.wahlkreis);

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
            teamId,
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
