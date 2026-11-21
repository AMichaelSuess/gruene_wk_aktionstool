import { NextRequest, NextResponse, after } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { hatBegonnen } from "@/lib/aktion-zeit";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { BodyTooLargeError, readJsonLimited } from "@/lib/request-body";
import { anmeldungSchema } from "@/lib/validators";
import { sendEmail } from "@/lib/email";
import { anmeldebestaetigungEmail } from "@/lib/email-templates";
import { logServerError } from "@/lib/audit";

// Rate limiting per client IP
const isRateLimited = createRateLimiter(10, 60 * 1000); // per minute

const MAX_BODY_BYTES = 32 * 1024;

class AktionVollError extends Error {}

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
    // A real signup is well under 1 KB; reject anything large before parsing
    const body = (await readJsonLimited(req, MAX_BODY_BYTES)) as Record<string, unknown>;

    // Honeypot check
    if (typeof body?.honeypot === "string" && body.honeypot.length > 0) {
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

    // Each action only once, even if the request lists it several times
    for (const aktionId of new Set(validated.aktionIds)) {
      // Check if action exists and is active
      const aktion = await prisma.aktion.findUnique({
        where: { id: aktionId },
        include: { _count: { select: { anmeldungen: true } } },
      });

      // Started or past actions take no new signups (they would escape the
      // 72 h cleanup, which has already run for them)
      if (!aktion || aktion.status === "ABGESAGT" || hatBegonnen(aktion)) {
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
        const data = {
          aktionId,
          vorname: validated.vorname,
          nachname: validated.nachname,
          email: validated.email,
          telefon: validated.telefon || null,
          signalName: validated.signalName || null,
          cancelToken,
        };
        const maxTeilnehmer = aktion.maxTeilnehmer;
        if (maxTeilnehmer) {
          // The check above can pass for several parallel signups at once.
          // A transaction-scoped advisory lock per action serializes them,
          // so the count below sees every earlier signup. Other actions are
          // not blocked.
          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${aktionId}))`;
            const count = await tx.anmeldung.count({ where: { aktionId } });
            if (count >= maxTeilnehmer) throw new AktionVollError();
            await tx.anmeldung.create({ data });
          });
        } else {
          await prisma.anmeldung.create({ data });
        }
        successfulAktionen.push({ aktion, cancelToken });
        results.push({ aktionId, success: true });
      } catch (err) {
        if (err instanceof AktionVollError) {
          results.push({ aktionId, error: "Aktion ist bereits voll" });
          continue;
        }
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

      // Erst nach der Antwort senden: sonst waere eine Anmeldung, die nur schon
      // bestehende Anmeldungen trifft (keine Mail), messbar schneller und die
      // Antwortzeit verriete, wer schon angemeldet ist. sendEmail faengt alle
      // Fehler selbst ab.
      after(() =>
        sendEmail({
          to: validated.email,
          subject: emailData.subject,
          html: emailData.html,
          typ: "BESTAETIGUNG",
        })
      );
    }

    return NextResponse.json({
      message: `Erfolgreich für ${successfulAktionen.length + existingAktionen.length} Aktion(en) angemeldet`,
      results,
    });
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ error: "Anfrage zu groß" }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validierungsfehler", details: error }, { status: 400 });
    }
    logServerError("POST /api/anmeldungen", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
