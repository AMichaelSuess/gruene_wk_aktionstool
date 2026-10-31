/**
 * Health-Endpunkt /api/health
 *
 * Wird von Coolify ohne Authentifizierung abgefragt und darf daher
 * keine Interna (Fehlermeldungen, Verbindungsdaten) preisgeben.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

const queryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Health-Endpunkt", () => {
  it("Datenbank erreichbar → 200", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const { GET } = await import("@/app/api/health/route");

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("Datenbank nicht erreichbar → 503 ohne Fehlerdetails", async () => {
    queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=geheim"));
    const { GET } = await import("@/app/api/health/route");

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error" });
  });
});
