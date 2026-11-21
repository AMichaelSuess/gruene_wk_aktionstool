/**
 * Sicherheitstests: eigenes Konto (Mein Konto)
 *
 * Passwort aendern (POST /api/user/passwort): nur mit Sitzung und korrektem
 * aktuellem Passwort; das neue Passwort muss die Passwortregeln erfuellen;
 * Fehlversuche werden pro Nutzer begrenzt.
 * Name aendern (PATCH /api/user/konto): nur der eigene Name, sonst nichts.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { mockAuth, createJsonRequest, EXPERT_TEAM_A, EXPERT_TEAM_B } from "./helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockPrisma = {
  user: { findUnique: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const AKTUELL = "altes-passwort-123";
const NEU = "neues-passwort-456";
let hash: string;

beforeAll(async () => {
  hash = await bcrypt.hash(AKTUELL, 4);
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve({ id: where.id, password: hash, active: true })
  );
  mockPrisma.user.update.mockResolvedValue({});
});

async function post(body: unknown) {
  const { POST } = await import("@/app/api/user/passwort/route");
  return POST(createJsonRequest("/api/user/passwort", body) as any);
}

describe("Passwort ändern", () => {
  it("lehnt Anfragen ohne Sitzung ab", async () => {
    await mockAuth(null);
    const res = await post({ aktuellesPasswort: AKTUELL, neuesPasswort: NEU });
    expect(res.status).toBe(401);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("ändert das Passwort bei korrektem aktuellem Passwort", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const res = await post({ aktuellesPasswort: AKTUELL, neuesPasswort: NEU });
    expect(res.status).toBe(200);

    const args = mockPrisma.user.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: EXPERT_TEAM_A.user.id });
    expect(await bcrypt.compare(NEU, args.data.password)).toBe(true);
  });

  it("beendet mit dem Passwortwechsel alle bestehenden Sitzungen (neue sessionVersion)", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const res = await post({ aktuellesPasswort: AKTUELL, neuesPasswort: NEU });
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 });
  });

  it("lehnt ein falsches aktuelles Passwort ab", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const res = await post({ aktuellesPasswort: "falsch-falsch-falsch", neuesPasswort: NEU });
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("lehnt zu kurze neue Passwörter ab", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const res = await post({ aktuellesPasswort: AKTUELL, neuesPasswort: "kurz" });
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("sperrt nach 5 falschen aktuellen Passwörtern", async () => {
    await mockAuth(EXPERT_TEAM_B);
    for (let i = 0; i < 5; i++) {
      await post({ aktuellesPasswort: "falsch-falsch-falsch", neuesPasswort: NEU });
    }
    const res = await post({ aktuellesPasswort: AKTUELL, neuesPasswort: NEU });
    expect(res.status).toBe(429);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe("Eigenes Konto (PATCH /api/user/konto)", () => {
  it("401 ohne Sitzung", async () => {
    await mockAuth(null);
    const { PATCH } = await import("@/app/api/user/konto/route");
    const res = await PATCH(createJsonRequest("/api/user/konto", { name: "Neu" }, "PATCH") as any);
    expect(res.status).toBe(401);
  });

  it("aendert nur den eigenen Namen, weitere Felder werden ignoriert", async () => {
    await mockAuth(EXPERT_TEAM_A);
    mockPrisma.user.update.mockResolvedValue({});
    const { PATCH } = await import("@/app/api/user/konto/route");
    const res = await PATCH(
      createJsonRequest("/api/user/konto", { name: "  Neuer Name ", role: "ADMIN", email: "x@y.de" }, "PATCH") as any
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "expert-a" },
      data: { name: "Neuer Name" },
    });
  });

  it("lehnt Namen mit Zeilenumbruch ab", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const { PATCH } = await import("@/app/api/user/konto/route");
    const res = await PATCH(createJsonRequest("/api/user/konto", { name: "Max\nMuster" }, "PATCH") as any);
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
