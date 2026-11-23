/**
 * Resets the E2E database before the server starts: all migrations, the
 * regular seed (users, teams, Wahlkreise) and the E2E actions from fixtures.ts.
 *
 * Runs as the first step of the Playwright webServer command.
 */
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { e2eEnv, E2E_DATABASE_URL } from "./env";
import { AKTIONEN, TEAM_MITTE_ID } from "./fixtures";

const env = { ...process.env, ...e2eEnv };

execSync("npx prisma migrate reset --force --skip-seed --skip-generate", { env, stdio: "inherit" });
execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

/** Date (UTC midnight) a number of days from today. */
function inTagen(tage: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + tage);
  return d;
}

async function main() {
  const expert = await prisma.user.findUniqueOrThrow({ where: { email: "expert@gruene-mitte.de" } });
  const wahlkreis = await prisma.wahlkreis.findFirstOrThrow({ orderBy: { nummer: "asc" } });

  const basis = (tage: number) => ({
    datum: inTagen(tage),
    startzeit: "10:00",
    endzeit: "12:00",
    adresse: "Alexanderplatz 1",
    latitude: 52.5219,
    longitude: 13.4132,
    wahlkreisId: wahlkreis.id,
    ansprechpersonName: "Erna Kontakt",
    ansprechpersonEmail: "kontakt@e2e.test",
    ansprechpersonTelefon: "030 1234567",
    maxTeilnehmer: 10,
    createdById: expert.id,
    teams: { create: [{ teamId: TEAM_MITTE_ID }] },
  });

  const { oeffentlich, abmelden, bearbeiten, anmeldungLoeschen, absagen, loeschen } = AKTIONEN;

  await prisma.aktion.create({ data: { ...basis(14), id: oeffentlich.id, titel: oeffentlich.titel, kategorie: "INFOSTAND" } });
  await prisma.aktion.create({
    data: {
      ...basis(15),
      id: abmelden.id,
      titel: abmelden.titel,
      kategorie: "HAUSTUER",
      anmeldungen: {
        create: [{ vorname: "Abmelde", nachname: "Person", telefon: "0170 1111111", ...abmelden.anmeldung }],
      },
    },
  });
  await prisma.aktion.create({ data: { ...basis(16), id: bearbeiten.id, titel: bearbeiten.titel, kategorie: "FLYERN" } });
  await prisma.aktion.create({
    data: {
      ...basis(17),
      id: anmeldungLoeschen.id,
      titel: anmeldungLoeschen.titel,
      kategorie: "PLAKATIEREN",
      anmeldungen: { create: [{ telefon: "0170 2222222", ...anmeldungLoeschen.anmeldung }] },
    },
  });
  await prisma.aktion.create({ data: { ...basis(18), id: absagen.id, titel: absagen.titel, kategorie: "INFOSTAND" } });
  await prisma.aktion.create({ data: { ...basis(19), id: loeschen.id, titel: loeschen.titel } });

  console.log("E2E-Aktionen angelegt");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
