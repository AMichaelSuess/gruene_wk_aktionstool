import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { anmeldungSchema } from "@/lib/validators";
import { sendEmail } from "@/lib/email";
import { anmeldebestaetigungEmail } from "@/lib/email-templates";

// Rate limiting per client IP
const isRateLimited = createRateLimiter(10, 60 * 1000); // per minute

interface AktionWithCount {
  id: string;
  titel: string;
  datum: Date;
  startzeit: string;
  endzeit: string;
  adresse: string;
  ansprechpersonName: string;
  ansprechpersonEmail: string;
  ansprechpersonTelefon: string;
  maxTeilnehmer: number | null;
  status: string;
  _count: { anmeldungen: number };
}

export async function POST(req: NextRequest) {
  // Rate limiting
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();

    // Honeypot check
    if (body.honeypot && body.honeypot.length > 0) {
      // Silently accept but don't process (bot trap)
      return NextResponse.json({ message: "Anmeldung erfolgreich" });
    }

    const validated = anmeldungSchema.parse(body);

    // Create registrations for each action.
    // An existing registration is answered exactly like a new one, so the
    // response does not reveal whether an email address is already
    // registered for an action (DSGVO: participation is political opinion).
    const results = [];
    const successfulAktionen: Array<{ aktion: AktionWithCount; cancelToken: string }> = [];
    const existingAktionen: Array<{ aktion: AktionWithCount; cancelToken: string }> = [];

    for (const aktionId of validated.aktionIds) {
      // Check if action exists and is active
      const aktion = await prisma.aktion.findUnique({
        where: { id: aktionId },
        include: { _count: { select: { anmeldungen: true } } },
      });

      if (!aktion || aktion.status === "ABGESAGT") {
        results.push({ aktionId, error: "Aktion nicht verfügbar" });
        continue;
      }

      // Check max participants
      if (aktion.maxTeilnehmer && aktion._count.anmeldungen >= aktion.maxTeilnehmer) {
        results.push({ aktionId, error: "Aktion ist bereits voll" });
        continue;
      }

      try {
        const cancelToken = crypto.randomBytes(32).toString("hex");
        await prisma.anmeldung.create({
          data: {
            aktionId,
            vorname: validated.vorname,
            nachname: validated.nachname,
            email: validated.email,
            telefon: validated.telefon || null,
            signalName: validated.signalName || null,
            cancelToken,
          },
        });
        successfulAktionen.push({ aktion, cancelToken });
        results.push({ aktionId, success: true });
      } catch (err) {
        // Unique constraint violation
        if (err instanceof Error && err.message.includes("Unique")) {
          const existing = await prisma.anmeldung.findUnique({
            where: { aktionId_email: { aktionId, email: validated.email } },
            select: { cancelToken: true },
          });
          if (existing?.cancelToken) {
            existingAktionen.push({ aktion, cancelToken: existing.cancelToken });
          }
          results.push({ aktionId, success: true });
        } else {
          results.push({ aktionId, error: "Fehler bei der Anmeldung" });
        }
      }
    }

    // Send a confirmation email only if something new was created. It also
    // lists existing registrations, so only the mailbox owner learns about them.
    if (successfulAktionen.length > 0) {
      const confirmed = [...successfulAktionen, ...existingAktionen];
      const emailData = anmeldebestaetigungEmail(
        validated.vorname,
        validated.email,
        confirmed.map((s) => ({
          titel: s.aktion.titel,
          datum: s.aktion.datum,
          startzeit: s.aktion.startzeit,
          endzeit: s.aktion.endzeit,
          adresse: s.aktion.adresse,
          ansprechpersonName: s.aktion.ansprechpersonName,
          ansprechpersonEmail: s.aktion.ansprechpersonEmail,
          ansprechpersonTelefon: s.aktion.ansprechpersonTelefon,
        })),
        confirmed.map((s) => s.cancelToken)
      );

      await sendEmail({
        to: validated.email,
        subject: emailData.subject,
        html: emailData.html,
        typ: "BESTAETIGUNG",
      });
    }

    return NextResponse.json({
      message: `Erfolgreich für ${successfulAktionen.length + existingAktionen.length} Aktion(en) angemeldet`,
      results,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validierungsfehler", details: error }, { status: 400 });
    }
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
