import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { teamSchema } from "@/lib/validators";
import { logServerError } from "@/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const { id: pathId } = await params;
    // The ID comes from the path, never from the body
    const parsed = teamSchema.extend({ id: z.string().min(1) }).safeParse({ ...(await req.json()), id: pathId });
    if (!parsed.success) {
      return NextResponse.json({ error: "Validierungsfehler", details: parsed.error }, { status: 400 });
    }
    const { id, name, wahlkreisId } = parsed.data;

    const team = await prisma.team.update({
      where: { id },
      data: {
        name,
        wahlkreisId: wahlkreisId || null,
      },
      include: { wahlkreis: true },
    });

    return NextResponse.json(team);
  } catch (error) {
    logServerError("PUT /api/teams/[id]", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const { id } = await params;

  // Check if team has users or aktionen
  const team = await prisma.team.findUnique({
    where: { id },
    include: { _count: { select: { members: true, aktionen: true } } },
  });

  if (team && (team._count.members > 0 || team._count.aktionen > 0)) {
    return NextResponse.json(
      { error: "Team kann nicht gelöscht werden, da es noch Mitglieder oder Aktionen hat." },
      { status: 400 }
    );
  }

  await prisma.team.delete({ where: { id } });
  return NextResponse.json({ message: "Team gelöscht" });
}
