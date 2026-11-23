/**
 * Sicherheitstests: Benutzer*innen loeschen (DELETE /api/users)
 * und Admins ohne Team-Mitgliedschaften (POST/PUT /api/users)
 *
 * Ohne angelegte Aktionen wird das Konto geloescht, sonst anonymisiert und
 * deaktiviert (DSGVO: personenbezogene Daten weg, Aktionen bleiben). Admins
 * koennen sich nicht selbst loeschen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { mockAuth, createRequest, createJsonRequest, ADMIN_SESSION, EXPERT_TEAM_A } from "./helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockPrisma = {
  user: { findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn(), update: vi.fn(), create: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.delete.mockResolvedValue({});
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.user.findMany.mockResolvedValue([]);
});

async function del(id: string) {
  const { DELETE } = await import("@/app/api/users/[id]/route");
  return DELETE(createRequest(`/api/users/${id}`, { method: "DELETE" }) as any, { params: Promise.resolve({ id }) });
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
    const { GET } = await import("@/app/api/users/route");
    await GET();
    expect(mockPrisma.user.findMany.mock.calls[0][0].where).toEqual({
      NOT: { email: { endsWith: "@geloescht.invalid" } },
    });
  });
});

describe("Admins haben keine Team-Mitgliedschaften", () => {
  beforeEach(async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.user.update.mockResolvedValue({ id: "user-x", password: "h", teams: [] });
    mockPrisma.user.create.mockResolvedValue({ id: "user-x", password: "h", role: "ADMIN", teams: [] });
  });

  it("neuer Admin wird ohne Teams angelegt, auch wenn Teams mitgeschickt werden", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/users/route");
    const res = await POST(
      createJsonRequest("/api/users", {
        name: "Neue Admin",
        email: "neu@test.de",
        password: "langes-passwort-123",
        role: "ADMIN",
        teamIds: ["team-a"],
      }) as any
    );
    expect(res.status).toBe(201);
    expect(mockPrisma.user.create.mock.calls[0][0].data.teams).toEqual({ create: [] });
  });

  it("wer zum Admin wird, verliert alle Team-Mitgliedschaften", async () => {
    const { PUT } = await import("@/app/api/users/[id]/route");
    const res = await PUT(
      createJsonRequest("/api/users/user-x", { role: "ADMIN", teamIds: ["team-a"] }, "PUT") as any, { params: Promise.resolve({ id: "user-x" }) }
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update.mock.calls[0][0].data.teams).toEqual({ deleteMany: {}, create: [] });
  });

  it("Team-Angaben fuer bestehende Admins werden ignoriert", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
    const { PUT } = await import("@/app/api/users/[id]/route");
    await PUT(createJsonRequest("/api/users/user-x", { teamIds: ["team-a"] }, "PUT") as any, { params: Promise.resolve({ id: "user-x" }) });
    expect(mockPrisma.user.update.mock.calls[0][0].data.teams).toEqual({ deleteMany: {}, create: [] });
  });

  it("Expert*innen behalten ihre Teams", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "EXPERT" });
    const { PUT } = await import("@/app/api/users/[id]/route");
    await PUT(createJsonRequest("/api/users/user-x", { teamIds: ["team-a"] }, "PUT") as any, { params: Promise.resolve({ id: "user-x" }) });
    expect(mockPrisma.user.update.mock.calls[0][0].data.teams).toEqual({
      deleteMany: {},
      create: [{ teamId: "team-a" }],
    });
  });
});

async function put({ id, ...body }: { id: string } & Record<string, unknown>) {
  const { PUT } = await import("@/app/api/users/[id]/route");
  return PUT(createJsonRequest(`/api/users/${id}`, body, "PUT") as any, { params: Promise.resolve({ id }) });
}

describe("Admin-Konten: kein Selbstaussperren", () => {
  it("Admin kann sich nicht selbst die Admin-Rolle entziehen", async () => {
    await mockAuth(ADMIN_SESSION);
    const res = await put({ id: ADMIN_SESSION.user.id, role: "EXPERT" });
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("Admin kann sich nicht selbst deaktivieren", async () => {
    await mockAuth(ADMIN_SESSION);
    const res = await put({ id: ADMIN_SESSION.user.id, active: false });
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("eigenen Namen aendern bleibt moeglich", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.user.update.mockResolvedValueOnce({ id: ADMIN_SESSION.user.id, password: "x", teams: [] });
    const res = await put({ id: ADMIN_SESSION.user.id, name: "Neuer Name", role: "ADMIN", active: true });
    expect(res.status).toBe(200);
  });
});

describe("Passwort-Reset durch Admin", () => {
  it("beendet alle Sitzungen der Person", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.user.update.mockResolvedValueOnce({ id: "user-x", password: "x", teams: [] });
    const res = await put({ id: "user-x", password: "ganz-neues-passwort" });
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 });
  });
});

