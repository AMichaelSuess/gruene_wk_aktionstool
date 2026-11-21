import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit, logServerError } from "@/lib/audit";
import { createFailureCounter } from "@/lib/rate-limit";
import { passwortAendernSchema } from "@/lib/validators";

// Begrenzt das Durchprobieren des aktuellen Passworts aus einer offenen Sitzung heraus
const failures = createFailureCounter(5, 15 * 60 * 1000);

// POST: eigenes Passwort aendern; erfordert das aktuelle Passwort
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const userId = session.user.id;
  if (failures.isBlocked(userId)) {
    return NextResponse.json(
      { error: "Zu viele Fehlversuche. Bitte versuche es in 15 Minuten erneut." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const parsed = passwortAendernSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validierungsfehler" },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const ok = await bcrypt.compare(parsed.data.aktuellesPasswort, user.password);
    if (!ok) {
      failures.recordFailure(userId);
      return NextResponse.json({ error: "Das aktuelle Passwort ist falsch." }, { status: 400 });
    }

    failures.reset(userId);
    const hash = await bcrypt.hash(parsed.data.neuesPasswort, 12);
    // Neue Sitzungsversion: alle bestehenden Sitzungen enden, auch die aktuelle
    // (die Konto-Seite meldet danach ab und schickt zum Login)
    await prisma.user.update({
      where: { id: userId },
      data: { password: hash, sessionVersion: { increment: 1 } },
    });
    audit("PASSWORT_GEAENDERT", userId, {});

    return NextResponse.json({ message: "Passwort geändert" });
  } catch (error) {
    logServerError("POST /api/user/passwort", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
