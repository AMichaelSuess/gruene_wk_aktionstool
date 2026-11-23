/**
 * Sicherheitstests: Was Expert*innen in Statistik und Benutzerliste sehen
 *
 * Statistik und Benutzerliste sind fuer EXPERT lesbar, aber auf die eigenen
 * Teams (und selbst angelegte Aktionen) eingeschraenkt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockAuth, EXPERT_TEAM_A, ADMIN_SESSION } from "./helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockPrisma = {
  aktion: { count: vi.fn(), findMany: vi.fn() },
  anmeldung: { count: vi.fn() },
  team: { count: vi.fn(), findMany: vi.fn() },
  user: { count: vi.fn(), findMany: vi.fn() },
  wahlkreis: { findMany: vi.fn() },
  aktionStatistik: { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  aktionStatistikTeam: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const EXPERT_WHERE = {
  OR: [{ teams: { some: { teamId: { in: ["team-a"] } } } }, { createdById: "expert-a" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.aktion.count.mockResolvedValue(0);
  mockPrisma.aktion.findMany.mockResolvedValue([]);
  mockPrisma.anmeldung.count.mockResolvedValue(0);
  mockPrisma.team.count.mockResolvedValue(0);
  mockPrisma.team.findMany.mockResolvedValue([]);
  mockPrisma.user.count.mockResolvedValue(0);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.wahlkreis.findMany.mockResolvedValue([]);
  mockPrisma.aktionStatistik.aggregate.mockResolvedValue({ _sum: { anmeldungenCount: 0 } });
  mockPrisma.aktionStatistik.groupBy.mockResolvedValue([]);
  mockPrisma.aktionStatistik.findMany.mockResolvedValue([]);
  mockPrisma.aktionStatistikTeam.findMany.mockResolvedValue([]);
});

describe("Statistik (GET /api/statistics)", () => {
  it("401 ohne Sitzung", async () => {
    await mockAuth(null);
    const { GET } = await import("@/app/api/statistics/route");
    expect((await GET()).status).toBe(401);
  });

  it("EXPERT: alle Abfragen sind auf eigene Teams und eigene Aktionen eingeschraenkt", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const { GET } = await import("@/app/api/statistics/route");
    expect((await GET()).status).toBe(200);

    for (const [args] of mockPrisma.aktion.count.mock.calls) {
      expect(args.where.OR).toEqual(EXPERT_WHERE.OR);
    }
    for (const [args] of mockPrisma.aktion.findMany.mock.calls) {
      expect(args.where).toEqual(EXPERT_WHERE);
    }
    expect(mockPrisma.anmeldung.count.mock.calls[0][0].where).toEqual({ aktion: EXPERT_WHERE });
    expect(mockPrisma.team.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["team-a"] } });
    expect(mockPrisma.wahlkreis.findMany.mock.calls[0][0].include.aktionen.where).toEqual(EXPERT_WHERE);

    const statistikWhere = { teams: { some: { teamId: { in: ["team-a"] } } } };
    expect(mockPrisma.aktionStatistik.aggregate.mock.calls[0][0].where).toEqual(statistikWhere);
    expect(mockPrisma.aktionStatistik.groupBy.mock.calls[0][0].where).toEqual(statistikWhere);
    expect(mockPrisma.aktionStatistik.findMany.mock.calls[0][0].where).toEqual(statistikWhere);
    expect(mockPrisma.aktionStatistikTeam.findMany.mock.calls[0][0].where).toEqual({
      teamId: { in: ["team-a"] },
    });
  });

  it("ADMIN: keine Einschraenkung", async () => {
    await mockAuth(ADMIN_SESSION);
    const { GET } = await import("@/app/api/statistics/route");
    expect((await GET()).status).toBe(200);
    expect(mockPrisma.team.findMany.mock.calls[0][0].where).toEqual({});
    expect(mockPrisma.aktion.findMany.mock.calls[0][0].where).toEqual({});
  });
});

describe("Benutzerliste (GET /api/admin/users)", () => {
  it("401 ohne Sitzung", async () => {
    await mockAuth(null);
    const { GET } = await import("@/app/api/admin/users/route");
    expect((await GET()).status).toBe(401);
  });

  it("EXPERT sieht nur aktive Mitglieder eigener Teams und Admins, ohne Passwort-Hash", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const { GET } = await import("@/app/api/admin/users/route");
    expect((await GET()).status).toBe(200);

    const args = mockPrisma.user.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      active: true,
      NOT: { email: { endsWith: "@geloescht.invalid" } },
      OR: [{ role: "ADMIN" }, { teams: { some: { teamId: { in: ["team-a"] } } } }],
    });
    expect(args.select.password).toBeUndefined();
    // Bei jeder Person nur die gemeinsamen Teams
    expect(args.select.teams.where).toEqual({ teamId: { in: ["team-a"] } });
  });
});
