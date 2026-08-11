/**
 * Einmaliges Backfill-Skript: normalisiert bestehende Anmeldung.email-Werte
 * auf getrimmte Kleinschreibung.
 *
 * Hintergrund: Vor diesem Fix wurde die E-Mail-Adresse bei der Anmeldung
 * unverändert gespeichert (z. B. "Max@Domain.de"). Die "Meine Aktionen"-
 * Übersichtsmail (GET /api/anmeldungen/meine-aktionen) hat zwar mittlerweile
 * einen case-insensitive Vergleich (mode: "insensitive"), aber inkonsistent
 * geschriebene Bestandsdaten sollen trotzdem einmalig bereinigt werden
 * (u. a. damit der @@unique([aktionId, email])-Constraint zukünftig wirklich
 * Duplikate verhindert).
 *
 * Aufruf: npx tsx prisma/normalize-anmeldung-emails.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

async function main() {
  const anmeldungen = await prisma.anmeldung.findMany({
    select: { id: true, aktionId: true, email: true, createdAt: true },
  });

  // Aktueller Stand pro (aktionId, normalisierte E-Mail), um Kollisionen zu erkennen
  const byKey = new Map<string, { id: string; email: string; createdAt: Date }[]>();
  for (const a of anmeldungen) {
    const key = `${a.aktionId}::${normalize(a.email)}`;
    const list = byKey.get(key) ?? [];
    list.push(a);
    byKey.set(key, list);
  }

  let updated = 0;
  let skippedAlreadyNormalized = 0;
  let collisions = 0;

  for (const [key, rows] of byKey) {
    if (rows.length > 1) {
      // Gleiche Aktion + gleiche E-Mail (nach Normalisierung) mehrfach vorhanden.
      // Nicht automatisch löschen/mergen — nur melden, damit das manuell geprüft wird.
      collisions++;
      console.warn(
        `⚠️  Kollision bei ${key}: ${rows.length} Anmeldungen mit unterschiedlicher Groß-/Kleinschreibung ` +
          `(IDs: ${rows.map((r) => r.id).join(", ")}). Nicht automatisch verändert — bitte manuell prüfen.`
      );
      continue;
    }

    const [row] = rows;
    const normalizedEmail = normalize(row.email);
    if (row.email === normalizedEmail) {
      skippedAlreadyNormalized++;
      continue;
    }

    await prisma.anmeldung.update({
      where: { id: row.id },
      data: { email: normalizedEmail },
    });
    updated++;
  }

  console.log("");
  console.log("Zusammenfassung:");
  console.log(`  Angepasst:            ${updated}`);
  console.log(`  Bereits normalisiert: ${skippedAlreadyNormalized}`);
  console.log(`  Kollisionen (Manuell prüfen): ${collisions}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
