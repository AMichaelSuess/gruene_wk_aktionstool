import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hasAktionAccess } from "@/lib/aktion-teams";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const { id } = await params;

  const aktion = await prisma.aktion.findUnique({
    where: { id },
    select: { createdById: true, teams: { select: { teamId: true } } },
  });

  if (!aktion) {
    return NextResponse.json({ error: "Aktion nicht gefunden" }, { status: 404 });
  }

  if (!hasAktionAccess(session.user, aktion)) {
    audit("ZUGRIFF_VERWEIGERT", session.user.id, { aktionId: id, route: "GET /api/actions/[id]/signups" });
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  // Explicit fields: the cancel token is a volunteer's credential and must
  // not leave the server
  const anmeldungen = await prisma.anmeldung.findMany({
    where: { aktionId: id },
    select: {
      id: true,
      vorname: true,
      nachname: true,
      email: true,
      telefon: true,
      signalName: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(anmeldungen);
}
