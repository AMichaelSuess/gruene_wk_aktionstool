import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Oeffentlich (Filter, Formulare). Admins bekommen fuer die Verwaltung
// zusaetzlich die Anzahl der Teams und Aktionen.
export async function GET() {
  const session = await auth();
  const wahlkreise = await prisma.wahlkreis.findMany({
    ...(session?.user.role === "ADMIN" && {
      include: { _count: { select: { teams: true, aktionen: true } } },
    }),
    orderBy: { nummer: "asc" },
  });
  return NextResponse.json(wahlkreise);
}
