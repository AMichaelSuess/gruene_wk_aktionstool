import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit, logServerError } from "@/lib/audit";
import { userSchema } from "@/lib/validators";
import { ANONYM_DOMAIN } from "@/lib/anonym";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  // Expert*innen sehen aktive Mitglieder ihrer eigenen Teams (bei jeder Person nur
  // die gemeinsamen Teams) und alle aktiven Admins als Ansprechpersonen.
  // Bearbeiten bleibt Admins vorbehalten.
  if (session.user.role !== "ADMIN") {
    const teamIds = session.user.teamIds ?? [];
    const members = await prisma.user.findMany({
      where: {
        active: true,
        NOT: { email: { endsWith: ANONYM_DOMAIN } },
        OR: [{ role: "ADMIN" }, { teams: { some: { teamId: { in: teamIds } } } }],
      },
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
    // Admins haben ueber ihre Rolle Zugriff auf alle Teams, Mitgliedschaften waeren bedeutungslos
    const teamIds = validated.role === "ADMIN" ? [] : (validated.teamIds ?? []);

    const user = await prisma.user.create({
      data: {
        name: validated.name,
        email: validated.email,
        password: hashedPassword,
        role: validated.role,
        teams: {
          create: teamIds.map((teamId) => ({ teamId })),
        },
      },
      include: { teams: { include: { team: true } } },
    });

    audit("USER_ERSTELLT", session.user.id, {
      userId: user.id,
      role: user.role,
      teamIds,
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
    logServerError("POST /api/users", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}

