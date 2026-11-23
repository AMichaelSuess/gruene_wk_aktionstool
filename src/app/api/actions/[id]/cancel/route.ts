import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { audit } from "@/lib/audit";
import { absageEmail } from "@/lib/email-templates";
import { hasAktionAccess } from "@/lib/aktion-teams";

// POST: Aktion absagen. Sie bleibt erhalten (Status ABGESAGT), alle
// Angemeldeten bekommen eine Absage-Mail. Endgueltiges Loeschen ohne Mails:
// DELETE /api/actions/[id] (nur Admins).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.aktion.findUnique({
    where: { id },
    include: { anmeldungen: true, teams: { select: { teamId: true } } },
    // createdById is a scalar field – included automatically
  });

  if (!existing) {
    return NextResponse.json({ error: "Aktion nicht gefunden" }, { status: 404 });
  }

  if (!hasAktionAccess(session.user, existing)) {
    audit("ZUGRIFF_VERWEIGERT", session.user.id, { aktionId: id, route: "POST /api/actions/[id]/cancel" });
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  await prisma.aktion.update({
    where: { id },
    data: { status: "ABGESAGT" },
  });

  // Send cancellation email to all registrants
  if (existing.anmeldungen.length > 0) {
    const emailData = absageEmail({
      titel: existing.titel,
      datum: existing.datum,
      startzeit: existing.startzeit,
      endzeit: existing.endzeit,
      adresse: existing.adresse,
      ansprechpersonName: existing.ansprechpersonName,
      ansprechpersonEmail: existing.ansprechpersonEmail,
      ansprechpersonTelefon: existing.ansprechpersonTelefon,
    });

    for (const anmeldung of existing.anmeldungen) {
      await sendEmail({
        to: anmeldung.email,
        subject: emailData.subject,
        html: emailData.html,
        typ: "ABSAGE",
        aktionId: existing.id,
      });
    }
  }

  return NextResponse.json({ message: "Aktion abgesagt" });
}
