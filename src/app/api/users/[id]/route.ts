import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit, logServerError } from "@/lib/audit";
import { userUpdateSchema } from "@/lib/validators";
import { ANONYM_DOMAIN, ANONYM_NAME } from "@/lib/anonym";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    // The ID comes from the path, never from the body
    const validated = userUpdateSchema.parse({ ...body, id });

    // Sich selbst die Admin-Rolle entziehen oder deaktivieren wuerde im Zweifel
    // den letzten Admin aussperren. Da die handelnde Person selbst aktiver Admin
    // ist, bleibt so immer mindestens ein Admin uebrig.
    if (validated.id === session.user.id && (validated.role === "EXPERT" || validated.active === false)) {
      return NextResponse.json(
        { error: "Du kannst dir die Admin-Rolle nicht selbst entziehen und dich nicht selbst deaktivieren." },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.email !== undefined) updateData.email = validated.email;
    if (validated.role !== undefined) updateData.role = validated.role;
    if (validated.active !== undefined) updateData.active = validated.active;
    if (validated.password !== undefined) {
      updateData.password = await bcrypt.hash(validated.password, 12);
      // Neues Passwort beendet alle Sitzungen der Person (z. B. nach einem Verdacht)
      updateData.sessionVersion = { increment: 1 };
    }

    // Admins haben keine Team-Mitgliedschaften: Wird jemand Admin, verschwinden sie;
    // Team-Angaben fuer bestehende Admins werden ignoriert
    let teamIds = validated.teamIds;
    let wirdAdmin = validated.role === "ADMIN";
    if (validated.role === undefined && teamIds !== undefined) {
      const current = await prisma.user.findUnique({ where: { id: validated.id }, select: { role: true } });
      wirdAdmin = current?.role === "ADMIN";
    }
    if (wirdAdmin) teamIds = [];
    if (teamIds !== undefined) {
      updateData.teams = {
        deleteMany: {},
        create: teamIds.map((teamId: string) => ({ teamId })),
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
      teamIds,
    });

    const { password: _, ...sanitized } = user;
    return NextResponse.json({ ...sanitized, teams: sanitized.teams.map((ut) => ut.team) });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validierungsfehler", details: error }, { status: 400 });
    }
    logServerError("PUT /api/users/[id]", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}

/**
 * DELETE: Person loeschen. Ohne angelegte Aktionen wird das Konto wirklich
 * geloescht. Hat sie Aktionen angelegt, verweisen diese auf sie; dann werden
 * Name, E-Mail und Passwort unkenntlich gemacht, Teams entfernt und das Konto
 * deaktiviert (DSGVO: personenbezogene Daten weg, Aktionen bleiben).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const { id } = await params;

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
        sessionVersion: { increment: 1 },
        teams: { deleteMany: {} },
      },
    });
    audit("USER_GELOESCHT", session.user.id, { userId: id, anonymisiert: true });
    return NextResponse.json({ anonymisiert: true });
  } catch (error) {
    logServerError("DELETE /api/users/[id]", error);
    return NextResponse.json({ error: "Serverfehler" }, { status: 500 });
  }
}
