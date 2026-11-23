/**
 * Sicherheitstests: Anmeldungen nur für Aktionen, die noch nicht begonnen haben
 *
 * Anmeldungen für vergangene Aktionen würden der 72-h-Löschung entgehen
 * (DSGVO-Speicherfrist). Die API muss sie ablehnen – nicht nur die Oberfläche.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { hatBegonnen } from "@/lib/aktion-zeit";

const mockPrisma = {
  aktion: { findUnique: vi.fn() },
  anmeldung: { create: vi.fn(), findUnique: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({
  anmeldebestaetigungEmail: vi.fn(() => ({ subject: "", html: "" })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("hatBegonnen (Berliner Zeit)", () => {
  // 17.11.2026, 14:30 Uhr in Berlin (MEZ = UTC+1)
  const now = new Date("2026-11-17T13:30:00Z");

  it("Aktion morgen → noch nicht begonnen", () => {
    expect(hatBegonnen({ datum: new Date("2026-11-18"), startzeit: "09:00" }, now)).toBe(false);
  });

  it("heute, Start später → noch nicht begonnen", () => {
    expect(hatBegonnen({ datum: new Date("2026-11-17"), startzeit: "15:00" }, now)).toBe(false);
  });

  it("heute, Start genau jetzt oder früher → begonnen", () => {
    expect(hatBegonnen({ datum: new Date("2026-11-17"), startzeit: "14:30" }, now)).toBe(true);
    expect(hatBegonnen({ datum: new Date("2026-11-17"), startzeit: "10:00" }, now)).toBe(true);
  });

  it("gestern → begonnen", () => {
    expect(hatBegonnen({ datum: new Date("2026-11-16"), startzeit: "23:00" }, now)).toBe(true);
  });

  it("kurz nach Mitternacht Berliner Zeit zählt schon der neue Tag", () => {
    // 23:30 UTC am 17.11. = 00:30 Uhr am 18.11. in Berlin
    const nachMitternacht = new Date("2026-11-17T23:30:00Z");
    expect(hatBegonnen({ datum: new Date("2026-11-17"), startzeit: "20:00" }, nachMitternacht)).toBe(true);
    expect(hatBegonnen({ datum: new Date("2026-11-18"), startzeit: "08:00" }, nachMitternacht)).toBe(false);
  });
});

describe("POST /api/signups: vergangene Aktionen", () => {
  it("Anmeldung für eine Aktion von gestern → 'Aktion nicht verfügbar', keine Anmeldung angelegt", async () => {
    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "alt",
      titel: "Vorbei",
      datum: new Date(Date.now() - 24 * 60 * 60 * 1000),
      startzeit: "10:00",
      endzeit: "12:00",
      adresse: "A",
      ansprechpersonName: "N",
      ansprechpersonEmail: "n@test.de",
      ansprechpersonTelefon: "030",
      maxTeilnehmer: null,
      status: "AKTIV",
      _count: { anmeldungen: 0 },
    });

    const { POST } = await import("@/app/api/signups/route");
    const res = await POST(
      new Request("http://localhost:3000/api/signups", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.2.0.1" },
        body: JSON.stringify({
          aktionIds: ["alt"],
          vorname: "Max",
          nachname: "Muster",
          email: "max@test.de",
          telefon: "030123456",
          datenschutz: true,
        }),
      }) as any
    );

    const body = await res.json();
    expect(body.results).toEqual([{ aktionId: "alt", error: "Aktion nicht verfügbar" }]);
    expect(mockPrisma.anmeldung.create).not.toHaveBeenCalled();
  });
});
