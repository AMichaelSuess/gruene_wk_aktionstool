/**
 * Sicherheitstests: 72-h-Löschung der Anmeldedaten (DSGVO)
 *
 * - Anmeldungen werden 72 h nach Aktionsende gelöscht, eine Statistik bleibt.
 * - Auch Anmeldungen, die nach der ersten Bereinigung noch dazukamen, werden
 *   gelöscht; die vorhandene Statistik wird dann hochgezählt statt doppelt angelegt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = {
  anmeldung: { count: vi.fn(), deleteMany: vi.fn() },
  aktionStatistik: { create: vi.fn(), update: vi.fn() },
  emailLog: { deleteMany: vi.fn() },
};

const mockPrisma = {
  aktion: { findMany: vi.fn() },
  emailLog: { deleteMany: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const CRON_SECRET = "test-cron-secret-0123456789abcdef";

const VOR_EINER_WOCHE = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

function aktion(overrides: Record<string, unknown> = {}) {
  return {
    id: "aktion-1",
    datum: VOR_EINER_WOCHE,
    endzeit: "12:00",
    wahlkreisId: "wk-1",
    statistik: null,
    teams: [{ teamId: "team-a" }],
    _count: { anmeldungen: 1 },
    ...overrides,
  };
}

async function runCleanup() {
  const { POST } = await import("@/app/api/cron/cleanup-anmeldungen/route");
  return POST(
    new Request("http://localhost:3000/api/cron/cleanup-anmeldungen", {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }) as any
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  mockPrisma.emailLog.deleteMany.mockResolvedValue({ count: 0 });
  tx.anmeldung.count.mockResolvedValue(1);
});

describe("cleanup-anmeldungen", () => {
  it("bezieht auch bereits bereinigte Aktionen ein (kein Filter statistik: null)", async () => {
    mockPrisma.aktion.findMany.mockResolvedValue([]);
    await runCleanup();
    const { where } = mockPrisma.aktion.findMany.mock.calls[0][0];
    expect(where).not.toHaveProperty("statistik");
  });

  it("erste Bereinigung: Statistik anlegen, Anmeldungen und Versandprotokolle der Aktion löschen", async () => {
    mockPrisma.aktion.findMany.mockResolvedValue([aktion()]);
    tx.anmeldung.count.mockResolvedValue(3);

    const res = await runCleanup();
    expect(res.status).toBe(200);

    expect(tx.aktionStatistik.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ aktionId: "aktion-1", anmeldungenCount: 3 }) })
    );
    expect(tx.aktionStatistik.update).not.toHaveBeenCalled();
    expect(tx.anmeldung.deleteMany).toHaveBeenCalledWith({ where: { aktionId: "aktion-1" } });
    expect(tx.emailLog.deleteMany).toHaveBeenCalledWith({ where: { aktionId: "aktion-1" } });
  });

  it("nachträgliche Anmeldung: vorhandene Statistik hochzählen und Anmeldung löschen", async () => {
    mockPrisma.aktion.findMany.mockResolvedValue([aktion({ statistik: { id: "stat-1" } })]);

    await runCleanup();

    expect(tx.aktionStatistik.update).toHaveBeenCalledWith({
      where: { id: "stat-1" },
      data: { anmeldungenCount: { increment: 1 } },
    });
    expect(tx.aktionStatistik.create).not.toHaveBeenCalled();
    expect(tx.anmeldung.deleteMany).toHaveBeenCalledWith({ where: { aktionId: "aktion-1" } });
  });

  it("Aktion, die erst vor kurzem endete, wird noch nicht bereinigt", async () => {
    mockPrisma.aktion.findMany.mockResolvedValue([aktion({ datum: new Date(), endzeit: "23:59" })]);
    await runCleanup();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
