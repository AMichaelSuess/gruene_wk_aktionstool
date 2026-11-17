import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

// Required in production (checked at startup in src/instrumentation.ts)
const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3200";

const tokenSchema = z.object({ token: z.string().min(1).max(128) });

// GET: target of the unsubscribe link in emails. Must not change anything:
// mail link scanners (e.g. Outlook Safe Links) open every link in a mail, so
// a deleting GET would silently unregister volunteers. It only forwards to a
// confirmation page where a person clicks the button (POST below).
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/abmeldung?fehler=1", baseUrl));
  }

  const target = new URL("/abmeldung/bestaetigen", baseUrl);
  target.searchParams.set("token", token);
  return NextResponse.redirect(target);
}

// POST: performs the unsubscribe after the person confirmed it.
export async function POST(req: NextRequest) {
  try {
    const parsed = tokenSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültiger Abmelde-Link" }, { status: 400 });
    }
    const { token } = parsed.data;

    const anmeldung = await prisma.anmeldung.findUnique({
      where: { cancelToken: token },
      select: {
        id: true,
        aktionId: true,
        vorname: true,
        nachname: true,
        email: true,
      },
    });

    if (!anmeldung) {
      return NextResponse.json({ error: "Anmeldung nicht gefunden" }, { status: 404 });
    }

    await prisma.anmeldung.delete({ where: { cancelToken: token } });

    // Log cancellation for daily summary (per D-10)
    await prisma.emailLog.create({
      data: {
        typ: "ABMELDUNG",
        empfaengerEmail: anmeldung.email,
        aktionId: anmeldung.aktionId,
        status: `ABMELDUNG: ${anmeldung.vorname} ${anmeldung.nachname}`,
      },
    });

    return NextResponse.json({ message: "Abgemeldet" });
  } catch {
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
