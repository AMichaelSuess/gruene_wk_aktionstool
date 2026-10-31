import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Health-Check für Coolify: App läuft und die Datenbank ist erreichbar.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Health-Check: Datenbank nicht erreichbar", error);
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
