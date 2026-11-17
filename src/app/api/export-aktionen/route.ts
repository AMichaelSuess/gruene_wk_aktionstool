import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createAktionenExcel, createAktionenTxt } from "@/lib/excel";
import { KATEGORIE_VALUES, kategorieLabel } from "@/lib/kategorien";
import { format, startOfDay, endOfDay, addDays, startOfWeek, endOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import { TEAMS_INCLUDE, expertAktionWhere } from "@/lib/aktion-teams";
import { formatWahlkreis } from "@/lib/wahlkreis-label";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const exportFormat = searchParams.get("format") || "xlsx";
  const teamId = searchParams.get("teamId");
  const dateFilter = searchParams.get("dateFilter");
  const activeOnly = searchParams.get("activeOnly") === "true";
  const kategorie = searchParams.get("kategorie");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (session.user.role === "EXPERT") {
    // Team-Isolation: nur Aktionen der eigenen Teams oder selbst erstellte
    Object.assign(where, expertAktionWhere(session.user));
  } else if (teamId) {
    where.teams = { some: { teamId } };
  }

  // Datums-Filter auf Prisma anwenden
  const now = new Date();
  if (dateFilter === "heute") {
    where.datum = {
      gte: startOfDay(now),
      lte: endOfDay(now),
    };
  } else if (dateFilter === "morgen") {
    const tomorrow = addDays(now, 1);
    where.datum = {
      gte: startOfDay(tomorrow),
      lte: endOfDay(tomorrow),
    };
  } else if (dateFilter === "woche") {
    // weekStartsOn: 1 -> Montag
    where.datum = {
      gte: startOfWeek(now, { weekStartsOn: 1 }),
      lte: endOfWeek(now, { weekStartsOn: 1 }),
    };
  }

  // Status-Filter auf Prisma anwenden
  if (activeOnly) {
    where.status = { in: ["AKTIV", "GEAENDERT"] };
  }

  // Kategorie-Filter auf Prisma anwenden
  if (kategorie) {
    const kategorien = kategorie
      .split(",")
      .map((k) => k.trim())
      .filter((k) => (KATEGORIE_VALUES as readonly string[]).includes(k));
    if (kategorien.length > 0) {
      where.kategorie = { in: kategorien };
    }
  }

  const aktionen = await prisma.aktion.findMany({
    where,
    include: {
      wahlkreis: true,
      teams: TEAMS_INCLUDE,
      _count: { select: { anmeldungen: true } },
    },
    orderBy: [{ datum: "asc" }, { startzeit: "asc" }],
  });

  audit("EXPORT_AKTIONEN", session.user.id, {
    format: exportFormat,
    teamId,
    dateFilter,
    kategorie,
    count: aktionen.length,
  });

  const exportData = aktionen.map((a) => ({
    titel: a.titel,
    datum: format(a.datum, "dd.MM.yyyy", { locale: de }),
    datumMitTag: format(a.datum, "dd.MM.yyyy (EEE)", { locale: de }),
    startzeit: a.startzeit,
    endzeit: a.endzeit,
    adresse: a.adresse,
    wahlkreis: formatWahlkreis(a.wahlkreis),
    kategorie: kategorieLabel(a.kategorie),
    teams: a.teams.map((t) => t.team.name).join(", "),
    status: a.status,
    anmeldungen: a._count.anmeldungen,
    maxTeilnehmer: a.maxTeilnehmer,
    ansprechpersonName: a.ansprechpersonName,
  }));

  if (exportFormat === "txt") {
    const txt = createAktionenTxt(exportData);
    return new NextResponse(txt, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="aktionen.txt"`,
      },
    });
  }

  const buffer = await createAktionenExcel(exportData);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="aktionen.xlsx"`,
    },
  });
}