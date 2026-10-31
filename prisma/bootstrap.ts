/**
 * Einmalige Grundeinrichtung einer Produktions-Datenbank.
 *
 * Legt die Wahlkreise (aus WAHLKREISE_JSON bzw. district-config), je Wahlkreis
 * ein Team ("Team <Name>") und einen Admin-Account an – ohne die Demo-Daten aus
 * seed.ts. Mehrfaches Ausführen ist unschädlich: Wahlkreise werden per Nummer
 * aktualisiert, ein Team wird nur für Wahlkreise ohne Team angelegt, ein bereits
 * vorhandener Account wird nicht verändert.
 *
 * Benötigte Umgebungsvariablen:
 *   BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD (min. 12 Zeichen),
 *   BOOTSTRAP_ADMIN_NAME (optional, Default "Admin")
 *
 * Lokal:     npx tsx prisma/bootstrap.ts
 * Container: node dist/bootstrap.js
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { districtConfig } from "../src/lib/district-config";

const prisma = new PrismaClient();

function fail(message: string): never {
  console.error(`FEHLER: ${message}`);
  process.exit(1);
}

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Admin";

  if (!email || !password) {
    fail("BOOTSTRAP_ADMIN_EMAIL und BOOTSTRAP_ADMIN_PASSWORD müssen gesetzt sein");
  }
  if (password.length < 12) {
    fail("BOOTSTRAP_ADMIN_PASSWORD muss mindestens 12 Zeichen lang sein");
  }

  // district-config fällt bei ungültigem JSON still auf die Berlin-Mitte-Defaults
  // zurück – hier soll stattdessen abgebrochen werden.
  const wahlkreiseJson = process.env.WAHLKREISE_JSON;
  if (wahlkreiseJson) {
    try {
      JSON.parse(wahlkreiseJson);
    } catch {
      fail("WAHLKREISE_JSON ist kein gültiges JSON");
    }
  } else {
    console.warn("WARNUNG: WAHLKREISE_JSON ist nicht gesetzt – es werden die Berlin-Mitte-Defaults verwendet");
  }

  for (const wk of districtConfig.wahlkreise) {
    const wahlkreis = await prisma.wahlkreis.upsert({
      where: { nummer: wk.nummer },
      update: { name: wk.name },
      create: wk,
    });
    console.log(`Wahlkreis ${wk.nummer}: ${wk.name}`);

    // Ein Team pro Wahlkreis. Vorhandene Teams (auch umbenannte) bleiben unverändert.
    const team = await prisma.team.findFirst({ where: { wahlkreisId: wahlkreis.id } });
    if (team) {
      console.log(`  Team vorhanden: ${team.name}`);
    } else {
      const created = await prisma.team.create({
        data: { name: `Team ${wk.name}`, wahlkreisId: wahlkreis.id },
      });
      console.log(`  Team angelegt: ${created.name}`);
    }
  }

  const configured = new Set(districtConfig.wahlkreise.map((wk) => wk.nummer));
  const extra = await prisma.wahlkreis.findMany({
    where: { nummer: { notIn: [...configured] } },
  });
  for (const wk of extra) {
    console.warn(`WARNUNG: Wahlkreis ${wk.nummer} (${wk.name}) ist nicht konfiguriert, bleibt aber bestehen`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Account ${email} existiert bereits (Rolle ${existing.role}) – unverändert`);
  } else {
    await prisma.user.create({
      data: {
        email,
        name,
        password: await bcrypt.hash(password, 12),
        role: "ADMIN",
      },
    });
    console.log(`Admin-Account ${email} angelegt`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
