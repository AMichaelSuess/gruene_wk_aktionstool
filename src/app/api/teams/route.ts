import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { teamSchema } from "@/lib/validators";
import { logServerError } from "@/lib/audit";

// Alle Teams. Fuer die Team-Auswahl bei Aktionen reichen ID und Name (Experts
// duerfen Aktionen auch fremden Teams zuordnen, z. B. Themen-Team + Bezirks-Team);
// Admins bekommen fuer die Verwaltung Wahlkreis und Anzahl Mitglieder/Aktionen.
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    const teams = await prisma.team.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(teams);
  }

  const teams = await prisma.team.findMany({
    include: {
      wahlkreis: true,
      _count: { select: { members: true, aktionen: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(teams);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validated = teamSchema.parse(body);

    const team = await prisma.team.create({
      data: {
        name: validated.name,
        wahlkreisId: validated.wahlkreisId || null,
      },
      include: { wahlkreis: true },
    });

    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validierungsfehler", details: error }, { status: 400 });
    }
    logServerError("POST /api/teams", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}

