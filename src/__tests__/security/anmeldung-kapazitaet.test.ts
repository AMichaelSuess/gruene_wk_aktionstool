/**
 * Sicherheitstests: Teilnahme-Limit hält auch bei gleichzeitigen Anmeldungen
 *
 * Hat eine Aktion ein Limit, laufen Zählen und Anlegen in einer Transaktion
 * mit einer Advisory-Sperre pro Aktion. Ist die Aktion inzwischen voll,
 * wird nichts angelegt und keine Bestätigung verschickt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = {
  $executeRaw: vi.fn(),
  anmeldung: { count: vi.fn(), create: vi.fn() },
};
const mockPrisma = {
  aktion: { findUnique: vi.fn() },
  anmeldung: { create: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({
  anmeldebestaetigungEmail: vi.fn(() => ({ subject: "", html: "" })),
}));

const AKTION = {
  id: "akt-1",
  titel: "Infostand",
  datum: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  startzeit: "10:00",
  endzeit: "12:00",
  adresse: "Marktplatz 1",
  ansprechpersonName: "Kim",
  ansprechpersonEmail: "kim@example.org",
  ansprechpersonTelefon: "030 123",
  status: "AKTIV",
  maxTeilnehmer: 3,
  // Stand beim ersten Lesen: noch ein Platz frei
  _count: { anmeldungen: 2 },
};

let ipCounter = 0;
function signup(body: Record<string, unknown> = {}) {
  ipCounter++;
  return new Request("http://localhost/api/anmeldungen", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `192.0.2.${ipCounter}` },
    body: JSON.stringify({
      aktionIds: ["akt-1"],
      vorname: "Max",
      nachname: "Muster",
      email: "max@example.org",
      telefon: "030 1234567",
      datenschutz: true,
      ...body,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockPrisma.aktion.findUnique.mockResolvedValue(AKTION);
});

describe("POST /api/anmeldungen: Teilnahme-Limit", () => {
  it("Platz frei → Anlegen unter Sperre in einer Transaktion", async () => {
    tx.anmeldung.count.mockResolvedValue(2);
    const { POST } = await import("@/app/api/anmeldungen/route");
    const { sendEmail } = await import("@/lib/email");

    const data = await (await POST(signup() as never)).json();

    expect(data.results).toEqual([{ aktionId: "akt-1", success: true }]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(String(tx.$executeRaw.mock.calls[0][0].join("?"))).toContain("pg_advisory_xact_lock");
    expect(tx.anmeldung.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.anmeldung.create).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("inzwischen voll (parallele Anmeldung war schneller) → nichts angelegt, keine Mail", async () => {
    tx.anmeldung.count.mockResolvedValue(3);
    const { POST } = await import("@/app/api/anmeldungen/route");
    const { sendEmail } = await import("@/lib/email");

    const data = await (await POST(signup() as never)).json();

    expect(data.results).toEqual([{ aktionId: "akt-1", error: "Aktion ist bereits voll" }]);
    expect(tx.anmeldung.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("ohne Limit → keine Transaktion nötig", async () => {
    mockPrisma.aktion.findUnique.mockResolvedValue({ ...AKTION, maxTeilnehmer: null });
    const { POST } = await import("@/app/api/anmeldungen/route");

    await POST(signup() as never);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.anmeldung.create).toHaveBeenCalledTimes(1);
  });
});
