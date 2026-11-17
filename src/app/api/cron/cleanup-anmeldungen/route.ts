import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron-auth";

const EMAIL_LOG_RETENTION_DAYS = 7;

function computeDeletionThreshold(datum: Date, endzeit: string): Date {
  const parts = endzeit.split(":");
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) {
    throw new Error(`Ungültiges endzeit-Format: ${endzeit}`);
  }

  const end = new Date(datum);
  end.setUTCHours(hours, minutes, 0, 0);
  return new Date(end.getTime() + 72 * 60 * 60 * 1000);
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const aktionenToClean = await prisma.aktion.findMany({
    // Actions that were already cleaned up are included too: a registration
    // that arrived later must not stay forever.
    where: {
      anmeldungen: { some: {} },
    },
    select: {
      id: true,
      datum: true,
      endzeit: true,
      wahlkreisId: true,
      statistik: { select: { id: true } },
      teams: { select: { teamId: true } },
      _count: { select: { anmeldungen: true } },
    },
  });

  const now = new Date();
  const eligible = aktionenToClean.filter((a) => {
    try {
      return computeDeletionThreshold(a.datum, a.endzeit) <= now;
    } catch {
      return false;
    }
  });

  let processed = 0;
  let deleted = 0;
  const errors: string[] = [];

  for (const aktion of eligible) {
    try {
      await prisma.$transaction(async (tx) => {
        const count = await tx.anmeldung.count({ where: { aktionId: aktion.id } });

        if (aktion.statistik) {
          await tx.aktionStatistik.update({
            where: { id: aktion.statistik.id },
            data: { anmeldungenCount: { increment: count } },
          });
        } else {
          await tx.aktionStatistik.create({
            data: {
              aktionId: aktion.id,
              anmeldungenCount: count,
              aktionDatum: aktion.datum,
              wahlkreisId: aktion.wahlkreisId,
              teams: { create: aktion.teams.map(({ teamId }) => ({ teamId })) },
            },
          });
        }

        await tx.anmeldung.deleteMany({ where: { aktionId: aktion.id } });
        await tx.emailLog.deleteMany({ where: { aktionId: aktion.id } });
      });

      processed++;
      deleted += aktion._count.anmeldungen;
    } catch {
      errors.push(aktion.id);
    }
  }

  // Send logs hold recipients' email addresses (and names for ABMELDUNG), and
  // confirmation logs carry no aktionId, so they are deleted by age as well.
  // The daily summary only reads today's logs, so 7 days is enough.
  const emailLogCutoff = new Date(now.getTime() - EMAIL_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count: emailLogsDeleted } = await prisma.emailLog.deleteMany({
    where: { gesendetAm: { lt: emailLogCutoff } },
  });

  return NextResponse.json({
    message: `${processed} Aktionen bereinigt, ${deleted} Anmeldungen gelöscht, ${emailLogsDeleted} Versandprotokolle gelöscht`,
    processed,
    deleted,
    emailLogsDeleted,
    errors,
  });
}
