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
  return new Request("http://localhost:3000/api/anmeldungen", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "10.0.0.1",
    },
    body: JSON.stringify(VALID_ANMELDUNG_BODY),
  });
}

function createAbmeldenRequest(token: string | null) {
  const url = token !== null
    ? `http://localhost:3000/api/anmeldungen/abmelden?token=${token}`
    : "http://localhost:3000/api/anmeldungen/abmelden";
  return new Request(url, { method: "GET" });
}

// ─── cancelToken-Generierung ────────────────────────────────────────────────

describe("cancelToken-Generierung (POST /api/anmeldungen)", () => {
  it("Erstellt Anmeldung mit 64-char Hex cancelToken", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");
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
    const { POST } = await import("@/app/api/anmeldungen/route");
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

function createAbmeldenPost(body: unknown, path = "/api/anmeldungen/abmelden") {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Selbstabmeldung: Link aus der E-Mail (GET) ändert nichts", () => {
  // Mail-Scanner (z. B. Outlook Safe Links) öffnen jeden Link einer E-Mail.
  it("Gültiger Token: leitet zur Bestätigungsseite weiter und löscht NICHTS", async () => {
    const { GET } = await import("@/app/api/anmeldungen/abmelden/route");
    const { prisma } = await import("@/lib/db");

    const res = await GET(createAbmeldenRequest("abc123valid") as any);

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/abmeldung/bestaetigen");
    expect(location.searchParams.get("token")).toBe("abc123valid");
    expect(prisma.anmeldung.delete).not.toHaveBeenCalled();
    expect(prisma.emailLog.create).not.toHaveBeenCalled();
  });

  it("Fehlender Token: leitet zu /abmeldung?fehler=1 weiter", async () => {
    const { GET } = await import("@/app/api/anmeldungen/abmelden/route");

    const res = await GET(createAbmeldenRequest(null) as any);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/abmeldung");
    expect(location).toContain("fehler=1");
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
    const { POST } = await import("@/app/api/anmeldungen/abmelden/route");
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
    const { POST } = await import("@/app/api/anmeldungen/abmelden/route");
    const { prisma } = await import("@/lib/db");

    (prisma.anmeldung.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(createAbmeldenPost({ token: "invalid-token-xyz" }) as any);

    expect(res.status).toBe(404);
    expect(prisma.anmeldung.delete).not.toHaveBeenCalled();
  });

  it("Fehlender Token → 400", async () => {
    const { POST } = await import("@/app/api/anmeldungen/abmelden/route");
    const res = await POST(createAbmeldenPost({}) as any);
    expect(res.status).toBe(400);
  });
});

describe("Selbstabmeldung: Aktions-Info für die Bestätigungsseite", () => {
  it("liefert nur Titel, Datum und Startzeit – keine persönlichen Daten", async () => {
    const { POST } = await import("@/app/api/anmeldungen/abmelden/info/route");
    const { prisma } = await import("@/lib/db");

    (prisma.anmeldung.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      aktion: { titel: "Infotisch", datum: "2099-04-01T00:00:00.000Z", startzeit: "10:00" },
    });

    const res = await POST(createAbmeldenPost({ token: "abc" }, "/api/anmeldungen/abmelden/info") as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ titel: "Infotisch", datum: "2099-04-01T00:00:00.000Z", startzeit: "10:00" });

    const args = (prisma.anmeldung.findUnique as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.select).toEqual({ aktion: { select: { titel: true, datum: true, startzeit: true } } });
    expect(prisma.anmeldung.delete).not.toHaveBeenCalled();
  });

  it("Ungültiger Token → 404", async () => {
    const { POST } = await import("@/app/api/anmeldungen/abmelden/info/route");
    const { prisma } = await import("@/lib/db");
    (prisma.anmeldung.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(createAbmeldenPost({ token: "x" }, "/api/anmeldungen/abmelden/info") as any);
    expect(res.status).toBe(404);
  });
});
