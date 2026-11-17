/**
 * Sicherheitstests: Audit-Protokoll
 *
 * Exporte personenbezogener Daten und Änderungen an Accounts hinterlassen
 * eine Protokollzeile (wer, was, wann) – ohne selbst personenbezogene Daten
 * oder Passwörter zu enthalten.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockAuth, EXPERT_TEAM_A, ADMIN_SESSION, createJsonRequest } from "./helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockPrisma = {
  anmeldung: { findMany: vi.fn() },
  user: { update: vi.fn(), delete: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/excel", () => ({
  createAnmeldungenExcel: vi.fn(async () => new ArrayBuffer(0)),
  createAnmeldungenTxt: vi.fn(() => ""),
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "$2a$12$hash") } }));

let infoSpy: ReturnType<typeof vi.spyOn>;

function auditLines(): Record<string, unknown>[] {
  return infoSpy.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((l: string) => l.includes('"audit":true'))
    .map((l: string) => JSON.parse(l));
}

beforeEach(() => {
  vi.clearAllMocks();
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  infoSpy.mockRestore();
});

describe("Audit-Protokoll", () => {
  it("Export von Anmeldungen → eine Zeile mit Anzahl, ohne E-Mail-Adressen oder Namen", async () => {
    await mockAuth(EXPERT_TEAM_A);
    mockPrisma.anmeldung.findMany.mockResolvedValue([
      {
        vorname: "Max",
        nachname: "Muster",
        email: "max@test.de",
        telefon: "0171234",
        signalName: null,
        aktion: {
          titel: "T",
          datum: new Date("2099-01-01"),
          adresse: "A",
          startzeit: "10:00",
          endzeit: "12:00",
          ansprechpersonName: "Lara",
        },
      },
    ]);

    const { GET } = await import("@/app/api/export/route");
    await GET(new Request("http://localhost:3000/api/export?format=xlsx&aktionId=aktion-1") as any);

    const lines = auditLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: "EXPORT_ANMELDUNGEN",
      actorId: EXPERT_TEAM_A.user.id,
      format: "xlsx",
      aktionId: "aktion-1",
      count: 1,
    });
    const raw = JSON.stringify(lines[0]);
    expect(raw).not.toContain("max@test.de");
    expect(raw).not.toContain("Muster");
  });

  it("Account-Änderung → Feldnamen und neue Rolle, aber nie Passwort, Name oder E-Mail", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.user.update.mockResolvedValue({
      id: "user-9",
      name: "Neuer Name",
      email: "neu@test.de",
      password: "$2a$12$hash",
      role: "ADMIN",
      teams: [],
    });

    const { PUT } = await import("@/app/api/admin/users/route");
    await PUT(
      createJsonRequest("/api/admin/users", {
        id: "user-9",
        name: "Neuer Name",
        email: "neu@test.de",
        password: "GeheimesPasswort123",
        role: "ADMIN",
      }, "PUT") as any
    );

    const lines = auditLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ event: "USER_GEAENDERT", userId: "user-9", role: "ADMIN" });
    expect(lines[0].fields).toEqual(expect.arrayContaining(["name", "email", "password", "role"]));
    const raw = JSON.stringify(lines[0]);
    expect(raw).not.toContain("GeheimesPasswort123");
    expect(raw).not.toContain("$2a$12$hash");
    expect(raw).not.toContain("neu@test.de");
    expect(raw).not.toContain("Neuer Name");
  });

  it("Account löschen → Zeile USER_GELOESCHT", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.user.delete.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/admin/users/route");
    await DELETE(new Request("http://localhost:3000/api/admin/users?id=user-9", { method: "DELETE" }) as any);

    expect(auditLines()).toEqual([
      expect.objectContaining({ event: "USER_GELOESCHT", userId: "user-9", actorId: ADMIN_SESSION.user.id }),
    ]);
  });
});
