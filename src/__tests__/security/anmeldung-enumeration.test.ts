/**
 * Sicherheitstests: Öffentliche Anmeldung verrät keine bestehenden Anmeldungen
 *
 * Die Teilnahme an Wahlkampf-Aktionen ist eine politische Meinung (Art. 9 DSGVO).
 * Wer eine fremde E-Mail-Adresse einträgt, darf an der Antwort nicht erkennen,
 * ob diese Person schon für eine Aktion angemeldet ist.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  aktion: { findUnique: vi.fn() },
  anmeldung: { create: vi.fn(), findUnique: vi.fn() },
};

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({
  anmeldebestaetigungEmail: vi.fn(() => ({ subject: "", html: "" })),
}));

const AKTION = {
  titel: "Infotisch",
  datum: new Date("2099-12-01"),
  startzeit: "10:00",
  endzeit: "12:00",
  adresse: "Alexanderplatz 1",
  ansprechpersonName: "Lara Test",
  ansprechpersonEmail: "lara@test.de",
  ansprechpersonTelefon: "030123456",
  maxTeilnehmer: null,
  status: "AKTIV",
  _count: { anmeldungen: 0 },
};

function signup(aktionIds: string[], ip: string) {
  return new Request("http://localhost:3000/api/anmeldungen", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({
      aktionIds,
      vorname: "Max",
      nachname: "Muster",
      email: "ziel@example.org",
      telefon: "030123456",
      datenschutz: true,
    }),
  });
}

const uniqueError = () => new Error("Unique constraint failed on the fields: (`aktionId`,`email`)");

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockPrisma.aktion.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve({ id: where.id, ...AKTION })
  );
});

describe("Öffentliche Anmeldung: keine Auskunft über bestehende Anmeldungen", () => {
  it("Doppelte Anmeldung liefert dieselbe Antwort wie eine neue Anmeldung", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");

    mockPrisma.anmeldung.create.mockResolvedValueOnce({});
    const neu = await POST(signup(["aktion-1"], "10.0.0.1") as any);

    mockPrisma.anmeldung.create.mockRejectedValueOnce(uniqueError());
    mockPrisma.anmeldung.findUnique.mockResolvedValueOnce({ cancelToken: "alt" });
    const doppelt = await POST(signup(["aktion-1"], "10.0.0.2") as any);

    expect(doppelt.status).toBe(neu.status);
    expect(await doppelt.json()).toEqual(await neu.json());
  });

  it("Nur doppelte Anmeldungen → keine E-Mail", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");
    const { sendEmail } = await import("@/lib/email");

    mockPrisma.anmeldung.create.mockRejectedValueOnce(uniqueError());
    mockPrisma.anmeldung.findUnique.mockResolvedValueOnce({ cancelToken: "alt" });
    await POST(signup(["aktion-1"], "10.0.0.3") as any);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("Neue + bestehende Anmeldung → eine E-Mail mit beiden Aktionen und dem bestehenden Abmelde-Token", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");
    const { sendEmail } = await import("@/lib/email");
    const { anmeldebestaetigungEmail } = await import("@/lib/email-templates");

    mockPrisma.anmeldung.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(uniqueError());
    mockPrisma.anmeldung.findUnique.mockResolvedValueOnce({ cancelToken: "alt" });

    const res = await POST(signup(["aktion-neu", "aktion-alt"], "10.0.0.4") as any);
    const body = await res.json();

    expect(body.results).toEqual([
      { aktionId: "aktion-neu", success: true },
      { aktionId: "aktion-alt", success: true },
    ]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [, , aktionen, tokens] = (anmeldebestaetigungEmail as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(aktionen).toHaveLength(2);
    expect(tokens[1]).toBe("alt");
  });

  it("Antwort wartet nicht auf den Mailversand (Antwortzeit verraet nichts)", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");
    const { sendEmail } = await import("@/lib/email");
    const { after } = await import("next/server");

    // Ein Mailserver, der nie antwortet: die Antwort muss trotzdem kommen
    (sendEmail as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));
    mockPrisma.anmeldung.create.mockResolvedValueOnce({});

    const res = await POST(signup(["aktion-1"], "10.0.0.5") as any);

    expect(res.status).toBe(200);
    expect(after).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("Versand laeuft ueber after(), nicht direkt im Handler", async () => {
    const { readFileSync } = await import("fs");
    const source = readFileSync("src/app/api/anmeldungen/route.ts", "utf8");
    expect(source).not.toMatch(/await sendEmail\(/);
    expect(source).toMatch(/after\(\s*\(\)\s*=>\s*\n?\s*sendEmail\(/);
  });
});

