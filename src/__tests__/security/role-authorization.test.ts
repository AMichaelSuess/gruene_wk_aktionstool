/**
 * Sicherheitstests: Rollenberechtigung
 *
 * Prüft, dass EXPERT-Benutzer keinen Zugriff auf Admin-Endpunkte haben.
 * Nur ADMIN-Benutzer dürfen Benutzer, Teams und Statistiken verwalten.
 * Lesend (auf eigene Teams beschraenkt) siehe expert-sichtbarkeit.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockAuth, createRequest, createJsonRequest, EXPERT_TEAM_A, ADMIN_SESSION } from "./helpers";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    aktion: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    anmeldung: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    team: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
    wahlkreis: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/geocoding", () => ({ geocodeAddress: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({
  anmeldebestaetigungEmail: vi.fn(() => ({ subject: "", html: "" })),
  aenderungsEmail: vi.fn(() => ({ subject: "", html: "" })),
  absageEmail: vi.fn(() => ({ subject: "", html: "" })),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  await mockAuth(EXPERT_TEAM_A); // Angemeldet als EXPERT
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });

// GET /api/users und GET /api/statistics sind fuer EXPERT erlaubt, aber auf
// die eigenen Teams eingeschraenkt: siehe expert-sichtbarkeit.test.ts
describe("EXPERT darf nicht auf Admin-Benutzerverwaltung zugreifen", () => {
  it("POST /api/users → 401 für EXPERT", async () => {
    const { POST } = await import("@/app/api/users/route");
    const req = createJsonRequest("/api/users", {
      name: "Hacker",
      email: "hacker@test.de",
      password: "password123",
      role: "ADMIN",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("PUT /api/users/[id] → 401 für EXPERT", async () => {
    const { PUT } = await import("@/app/api/users/[id]/route");
    const req = createJsonRequest("/api/users/admin-1", { role: "ADMIN" }, "PUT");
    const res = await PUT(req as any, params("admin-1"));
    expect(res.status).toBe(401);
  });

  it("DELETE /api/users/[id] → 401 für EXPERT", async () => {
    const { DELETE } = await import("@/app/api/users/[id]/route");
    const req = createRequest("/api/users/admin-1", { method: "DELETE" });
    const res = await DELETE(req as any, params("admin-1"));
    expect(res.status).toBe(401);
  });
});

describe("EXPERT darf Teams nur lesen", () => {
  it("GET /api/teams → EXPERT bekommt nur ID und Name, keine Zahlen", async () => {
    const { GET } = await import("@/app/api/teams/route");
    const { prisma } = await import("@/lib/db");
    (prisma.team.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, name: true } })
    );
  });

  it("POST /api/teams → 401 für EXPERT", async () => {
    const { POST } = await import("@/app/api/teams/route");
    const req = createJsonRequest("/api/teams", { name: "Neues Team" });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("PUT /api/teams/[id] → 401 für EXPERT", async () => {
    const { PUT } = await import("@/app/api/teams/[id]/route");
    const req = createJsonRequest("/api/teams/team-1", { name: "Umbenannt" }, "PUT");
    const res = await PUT(req as any, params("team-1"));
    expect(res.status).toBe(401);
  });

  it("DELETE /api/teams/[id] → 401 für EXPERT", async () => {
    const { DELETE } = await import("@/app/api/teams/[id]/route");
    const req = createRequest("/api/teams/team-1", { method: "DELETE" });
    const res = await DELETE(req as any, params("team-1"));
    expect(res.status).toBe(401);
  });
});

describe("EXPERT darf nicht auf weitere Admin-Endpunkte zugreifen", () => {
  it("GET /api/districts → EXPERT bekommt keine Zahlen", async () => {
    const { GET } = await import("@/app/api/districts/route");
    const { prisma } = await import("@/lib/db");
    (prisma.wahlkreis.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(prisma.wahlkreis.findMany).toHaveBeenCalledWith({ orderBy: { nummer: "asc" } });
  });

  it("PUT /api/districts/[id] → 401 für EXPERT", async () => {
    const { PUT } = await import("@/app/api/districts/[id]/route");
    const req = createJsonRequest("/api/districts/wk-1", { name: "Neu", nummer: 1 }, "PUT");
    const res = await PUT(req as any, params("wk-1"));
    expect(res.status).toBe(401);
  });

  it("GET /api/statistics/export → 401 für EXPERT", async () => {
    const { GET } = await import("@/app/api/statistics/export/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("DELETE /api/admin/aktionen/[id] → 403 für EXPERT, nichts gelöscht", async () => {
    const { DELETE } = await import("@/app/api/admin/aktionen/[id]/route");
    const { prisma } = await import("@/lib/db");
    const req = createRequest("/api/admin/aktionen/aktion-1", { method: "DELETE" });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "aktion-1" }) });
    expect(res.status).toBe(403);
    expect(prisma.aktion.delete).not.toHaveBeenCalled();
  });
});

describe("Ohne Login kein Zugriff auf Admin-Endpunkte", () => {
  it("GET /api/statistics/export → 401", async () => {
    await mockAuth(null);
    const stats = await import("@/app/api/statistics/export/route");
    expect((await stats.GET()).status).toBe(401);
  });

  it("GET /api/districts ist öffentlich, aber ohne Zahlen", async () => {
    await mockAuth(null);
    const { GET } = await import("@/app/api/districts/route");
    const { prisma } = await import("@/lib/db");
    (prisma.wahlkreis.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    expect((await GET()).status).toBe(200);
    expect(prisma.wahlkreis.findMany).toHaveBeenCalledWith({ orderBy: { nummer: "asc" } });
  });
});

describe("ADMIN bekommt für die Verwaltung die Zahlen", () => {
  it("GET /api/teams und /api/districts → mit Anzahl Mitglieder/Teams und Aktionen", async () => {
    await mockAuth(ADMIN_SESSION);
    const teams = await import("@/app/api/teams/route");
    const districts = await import("@/app/api/districts/route");
    const { prisma } = await import("@/lib/db");
    (prisma.team.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.wahlkreis.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    expect((await teams.GET()).status).toBe(200);
    expect((await districts.GET()).status).toBe(200);
    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ _count: expect.anything() }) })
    );
    expect(prisma.wahlkreis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ _count: expect.anything() }) })
    );
  });
});
