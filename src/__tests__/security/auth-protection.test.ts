/**
 * Sicherheitstests: Authentifizierungsschutz
 *
 * Prüft, dass alle geschützten API-Endpunkte unauthentifizierte
 * Anfragen mit Status 401 ablehnen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockAuth, createRequest, createJsonRequest } from "./helpers";

// Mocks für auth und Prisma
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    aktion: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    anmeldung: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    wahlkreis: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/geocoding", () => ({
  geocodeAddress: vi.fn(),
}));

vi.mock("@/lib/email-templates", () => ({
  anmeldebestaetigungEmail: vi.fn(() => ({ subject: "", html: "" })),
  aenderungsEmail: vi.fn(() => ({ subject: "", html: "" })),
  absageEmail: vi.fn(() => ({ subject: "", html: "" })),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  await mockAuth(null); // Kein authentifizierter Benutzer
});

describe("Authentifizierungsschutz: Anmeldungen (persönliche Daten)", () => {
  it("GET /api/actions/[id]/signups → 401 ohne Auth", async () => {
    const { GET } = await import("@/app/api/actions/[id]/signups/route");
    const req = createRequest("/api/actions/test-id/signups");
    const res = await GET(req as any, { params: Promise.resolve({ id: "test-id" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("GET /api/signups/export → 401 ohne Auth", async () => {
    const { GET } = await import("@/app/api/signups/export/route");
    const req = createRequest("/api/signups/export?format=xlsx");
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });
});

describe("Authentifizierungsschutz: Aktionen-Verwaltung", () => {
  it("POST /api/actions → 401 ohne Auth", async () => {
    const { POST } = await import("@/app/api/actions/route");
    const req = createJsonRequest("/api/actions", { titel: "Test" });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("PUT /api/actions/[id] → 401 ohne Auth", async () => {
    const { PUT } = await import("@/app/api/actions/[id]/route");
    const req = createJsonRequest("/api/actions/test-id", { titel: "Test" }, "PUT");
    const res = await PUT(req as any, { params: Promise.resolve({ id: "test-id" }) });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/actions/[id] → 401 ohne Auth", async () => {
    const { DELETE } = await import("@/app/api/actions/[id]/route");
    const req = createRequest("/api/actions/test-id", { method: "DELETE" });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "test-id" }) });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/actions → 401 ohne Auth", async () => {
    const { PATCH } = await import("@/app/api/actions/route");
    const req = createJsonRequest(
      "/api/actions",
      { ids: ["test-id"], kategorie: "HAUSTUER" },
      "PATCH"
    );
    const res = await PATCH(req as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Nicht autorisiert");
  });
});

describe("Authentifizierungsschutz: Admin-Endpunkte", () => {
  it("GET /api/users → 401 ohne Auth", async () => {
    const { GET } = await import("@/app/api/users/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST /api/users → 401 ohne Auth", async () => {
    const { POST } = await import("@/app/api/users/route");
    const req = createJsonRequest("/api/users", { name: "Test" });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("PUT /api/users → 401 ohne Auth", async () => {
    const { PUT } = await import("@/app/api/users/[id]/route");
    const req = createJsonRequest("/api/users/1", { name: "Test" }, "PUT");
    const res = await PUT(req as any, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/users → 401 ohne Auth", async () => {
    const { DELETE } = await import("@/app/api/users/[id]/route");
    const req = createRequest("/api/users/1", { method: "DELETE" });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("GET /api/teams → 401 ohne Auth", async () => {
    const { GET } = await import("@/app/api/teams/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST /api/teams → 401 ohne Auth", async () => {
    const { POST } = await import("@/app/api/teams/route");
    const req = createJsonRequest("/api/teams", { name: "Test" });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("DELETE /api/teams → 401 ohne Auth", async () => {
    const { DELETE } = await import("@/app/api/teams/[id]/route");
    const req = createRequest("/api/teams/1", { method: "DELETE" });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("GET /api/statistics → 401 ohne Auth", async () => {
    const { GET } = await import("@/app/api/statistics/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
