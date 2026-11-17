import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { BodyTooLargeError, readJsonLimited } from "@/lib/request-body";
import { sendEmail } from "@/lib/email";
import { meineAktionenEmail } from "@/lib/email-templates";
import { logServerError } from "@/lib/audit";

// Rate limiting: 5 requests per minute per IP
const isRateLimited = createRateLimiter(5, 60 * 1000);

// Rate limiting: 2 requests per 15 minutes per email address
const isEmailRateLimited = createRateLimiter(2, 15 * 60 * 1000);

const MAX_BODY_BYTES = 1024;

// Trim + Kleinschreibung: E-Mail-Vergleich muss unabhängig von Groß-/Kleinschreibung
// funktionieren, da Anmeldungen z. B. auch "Max@Domain.de" gespeichert haben können.
const bodySchema = z.object({ email: z.string().trim().toLowerCase().max(254).email() });

// POST, not GET: the address stays out of URLs, browser history and proxy logs
export async function POST(req: NextRequest) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await readJsonLimited(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ error: "Anfrage zu groß" }, { status: 413 });
    }
    return NextResponse.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
  }
  const { email } = parsed.data;

  if (isEmailRateLimited(email)) {
    return NextResponse.json(
      { error: "Zu viele Anfragen für diese E-Mail-Adresse. Bitte versuche es später erneut." },
      { status: 429 }
    );
  }

  try {
    const anmeldungen = await prisma.anmeldung.findMany({
      // Zusätzliche Absicherung als case-insensitive Vergleich (mode: "insensitive"),
      // falls in der DB noch nicht normalisierte Alt-Datensätze liegen.
      where: { email: { equals: email, mode: "insensitive" } },
      include: { aktion: true },
      orderBy: { aktion: { datum: "asc" } },
    });

    const aktionen = anmeldungen.map((a) => ({
      titel: a.aktion.titel,
      datum: a.aktion.datum,
      startzeit: a.aktion.startzeit,
      endzeit: a.aktion.endzeit,
      adresse: a.aktion.adresse,
      ansprechpersonName: a.aktion.ansprechpersonName,
      ansprechpersonEmail: a.aktion.ansprechpersonEmail,
      ansprechpersonTelefon: a.aktion.ansprechpersonTelefon,
      cancelToken: a.cancelToken ?? undefined,
    }));

    const emailData = meineAktionenEmail(aktionen);

    await sendEmail({
      to: email,
      subject: emailData.subject,
      html: emailData.html,
      typ: "BESTAETIGUNG",
    });

    return NextResponse.json({ message: "E-Mail wurde gesendet" });
  } catch (error) {
    logServerError("POST /api/anmeldungen/meine-aktionen", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
