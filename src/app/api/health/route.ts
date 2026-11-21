import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logServerError } from "@/lib/audit";

// Health-Check für Coolify: App läuft und die Datenbank ist erreichbar.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    // Nur Typ, Code und erste Zeile, nicht das ganze Fehlerobjekt
    logServerError("GET /api/health", error);
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
