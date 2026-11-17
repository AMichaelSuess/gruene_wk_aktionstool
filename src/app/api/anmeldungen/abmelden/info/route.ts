import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const tokenSchema = z.object({ token: z.string().min(1).max(128) });

// POST: which action an unsubscribe link belongs to, so the confirmation page
// can name it. Read-only; returns no personal data. POST keeps the token out
// of URLs and server logs.
export async function POST(req: NextRequest) {
  try {
    const parsed = tokenSchema.safeParse(await req.json());
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
  } catch {
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
