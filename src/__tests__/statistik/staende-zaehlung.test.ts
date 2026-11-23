/**
 * Statistik: Eine Aktion zaehlt genau einmal als Stand.
 *
 * Nach der Bereinigung hat eine Aktion, die es noch gibt, zusaetzlich eine
 * AktionStatistik. Als Stand zaehlt sie dann nur ueber die Live-Daten; die
 * Statistik zaehlt nur noch, wenn die Aktion geloescht ist (aktionId null).
 * Die Anmeldungen beider Quellen werden addiert, weil die Bereinigung die
 * archivierten Anmeldungen aus der Live-Tabelle loescht.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockAuth, ADMIN_SESSION } from "../security/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockPrisma = {
  aktion: { count: vi.fn(), findMany: vi.fn() },
  anmeldung: { count: vi.fn() },
  team: { count: vi.fn(), findMany: vi.fn() },
  user: { count: vi.fn() },
  wahlkreis: { findMany: vi.fn() },
  aktionStatistik: { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  aktionStatistikTeam: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const DATUM = new Date("2026-11-10T00:00:00Z"); // KW 46

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.aktion.count.mockResolvedValue(0);
  mockPrisma.anmeldung.count.mockResolvedValue(0);
  mockPrisma.team.count.mockResolvedValue(0);
  mockPrisma.user.count.mockResolvedValue(0);
  mockPrisma.wahlkreis.findMany.mockResolvedValue([]);
  mockPrisma.aktionStatistik.aggregate.mockResolvedValue({ _sum: { anmeldungenCount: 5 } });
  mockPrisma.aktionStatistik.groupBy.mockResolvedValue([]);

  // Team A: eine bestehende Aktion (bereinigt, 1 spaete Anmeldung) ...
  mockPrisma.team.findMany.mockResolvedValue([
    {
      id: "team-a",
      name: "Team A",
      _count: { aktionen: 1 },
      aktionen: [{ aktion: { _count: { anmeldungen: 1 } } }],
    },
  ]);
  mockPrisma.aktion.findMany.mockResolvedValue([{ datum: DATUM, anmeldungen: [{ id: "x" }] }]);
  // ... mit Statistik (3 archivierte Anmeldungen), plus eine geloeschte Aktion (2)
  mockPrisma.aktionStatistikTeam.findMany.mockResolvedValue([
    { teamId: "team-a", statistik: { anmeldungenCount: 3, aktionId: "aktion-1" } },
    { teamId: "team-a", statistik: { anmeldungenCount: 2, aktionId: null } },
  ]);
  mockPrisma.aktionStatistik.findMany.mockResolvedValue([
    { aktionDatum: DATUM, anmeldungenCount: 3, aktionId: "aktion-1" },
    { aktionDatum: DATUM, anmeldungenCount: 2, aktionId: null },
  ]);
});

describe("Staende in der Statistik (GET /api/statistics)", () => {
  it("zaehlt eine bestehende Aktion mit Statistik nur einmal", async () => {
    await mockAuth(ADMIN_SESSION);
    const { GET } = await import("@/app/api/statistics/route");
    const data = await (await GET()).json();

    expect(data.staendeByTeam).toEqual([{ team: "Team A", count: 2 }]);
    expect(data.anmeldungenByTeam).toEqual([{ team: "Team A", count: 6 }]);
    expect(data.byKalenderwoche).toEqual([{ kw: 46, year: 2026, staende: 2, anmeldungen: 6 }]);
  });
});
