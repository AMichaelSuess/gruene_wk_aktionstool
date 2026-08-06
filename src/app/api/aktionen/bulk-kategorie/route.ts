import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ZodError } from "zod";
import { bulkKategorieSchema } from "@/lib/validators";

/**
 * PATCH: Kategorie mehrerer Aktionen auf einmal setzen.
 *
 * Bewusst ohne aktionSchema und ohne Datumspruefung — auch vergangene Aktionen
 * muessen nachtraeglich umkategorisiert werden koennen. Es werden keine E-Mails
 * verschickt und der Status bleibt unveraendert.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validated = bulkKategorieSchema.parse(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { id: { in: validated.ids } };

    // Team-Isolation: EXPERT darf nur eigene Team-Aktionen umkategorisieren
    if (session.user.role === "EXPERT") {
      if (session.user.teamIds?.length > 0) {
        where.teamId = { in: session.user.teamIds };
      } else {
        where.createdById = session.user.id;
      }
    }

    const result = await prisma.aktion.updateMany({
      where,
      data: { kategorie: validated.kategorie },
    });

    return NextResponse.json({ count: result.count });
  } catch (error) {
    if (error instanceof ZodError) {
      const firstMessage = error.issues[0]?.message ?? "Validierungsfehler";
      return NextResponse.json({ error: firstMessage, details: error }, { status: 400 });
    }
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
