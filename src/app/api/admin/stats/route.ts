import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getISOWeek, getISOWeekYear } from "date-fns";
import type { Prisma } from "@prisma/client";
import { expertAktionWhere } from "@/lib/aktion-teams";

// Admins sehen alles; Expert*innen nur ihre Teams und selbst angelegte Aktionen
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const teamIds = session.user.teamIds ?? [];
  const aktionWhere: Prisma.AktionWhereInput = isAdmin ? {} : expertAktionWhere(session.user);
  // Archivierte Aktionen kennen nur ihre Teams, nicht wer sie angelegt hat
  const statistikWhere: Prisma.AktionStatistikWhereInput = isAdmin
    ? {}
    : { teams: { some: { teamId: { in: teamIds } } } };
  const teamWhere: Prisma.TeamWhereInput = isAdmin ? {} : { id: { in: teamIds } };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalAktionen,
    activeAktionen,
    abgesagteAktionen,
    totalAnmeldungen,
    teamCount,
    userCount,
    wahlkreise,
    historicalAggregate,
    archivedByWahlkreis,
    pastAktionen,
    upcomingAktionen,
    teams,
    archivedByTeam,
    liveAktionenForKW,
    archivedForKW,
  ] = await Promise.all([
    prisma.aktion.count({ where: aktionWhere }),
    prisma.aktion.count({ where: { ...aktionWhere, status: { in: ["AKTIV", "GEAENDERT"] } } }),
    prisma.aktion.count({ where: { ...aktionWhere, status: "ABGESAGT" } }),
    prisma.anmeldung.count({ where: { aktion: aktionWhere } }),
    prisma.team.count({ where: teamWhere }),
    prisma.user.count({ where: isAdmin ? {} : { teams: { some: { teamId: { in: teamIds } } } } }),
    prisma.wahlkreis.findMany({
      include: {
        aktionen: {
          where: aktionWhere,
          include: { _count: { select: { anmeldungen: true } } },
        },
      },
      orderBy: { nummer: "asc" },
    }),
    prisma.aktionStatistik.aggregate({ where: statistikWhere, _sum: { anmeldungenCount: true } }),
    prisma.aktionStatistik.groupBy({
      by: ["wahlkreisId"],
      where: statistikWhere,
      _sum: { anmeldungenCount: true },
    }),
    prisma.aktion.count({ where: { ...aktionWhere, datum: { lt: today } } }),
    prisma.aktion.count({ where: { ...aktionWhere, datum: { gte: today } } }),
    prisma.team.findMany({
      where: teamWhere,
      select: {
        id: true,
        name: true,
        _count: { select: { aktionen: true } },
        aktionen: {
          select: { aktion: { select: { _count: { select: { anmeldungen: true } } } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    // Eine archivierte Aktion zaehlt fuer jedes ihrer Teams
    prisma.aktionStatistikTeam.findMany({
      where: isAdmin ? {} : { teamId: { in: teamIds } },
      select: { teamId: true, statistik: { select: { anmeldungenCount: true } } },
    }),
    prisma.aktion.findMany({
      where: aktionWhere,
      select: { datum: true, anmeldungen: { select: { id: true } } },
    }),
    prisma.aktionStatistik.findMany({
      where: statistikWhere,
      select: { aktionDatum: true, anmeldungenCount: true },
    }),
  ]);

  const historicalSum = historicalAggregate._sum.anmeldungenCount ?? 0;
  const archivedMap = new Map(
    archivedByWahlkreis.map((r) => [r.wahlkreisId, r._sum.anmeldungenCount ?? 0])
  );

  const anmeldungenByWahlkreis = wahlkreise.map((wk) => ({
    wahlkreis: wk.name,
    nummer: wk.nummer,
    count:
      wk.aktionen.reduce((sum, a) => sum + a._count.anmeldungen, 0) +
      (archivedMap.get(wk.id) ?? 0),
  }));

  const archivedTeamMap = new Map<string, { staende: number; anmeldungen: number }>();
  for (const r of archivedByTeam) {
    const entry = archivedTeamMap.get(r.teamId) ?? { staende: 0, anmeldungen: 0 };
    entry.staende += 1;
    entry.anmeldungen += r.statistik.anmeldungenCount;
    archivedTeamMap.set(r.teamId, entry);
  }

  const staendeByTeam = teams
    .map((t) => ({
      team: t.name,
      count: t._count.aktionen + (archivedTeamMap.get(t.id)?.staende ?? 0),
    }))
    .sort((a, b) => b.count - a.count);

  const anmeldungenByTeam = teams
    .map((t) => ({
      team: t.name,
      count:
        t.aktionen.reduce((sum, a) => sum + a.aktion._count.anmeldungen, 0) +
        (archivedTeamMap.get(t.id)?.anmeldungen ?? 0),
    }))
    .sort((a, b) => b.count - a.count);

  const kwMap = new Map<
    string,
    { kw: number; year: number; staende: number; anmeldungen: number }
  >();

  for (const a of liveAktionenForKW) {
    const kw = getISOWeek(a.datum);
    const year = getISOWeekYear(a.datum);
    const key = `${year}-${String(kw).padStart(2, "0")}`;
    const existing = kwMap.get(key) ?? { kw, year, staende: 0, anmeldungen: 0 };
    existing.staende += 1;
    existing.anmeldungen += a.anmeldungen.length;
    kwMap.set(key, existing);
  }

  for (const s of archivedForKW) {
    const kw = getISOWeek(s.aktionDatum);
    const year = getISOWeekYear(s.aktionDatum);
    const key = `${year}-${String(kw).padStart(2, "0")}`;
    const existing = kwMap.get(key) ?? { kw, year, staende: 0, anmeldungen: 0 };
    existing.staende += 1;
    existing.anmeldungen += s.anmeldungenCount;
    kwMap.set(key, existing);
  }

  const byKalenderwoche = Array.from(kwMap.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.kw - b.kw
  );

  return NextResponse.json({
    totalAktionen,
    activeAktionen,
    abgesagteAktionen,
    totalAnmeldungen,
    totalAnmeldungenGesamt: totalAnmeldungen + historicalSum,
    teamCount,
    userCount,
    anmeldungenByWahlkreis,
    pastAktionen,
    upcomingAktionen,
    staendeByTeam,
    anmeldungenByTeam,
    byKalenderwoche,
  });
}
