/**
 * Known test data. prepare-db.ts creates it, the specs refer to it.
 * Each flow that changes data gets its own action, so specs don't depend
 * on each other's order.
 */
export const ADMIN = { email: "admin@gruene-mitte.de", password: "admin1234" };
export const EXPERT = { email: "expert@gruene-mitte.de", password: "expert1234" };

// From prisma/seed.ts
export const TEAM_MITTE_ID = "seed-team-1";

const token = (digit: string) => digit.repeat(64);

export const AKTIONEN = {
  // Public sign-up through the list and the form
  oeffentlich: { id: "e2e-aktion-oeffentlich", titel: "E2E Infostand am Markt" },
  // Volunteer with a known unsubscribe token
  abmelden: {
    id: "e2e-aktion-abmelden",
    titel: "E2E Haustür Abmeldung",
    anmeldung: { email: "abmelden@e2e.test", cancelToken: token("a") },
  },
  // Expert edits it
  bearbeiten: { id: "e2e-aktion-bearbeiten", titel: "E2E Flyern zum Bearbeiten" },
  // Expert deletes a sign-up on the signups page
  anmeldungLoeschen: {
    id: "e2e-aktion-anmeldung-loeschen",
    titel: "E2E Plakatieren mit Anmeldung",
    anmeldung: { vorname: "Erika", nachname: "Löschmich", email: "loeschen@e2e.test", cancelToken: token("b") },
  },
  // Expert cancels it
  absagen: { id: "e2e-aktion-absagen", titel: "E2E Infostand zum Absagen" },
  // Admin deletes it for good
  loeschen: { id: "e2e-aktion-loeschen", titel: "E2E Aktion zum Löschen" },
} as const;
