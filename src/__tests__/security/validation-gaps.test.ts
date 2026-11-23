/**
 * Sicherheitstests: kleinere Validierungslücken
 *
 * - Namen ohne Zeilenumbrüche, Signal-Export bleibt eine Zeile pro Anmeldung
 * - PUT /api/teams prüft den Body mit Zod
 * - ungültige Filterwerte in GET /api/actions führen nicht zu 500
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockAuth, ADMIN_SESSION, createJsonRequest } from "./helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
const mockPrisma = {
  aktion: { findMany: vi.fn() },
  team: { update: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("Namen und Signal-Textexport", () => {
  it("Vorname mit Zeilenumbruch wird abgelehnt", async () => {
    const { anmeldungSchema } = await import("@/lib/validators");
    const result = anmeldungSchema.safeParse({
      aktionIds: ["a"],
      vorname: "Max\nFREIE PLÄTZE: 0",
      nachname: "Muster",
      email: "max@test.de",
      telefon: "030123456",
      datenschutz: true,
    });
    expect(result.success).toBe(false);
  });

  it("Umlaute, Bindestriche und Akzente bleiben erlaubt", async () => {
    const { anmeldungSchema } = await import("@/lib/validators");
    const result = anmeldungSchema.safeParse({
      aktionIds: ["a"],
      vorname: "Zoë-Marié",
      nachname: "Müller-Lüdenscheidt",
      email: "zoe@test.de",
      telefon: "030123456",
      datenschutz: true,
    });
    expect(result.success).toBe(true);
  });

  it("TXT-Export: Altdaten mit Zeilenumbruch ergeben trotzdem eine Zeile pro Anmeldung", async () => {
    const { createAnmeldungenTxt } = await vi.importActual<typeof import("@/lib/excel")>("@/lib/excel");
    const txt = createAnmeldungenTxt([
      { vorname: "Max\r\nNeue Zeile", nachname: "Muster", telefon: "030\n123", signalName: null } as never,
      { vorname: "Lisa", nachname: "Test", telefon: null, signalName: "lisa.01" } as never,
    ]);
    expect(txt.split("\n")).toEqual(["Max Neue Zeile Muster – Tel: 030 123", "Lisa Test – Signal: lisa.01"]);
  });
});

describe("PUT /api/teams", () => {
  it("ungültiger Body (Name als Objekt) → 400, keine Änderung", async () => {
    await mockAuth(ADMIN_SESSION);
    const { PUT } = await import("@/app/api/teams/[id]/route");
    const res = await PUT(createJsonRequest("/api/teams/t1", { name: { set: "x" } }, "PUT") as any, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(400);
    expect(mockPrisma.team.update).not.toHaveBeenCalled();
  });

  it("gültiger Body → Update mit geprüften Werten", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.team.update.mockResolvedValue({ id: "t1", name: "Team Nord" });
    const { PUT } = await import("@/app/api/teams/[id]/route");
    const res = await PUT(createJsonRequest("/api/teams/t1", { name: "Team Nord", extra: "x" }, "PUT") as any, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    expect(mockPrisma.team.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1" }, data: { name: "Team Nord", wahlkreisId: null } })
    );
  });
});

describe("GET /api/actions: ungültige Filterwerte", () => {
  it("wahlkreis=abc und datum=kaputt → 200, Filter werden ignoriert", async () => {
    await mockAuth(null);
    mockPrisma.aktion.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/actions/route");
    const res = await GET(new Request("http://localhost:3000/api/actions?district=abc&from=kaputt&to=x") as any);
    expect(res.status).toBe(200);
    const { where } = mockPrisma.aktion.findMany.mock.calls[0][0];
    expect(where).not.toHaveProperty("wahlkreis");
    expect(Number.isNaN(where.datum.gte.getTime())).toBe(false);
    expect(where.datum).not.toHaveProperty("lte");
  });

  it("gültige Filter werden weiter angewendet", async () => {
    await mockAuth(null);
    mockPrisma.aktion.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/actions/route");
    await GET(new Request("http://localhost:3000/api/actions?district=1,x,3&from=2099-01-01&to=2099-01-31") as any);
    const { where } = mockPrisma.aktion.findMany.mock.calls[0][0];
    expect(where.wahlkreis).toEqual({ nummer: { in: [1, 3] } });
    expect(where.datum.lte).toEqual(new Date("2099-01-31"));
  });
});

describe("Obergrenzen für ID-Listen", () => {
  it("Sammel-Kategorie: höchstens 1000 Aktionen, IDs höchstens 40 Zeichen", async () => {
    const { bulkKategorieSchema } = await import("@/lib/validators");
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `aktion-${i}`);
    expect(bulkKategorieSchema.safeParse({ ids: ids(1000), kategorie: "FLYERN" }).success).toBe(true);
    expect(bulkKategorieSchema.safeParse({ ids: ids(1001), kategorie: "FLYERN" }).success).toBe(false);
    expect(bulkKategorieSchema.safeParse({ ids: ["x".repeat(41)], kategorie: "FLYERN" }).success).toBe(false);
  });

  it("Team-Listen bei Usern und Aktionen: höchstens 50 Einträge", async () => {
    const { userSchema, userUpdateSchema } = await import("@/lib/validators");
    const teamIds = (n: number) => Array.from({ length: n }, (_, i) => `team-${i}`);
    const user = { name: "Test", email: "t@example.org", password: "langes-passwort-123", role: "EXPERT" };
    expect(userSchema.safeParse({ ...user, teamIds: teamIds(50) }).success).toBe(true);
    expect(userSchema.safeParse({ ...user, teamIds: teamIds(51) }).success).toBe(false);
    expect(userUpdateSchema.safeParse({ id: "u1", teamIds: teamIds(51) }).success).toBe(false);
  });
});
