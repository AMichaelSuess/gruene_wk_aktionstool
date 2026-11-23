/**
 * Sicherheitstests: Mail-Cronjobs senden nicht doppelt
 *
 * - Ein zweiter Start, während ein Lauf noch läuft → 409
 * - Wer heute schon eine Erinnerung/Übersicht bekommen hat, bekommt bei einem
 *   erneuten Lauf keine zweite
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  anmeldung: { findMany: vi.fn() },
  aktion: { findMany: vi.fn() },
  emailLog: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const sendEmail = vi.fn(async () => true);
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...(a as [])) }));
vi.mock("@/lib/email-templates", () => ({
  erinnerungsEmail: vi.fn(() => ({ subject: "", html: "" })),
  tagesUebersichtEmail: vi.fn(() => ({ subject: "", html: "" })),
}));

const CRON_SECRET = "test-cron-secret-0123456789abcdef";

function cronRequest(name: string) {
  return new Request(`http://localhost:3000/api/cron/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
}

const ANMELDUNG = (email: string) => ({
  email,
  vorname: "Max",
  cancelToken: "t",
  aktion: {
    titel: "Infostand",
    datum: new Date(),
    startzeit: "10:00",
    endzeit: "12:00",
    adresse: "A",
    ansprechpersonName: "Lara",
    ansprechpersonEmail: "lara@test.de",
    ansprechpersonTelefon: "030",
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
});

describe("send-erinnerungen", () => {
  it("überspringt Empfänger, die in den letzten 12 h schon erinnert wurden", async () => {
    mockPrisma.anmeldung.findMany.mockResolvedValue([ANMELDUNG("schon@test.de")]);
    mockPrisma.emailLog.findMany.mockResolvedValue([{ empfaengerEmail: "schon@test.de" }]);

    const { POST } = await import("@/app/api/cron/send-reminders/route");
    const res = await POST(cronRequest("send-erinnerungen") as any);

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    const { where } = mockPrisma.emailLog.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ typ: "ERINNERUNG", status: "GESENDET" });
  });

  it("sendet an Empfänger ohne heutige Erinnerung", async () => {
    mockPrisma.anmeldung.findMany.mockResolvedValue([ANMELDUNG("neu@test.de")]);
    mockPrisma.emailLog.findMany.mockResolvedValue([]);

    const { POST } = await import("@/app/api/cron/send-reminders/route");
    await POST(cronRequest("send-erinnerungen") as any);

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("zweiter Start während eines laufenden Laufs → 409", async () => {
    let release!: (v: unknown[]) => void;
    mockPrisma.anmeldung.findMany.mockReturnValue(new Promise((r) => (release = r)));

    const { POST } = await import("@/app/api/cron/send-reminders/route");
    const first = POST(cronRequest("send-erinnerungen") as any);
    const second = await POST(cronRequest("send-erinnerungen") as any);
    expect(second.status).toBe(409);

    release([]);
    expect((await first).status).toBe(200);

    // nach Ende des Laufs ist ein neuer Start wieder möglich
    mockPrisma.anmeldung.findMany.mockResolvedValue([]);
    expect((await POST(cronRequest("send-erinnerungen") as any)).status).toBe(200);
  });
});

describe("daily-summary", () => {
  it("überspringt Ansprechpersonen, die heute schon eine Übersicht bekommen haben", async () => {
    mockPrisma.anmeldung.findMany.mockResolvedValue([
      { ...ANMELDUNG("max@test.de"), aktionId: "a1", nachname: "Muster", telefon: null, signalName: null },
    ]);
    mockPrisma.aktion.findMany.mockResolvedValue([]);
    mockPrisma.emailLog.findMany.mockImplementation(async ({ where }: { where: { typ: string } }) =>
      where.typ === "TAEGLICHE_UEBERSICHT" ? [{ empfaengerEmail: "lara@test.de" }] : []
    );

    const { POST } = await import("@/app/api/cron/daily-summary/route");
    const res = await POST(cronRequest("daily-summary") as any);

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
