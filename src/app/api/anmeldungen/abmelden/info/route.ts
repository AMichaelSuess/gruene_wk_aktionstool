import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { BodyTooLargeError, readJsonLimited } from "@/lib/request-body";
import { logServerError } from "@/lib/audit";

const tokenSchema = z.object({ token: z.string().min(1).max(128) });

// A token is 64 hex characters; anything much larger is not a real request
const MAX_BODY_BYTES = 1024;
const isRateLimited = createRateLimiter(20, 60 * 1000); // per minute and IP

// POST: which action an unsubscribe link belongs to, so the confirmation page
// can name it. Read-only; returns no personal data. POST keeps the token out
// of URLs and server logs.
export async function POST(req: NextRequest) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
      { status: 429 }
    );
  }

  try {
    const parsed = tokenSchema.safeParse(await readJsonLimited(req, MAX_BODY_BYTES));
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültiger Abmelde-Link" }, { status: 400 });
    }

    const anmeldung = await prisma.anmeldung.findUnique({
      where: { cancelToken: parsed.data.token },
      select: { aktion: { select: { titel: true, datum: true, startzeit: true } } },
    });

    if (!anmeldung) {
      return NextResponse.json({ error: "Anmeldung nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json(anmeldung.aktion);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ error: "Anfrage zu groß" }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Ungültiger Abmelde-Link" }, { status: 400 });
    }
    logServerError("POST /api/anmeldungen/abmelden/info", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
