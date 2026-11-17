import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { ZodError } from "zod";
import { aktionSchema } from "@/lib/validators";
import { KATEGORIE_VALUES } from "@/lib/kategorien";
import { geocodeAddress } from "@/lib/geocoding";
import {
  TEAMS_INCLUDE,
  expertAktionWhere,
  flattenTeams,
  normalizeTeamIds,
  teamsExist,
  UNBEKANNTES_TEAM_FEHLER,
} from "@/lib/aktion-teams";

// Rate limiting for public GET endpoint (SEC-05)
const isRateLimited = createRateLimiter(60, 60 * 1000); // per minute, list endpoint

// GET: Public listing (active actions) or authenticated (team-filtered)
export async function GET(req: NextRequest) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es spaeter erneut." },
      { status: 429 }
    );
  }

  const session = await auth();
  const { searchParams } = new URL(req.url);

  const wahlkreis = searchParams.get("wahlkreis");
  const datum = searchParams.get("datum");
  const datumBis = searchParams.get("datumBis");
  const tageszeit = searchParams.get("tageszeit");
  const kategorie = searchParams.get("kategorie");
  const teamId = searchParams.get("teamId");
  const isPublic = searchParams.get("public") === "true";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let where: any = {};

  // Public: only active/changed, future actions
  if (!session || isPublic) {
    where.status = { in: ["AKTIV", "GEAENDERT"] };
    where.datum = { gte: new Date(new Date().toISOString().split("T")[0]) };
  } else if (session.user.role === "EXPERT") {
    where = expertAktionWhere(session.user);
  }

  // Filters
  if (teamId && session?.user.role === "ADMIN") {
    where.teams = { some: { teamId } };
  }

  if (wahlkreis) {
    const wahlkreisNummern = wahlkreis.split(",").map(Number);
    where.wahlkreis = { nummer: { in: wahlkreisNummern } };
  }

  if (kategorie) {
    const kategorien = kategorie
      .split(",")
      .map((k) => k.trim())
      .filter((k) => (KATEGORIE_VALUES as readonly string[]).includes(k));
    if (kategorien.length > 0) {
      where.kategorie = { in: kategorien };
    }
  }

  if (datum) {
    where.datum = { ...(where.datum || {}), gte: new Date(datum) };
    if (datumBis) {
      where.datum.lte = new Date(datumBis);
    }
  }

  const aktionen = await prisma.aktion.findMany({
    where,
    include: {
      wahlkreis: true,
      _count: { select: { anmeldungen: true } },
      teams: TEAMS_INCLUDE,
    },
    orderBy: [{ datum: "asc" }, { startzeit: "asc" }],
  });

  // Filter by tageszeit client-side (based on startzeit); supports multiple values (comma-separated)
  let filtered = aktionen.map(flattenTeams);

  // NEU: Aktionen ausblenden, deren Startzeit bereits erreicht wurde (nur für öffentliche Ansicht)
  if (!session || isPublic) {
    const now = new Date();
    // Nutzt die deutsche Zeitzone, um Server-Zeitverschiebungen (UTC) auszugleichen
    const currentTime = now.toLocaleTimeString("de-DE", { 
      timeZone: "Europe/Berlin", 
      hour: "2-digit", 
      minute: "2-digit" 
    });
    const currentDate = now.toLocaleDateString("sv-SE", { 
      timeZone: "Europe/Berlin" 
    }); // Format: YYYY-MM-DD

    filtered = filtered.filter((a) => {
      const aktionDate = new Date(a.datum).toLocaleDateString("sv-SE", { 
        timeZone: "Europe/Berlin" 
      });

      // Zukünftige Tage immer anzeigen
      if (aktionDate > currentDate) return true;
      
      // Am selben Tag nur anzeigen, wenn die Startzeit noch in der Zukunft liegt
      if (aktionDate === currentDate) {
        return a.startzeit > currentTime; 
      }
      
      // Vergangene Tage ausblenden
      return false;
    });
  }

  if (tageszeit) {
    const tagszeiten = tageszeit.split(",");
    filtered = filtered.filter((a) => {
      const hour = parseInt(a.startzeit.split(":")[0], 10);
      return tagszeiten.some((tz) => {
        if (tz === "vormittags") return hour < 10;
        if (tz === "tagsueber") return hour >= 10 && hour < 16;
        if (tz === "abends") return hour >= 16;
        return false;
      });
    });
  }

  // Public view: never expose the contact person's email/phone or internal user IDs.
  // The public pages only show the contact person's name.
  if (!session || isPublic) {
    return NextResponse.json(
      filtered.map(
        ({ ansprechpersonEmail: _e, ansprechpersonTelefon: _t, createdById: _c, ...publicAktion }) =>
          publicAktion
      )
    );
  }

  return NextResponse.json(filtered);
}

// POST: Create new action (authenticated)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validated = aktionSchema.parse(body);

    // Geocode address if no coordinates provided
    let latitude = validated.latitude;
    let longitude = validated.longitude;
    if (!latitude || !longitude) {
      const geo = await geocodeAddress(validated.adresse);
      if (geo) {
        latitude = geo.latitude;
        longitude = geo.longitude;
      }
    }

    // Admins und Experts duerfen beliebige Teams zuordnen (z. B. Themen-Team
    // + Bezirks-Team). Admins duerfen bewusst keins waehlen; bei Experts wird
    // ohne Auswahl das eigene Team gesetzt.
    let teamIds = normalizeTeamIds(validated.teamIds);
    if (teamIds.length === 0 && session.user.role === "EXPERT" && session.user.teamIds?.length > 0) {
      teamIds = [session.user.teamIds[0]];
    }
    if (!(await teamsExist(teamIds))) {
      return NextResponse.json({ error: UNBEKANNTES_TEAM_FEHLER }, { status: 400 });
    }

    const aktion = await prisma.aktion.create({
      data: {
        titel: validated.titel,
        datum: new Date(validated.datum),
        startzeit: validated.startzeit,
        endzeit: validated.endzeit,
        adresse: validated.adresse,
        latitude,
        longitude,
        wahlkreisId: validated.wahlkreisId,
        kategorie: validated.kategorie,
        ansprechpersonName: validated.ansprechpersonName,
        ansprechpersonEmail: validated.ansprechpersonEmail,
        ansprechpersonTelefon: validated.ansprechpersonTelefon,
        maxTeilnehmer: validated.maxTeilnehmer || null,
        createdById: session.user.id,
        teams: { create: teamIds.map((teamId) => ({ teamId })) },
      },
      include: { wahlkreis: true },
    });

    return NextResponse.json(aktion, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      const firstMessage = error.issues[0]?.message ?? "Validierungsfehler";
      return NextResponse.json({ error: firstMessage, details: error }, { status: 400 });
    }
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
