import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const anmeldungen = await prisma.anmeldung.findMany({
    where: { aktionId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(anmeldungen);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const anmeldungId = searchParams.get("anmeldungId");

  if (!anmeldungId) {
    return NextResponse.json({ error: "anmeldungId fehlt" }, { status: 400 });
  }

  const aktion = await prisma.aktion.findUnique({
    where: { id },
    select: { createdById: true, teams: { select: { teamId: true } } },
  });

  if (!aktion) {
    return NextResponse.json({ error: "Aktion nicht gefunden" }, { status: 404 });
  }

  if (!hasAktionAccess(session.user, aktion)) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  await prisma.anmeldung.delete({ where: { id: anmeldungId } });
  return NextResponse.json({ message: "Anmeldung gelöscht" });
}
