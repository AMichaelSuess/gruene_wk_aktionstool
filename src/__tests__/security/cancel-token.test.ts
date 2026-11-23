/**
 * Sicherheitstests: cancelToken-Generierung und Selbstabmeldung
 *
 * Prüft, dass:
 * - cancelToken korrekt generiert wird (64-char hex)
 * - cancelToken nicht in der API-Response erscheint
 * - der Abmelde-Link (GET) nichts löscht, sondern zur Bestätigungsseite führt
 * - erst die Bestätigung (POST) die Anmeldung löscht
 * - Abmeldung einen EmailLog-Eintrag mit typ ABMELDUNG erstellt
 * - Ungültige/fehlende Token zu einem Fehler führen
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    aktion: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    anmeldung: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    emailLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    wahlkreis: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({
  anmeldebestaetigungEmail: vi.fn(() => ({ subject: "", html: "" })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

const VALID_AKTION = {
  id: "aktion-1",
  titel: "Infotisch Mitte",
  datum: new Date("2099-04-01"),
  startzeit: "10:00",
  endzeit: "14:00",
  adresse: "Alexanderplatz 1, Berlin",
  ansprechpersonName: "Lara Test",
  ansprechpersonEmail: "lara@test.de",
  ansprechpersonTelefon: "030123456",
  kategorie: "SONSTIGES",
  status: "AKTIV",
  maxTeilnehmer: null,
  _count: { anmeldungen: 0 },
};

const VALID_ANMELDUNG_BODY = {
  aktionIds: ["aktion-1"],
  vorname: "Max",
  nachname: "Muster",
  email: "max@test.de",
  telefon: "01711234567",
  datenschutz: true,
};

function createAnmeldungRequest() {
  return new Request("http://localhost:3000/api/signups", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "10.0.0.1",
    },
    body: JSON.stringify(VALID_ANMELDUNG_BODY),
  });
}

describe("cancelToken-Generierung (POST /api/signups)", () => {
  it("Erstellt Anmeldung mit 64-char Hex cancelToken", async () => {
    const { POST } = await import("@/app/api/signups/route");
    const { prisma } = await import("@/lib/db");

    (prisma.aktion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(VALID_AKTION);
    (prisma.anmeldung.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "anm-1" });

    const req = createAnmeldungRequest();
    await POST(req as any);

    expect(prisma.anmeldung.create).toHaveBeenCalledOnce();
    const callArgs = (prisma.anmeldung.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.data.cancelToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it("cancelToken erscheint nicht im Response-Body", async () => {
    const { POST } = await import("@/app/api/signups/route");
    const { prisma } = await import("@/lib/db");

    (prisma.aktion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(VALID_AKTION);
    (prisma.anmeldung.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "anm-1" });

    const req = createAnmeldungRequest();
    const res = await POST(req as any);
    const body = await res.json();
    const bodyStr = JSON.stringify(body);

    expect(bodyStr).not.toContain("cancelToken");
    // Also check token value doesn't appear (it's random, but verify the key is absent)
    expect(body).not.toHaveProperty("cancelToken");
  });
});

// ─── Selbstabmeldung ────────────────────────────────────────────────────────

function createAbmeldenPost(body: unknown, path = "/api/signups/unsubscribe") {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Selbstabmeldung: Link aus der E-Mail ändert nichts", () => {
  // Mail-Scanner (z. B. Outlook Safe Links) öffnen jeden Link einer E-Mail.
  // Der Link führt deshalb auf die Bestätigungsseite; erst ihr Knopf meldet ab.
  it("Link in der Bestätigungsmail zeigt auf die Seite, nicht auf die API", async () => {
    // Die Datei mockt die Templates fuer die Handler-Tests; hier zaehlt das echte
    const { anmeldebestaetigungEmail } =
      await vi.importActual<typeof import("@/lib/email-templates")>("@/lib/email-templates");
    const { html } = anmeldebestaetigungEmail(
      "Erika",
      "erika@example.org",
      [
        {
          titel: "Infostand",
          datum: new Date("2099-01-01"),
          startzeit: "10:00",
          endzeit: "12:00",
          adresse: "Markt 1",
          ansprechpersonName: "Anna",
          ansprechpersonEmail: "anna@example.org",
          ansprechpersonTelefon: "0170 1234567",
        },
      ],
      ["abc123valid"]
    );

    expect(html).toMatch(/href="[^"]*\/unsubscribe\?token=abc123valid"/);
    expect(html).not.toContain("/api/signups/unsubscribe");
  });

  it("Die Abmelde-API nimmt keine GET-Anfragen an", async () => {
    const route = await import("@/app/api/signups/unsubscribe/route");
    expect(route).not.toHaveProperty("GET");
  });
});

describe("Selbstabmeldung: Bestätigung per Knopf (POST)", () => {
  const MOCK_ANMELDUNG = {
    id: "anm-1",
    aktionId: "aktion-1",
    vorname: "Max",
    nachname: "Muster",
    email: "max@test.de",
  };

  it("Gültiger Token: löscht Anmeldung und legt EmailLog ABMELDUNG an", async () => {
    const { POST } = await import("@/app/api/signups/unsubscribe/route");
    const { prisma } = await import("@/lib/db");

    (prisma.anmeldung.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ANMELDUNG);
    (prisma.anmeldung.delete as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ANMELDUNG);
    (prisma.emailLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "log-1" });

    const res = await POST(createAbmeldenPost({ token: "abc123valid" }) as any);

    expect(res.status).toBe(200);
    expect(prisma.anmeldung.delete).toHaveBeenCalledWith({ where: { cancelToken: "abc123valid" } });
    const logArgs = (prisma.emailLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(logArgs.data.typ).toBe("ABMELDUNG");
    expect(logArgs.data.empfaengerEmail).toBe("max@test.de");
    expect(logArgs.data.aktionId).toBe("aktion-1");
  });

  it("Ungültiger Token → 404, nichts gelöscht", async () => {
    const { POST } = await import("@/app/api/signups/unsubscribe/route");
    const { prisma } = await import("@/lib/db");

    (prisma.anmeldung.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(createAbmeldenPost({ token: "invalid-token-xyz" }) as any);

    expect(res.status).toBe(404);
    expect(prisma.anmeldung.delete).not.toHaveBeenCalled();
  });

  it("Fehlender Token → 400", async () => {
    const { POST } = await import("@/app/api/signups/unsubscribe/route");
    const res = await POST(createAbmeldenPost({}) as any);
    expect(res.status).toBe(400);
  });
});

describe("Selbstabmeldung: Aktions-Info für die Bestätigungsseite", () => {
  it("liefert nur Titel, Datum und Startzeit – keine persönlichen Daten", async () => {
    const { POST } = await import("@/app/api/signups/lookup/route");
    const { prisma } = await import("@/lib/db");

    (prisma.anmeldung.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      aktion: { titel: "Infotisch", datum: "2099-04-01T00:00:00.000Z", startzeit: "10:00" },
    });

    const res = await POST(createAbmeldenPost({ token: "abc" }, "/api/signups/lookup") as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ titel: "Infotisch", datum: "2099-04-01T00:00:00.000Z", startzeit: "10:00" });

    const args = (prisma.anmeldung.findUnique as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.select).toEqual({ aktion: { select: { titel: true, datum: true, startzeit: true } } });
    expect(prisma.anmeldung.delete).not.toHaveBeenCalled();
  });

  it("Ungültiger Token → 404", async () => {
    const { POST } = await import("@/app/api/signups/lookup/route");
    const { prisma } = await import("@/lib/db");
    (prisma.anmeldung.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(createAbmeldenPost({ token: "x" }, "/api/signups/lookup") as any);
    expect(res.status).toBe(404);
  });
});
