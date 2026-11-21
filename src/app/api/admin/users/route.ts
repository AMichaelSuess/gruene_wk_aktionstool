import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit, logServerError } from "@/lib/audit";
import { userSchema, userUpdateSchema } from "@/lib/validators";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

// Anonymisierte Konten (geloeschte Personen, die noch Aktionen angelegt haben).
// .invalid ist als Top-Level-Domain reserviert, dorthin geht nie eine E-Mail.
const ANONYM_DOMAIN = "@geloescht.invalid";
const ANONYM_NAME = "Gelöschte*r Benutzer*in";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  // Expert*innen sehen nur aktive Mitglieder ihrer eigenen Teams, und bei jeder
  // Person nur die gemeinsamen Teams. Bearbeiten bleibt Admins vorbehalten.
  if (session.user.role !== "ADMIN") {
    const teamIds = session.user.teamIds ?? [];
    const members = await prisma.user.findMany({
      where: { active: true, teams: { some: { teamId: { in: teamIds } } } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        teams: {
          where: { teamId: { in: teamIds } },
          select: { team: { select: { id: true, name: true } } },
        },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(members.map((u) => ({ ...u, teams: u.teams.map((ut) => ut.team) })));
  }

  const users = await prisma.user.findMany({
    where: { NOT: { email: { endsWith: ANONYM_DOMAIN } } },
    include: { teams: { include: { team: true } }, _count: { select: { aktionen: true } } },
    orderBy: { createdAt: "desc" },
  });

  const sanitized = users.map(({ password: _, ...user }) => ({
    ...user,
    teams: user.teams.map((ut) => ut.team),
  }));
  return NextResponse.json(sanitized);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validated = userSchema.parse(body);

    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Ein Benutzer mit dieser E-Mail existiert bereits" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(validated.password, 12);

    const user = await prisma.user.create({
      data: {
        name: validated.name,
        email: validated.email,
        password: hashedPassword,
        role: validated.role,
        teams: {
          create: (validated.teamIds ?? []).map((teamId) => ({ teamId })),
        },
      },
      include: { teams: { include: { team: true } } },
    });

    audit("USER_ERSTELLT", session.user.id, {
      userId: user.id,
      role: user.role,
      teamIds: validated.teamIds ?? [],
    });

    const { password: _, ...sanitized } = user;
    return NextResponse.json(
      { ...sanitized, teams: sanitized.teams.map((ut) => ut.team) },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validierungsfehler", details: error }, { status: 400 });
    }
    logServerError("POST /api/admin/users", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validated = userUpdateSchema.parse(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.email !== undefined) updateData.email = validated.email;
    if (validated.role !== undefined) updateData.role = validated.role;
    if (validated.active !== undefined) updateData.active = validated.active;
    if (validated.password !== undefined) updateData.password = await bcrypt.hash(validated.password, 12);

    // Update teams if provided
    if (validated.teamIds !== undefined) {
      updateData.teams = {
        deleteMany: {},
        create: validated.teamIds.map((teamId: string) => ({ teamId })),
      };
    }

    const user = await prisma.user.update({
      where: { id: validated.id },
      data: updateData,
      include: { teams: { include: { team: true } } },
    });

    // Field names only (never the values of name, email or password)
    audit("USER_GEAENDERT", session.user.id, {
      userId: user.id,
      fields: Object.keys(updateData),
      role: validated.role,
      active: validated.active,
      teamIds: validated.teamIds,
    });

    const { password: _, ...sanitized } = user;
    return NextResponse.json({ ...sanitized, teams: sanitized.teams.map((ut) => ut.team) });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validierungsfehler", details: error }, { status: 400 });
    }
    logServerError("PUT /api/admin/users", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}

/**
 * DELETE: Person loeschen. Ohne angelegte Aktionen wird das Konto wirklich
 * geloescht. Hat sie Aktionen angelegt, verweisen diese auf sie; dann werden
 * Name, E-Mail und Passwort unkenntlich gemacht, Teams entfernt und das Konto
 * deaktiviert (DSGVO: personenbezogene Daten weg, Aktionen bleiben).
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID fehlt" }, { status: 400 });
  }

  if (id === session.user.id) {
    return NextResponse.json({ error: "Du kannst dich nicht selbst löschen." }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, _count: { select: { aktionen: true } } },
    });
    if (!user) {
      return NextResponse.json({ error: "Benutzer*in nicht gefunden" }, { status: 404 });
    }

    if (user._count.aktionen === 0) {
      await prisma.user.delete({ where: { id } });
      audit("USER_GELOESCHT", session.user.id, { userId: id, anonymisiert: false });
      return NextResponse.json({ anonymisiert: false });
    }

    // Unbrauchbares Passwort: Hash eines Zufallswerts, den niemand kennt
    const password = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
    await prisma.user.update({
      where: { id },
      data: {
        name: ANONYM_NAME,
        email: `${id}${ANONYM_DOMAIN}`,
        password,
        role: "EXPERT",
        active: false,
        teams: { deleteMany: {} },
      },
    });
    audit("USER_GELOESCHT", session.user.id, { userId: id, anonymisiert: true });
    return NextResponse.json({ anonymisiert: true });
  } catch (error) {
    logServerError("DELETE /api/admin/users", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
