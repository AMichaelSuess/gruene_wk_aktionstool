/**
 * Sicherheitstests: Benutzer*innen loeschen (DELETE /api/admin/users)
 *
 * Ohne angelegte Aktionen wird das Konto geloescht, sonst anonymisiert und
 * deaktiviert (DSGVO: personenbezogene Daten weg, Aktionen bleiben). Admins
 * koennen sich nicht selbst loeschen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { mockAuth, createRequest, ADMIN_SESSION, EXPERT_TEAM_A } from "./helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockPrisma = {
  user: { findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.delete.mockResolvedValue({});
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.user.findMany.mockResolvedValue([]);
});

async function del(id: string) {
  const { DELETE } = await import("@/app/api/admin/users/route");
  return DELETE(createRequest(`/api/admin/users?id=${id}`, { method: "DELETE" }) as any);
}

describe("Benutzer*in löschen", () => {
  it("EXPERT darf nicht löschen", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const res = await del("user-x");
    expect(res.status).toBe(401);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("Admin kann sich nicht selbst löschen", async () => {
    await mockAuth(ADMIN_SESSION);
    const res = await del(ADMIN_SESSION.user.id);
    expect(res.status).toBe(400);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("404 für unbekannte Person", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    expect((await del("gibt-es-nicht")).status).toBe(404);
  });

  it("ohne angelegte Aktionen wird das Konto gelöscht", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-x", _count: { aktionen: 0 } });
    const res = await del("user-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ anonymisiert: false });
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-x" } });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("mit angelegten Aktionen wird das Konto anonymisiert und deaktiviert", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-x", _count: { aktionen: 3 } });
    const res = await del("user-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ anonymisiert: true });
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();

    const { where, data } = mockPrisma.user.update.mock.calls[0][0];
    expect(where).toEqual({ id: "user-x" });
    expect(data.name).toBe("Gelöschte*r Benutzer*in");
    expect(data.email).toBe("user-x@geloescht.invalid");
    expect(data.active).toBe(false);
    expect(data.role).toBe("EXPERT");
    expect(data.teams).toEqual({ deleteMany: {} });
    // Neues Passwort ist ein bcrypt-Hash, kein bekannter Wert
    expect(data.password).toMatch(/^\$2[aby]\$12\$/);
    expect(await bcrypt.compare("", data.password)).toBe(false);
  });

  it("anonymisierte Konten erscheinen nicht in der Admin-Liste", async () => {
    await mockAuth(ADMIN_SESSION);
    const { GET } = await import("@/app/api/admin/users/route");
    await GET();
    expect(mockPrisma.user.findMany.mock.calls[0][0].where).toEqual({
      NOT: { email: { endsWith: "@geloescht.invalid" } },
    });
  });
});
