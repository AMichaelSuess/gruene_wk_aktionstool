import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit, logServerError } from "@/lib/audit";
import { kontoSchema } from "@/lib/validators";

// GET: eigene Kontodaten (Name, E-Mail)
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  return NextResponse.json(user);
}

// PATCH: eigenen Namen aendern. E-Mail (Login) und Rolle aendern nur Admins.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const parsed = kontoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validierungsfehler" },
      { status: 400 }
    );
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { name: parsed.data.name },
    });
    audit("USER_GEAENDERT", session.user.id, { userId: session.user.id, fields: ["name"] });
    return NextResponse.json({ name: parsed.data.name });
  } catch (error) {
    logServerError("PATCH /api/user/konto", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
