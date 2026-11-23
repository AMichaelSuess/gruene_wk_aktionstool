import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hasAktionAccess } from "@/lib/aktion-teams";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; signupId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const { id, signupId: anmeldungId } = await params;

  const aktion = await prisma.aktion.findUnique({
    where: { id },
    select: { createdById: true, teams: { select: { teamId: true } } },
  });

  if (!aktion) {
    return NextResponse.json({ error: "Aktion nicht gefunden" }, { status: 404 });
  }

  if (!hasAktionAccess(session.user, aktion)) {
    audit("ZUGRIFF_VERWEIGERT", session.user.id, { aktionId: id, route: "DELETE /api/actions/[id]/signups/[signupId]" });
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  // Scope the delete to the Aktion whose access was just checked, so a
  // registration of another Aktion cannot be deleted through this one.
  const result = await prisma.anmeldung.deleteMany({
    where: { id: anmeldungId, aktionId: id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Anmeldung nicht gefunden" }, { status: 404 });
  }
  audit("ANMELDUNG_GELOESCHT", session.user.id, { anmeldungId, aktionId: id });
  return NextResponse.json({ message: "Anmeldung gelöscht" });
}
