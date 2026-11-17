import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Alle Teams fuer die Team-Auswahl bei Aktionen. Experts duerfen Aktionen
// auch fremden Teams zuordnen (z. B. Themen-Team + Bezirks-Team).
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const teams = await prisma.team.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(teams);
}
