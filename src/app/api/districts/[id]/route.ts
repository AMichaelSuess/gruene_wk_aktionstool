import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { wahlkreisUpdateSchema } from "@/lib/validators";
import { WAHLKREIS_LABEL } from "@/lib/wahlkreis-label";
import { logServerError } from "@/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    // The ID comes from the path, never from the body
    const validated = wahlkreisUpdateSchema.parse({ ...body, id });

    const wahlkreis = await prisma.wahlkreis.update({
      where: { id: validated.id },
      data: {
        name: validated.name,
        nummer: validated.nummer,
      },
    });

    return NextResponse.json(wahlkreis);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validierungsfehler", details: error }, { status: 400 });
    }
    // Prisma unique constraint violation (doppelte Nummer)
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: `Diese Nummer ist bereits für einen anderen ${WAHLKREIS_LABEL} vergeben.` },
        { status: 409 }
      );
    }
    logServerError("PUT /api/districts/[id]", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
