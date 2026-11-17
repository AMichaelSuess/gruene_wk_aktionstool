/**
 * Sicherheitstests: Eingabevalidierung
 *
 * Prüft, dass ungültige, bösartige oder manipulierte Eingaben
 * korrekt abgelehnt werden (Schutz gegen Injection-Angriffe).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockAuth, createJsonRequest, ADMIN_SESSION } from "./helpers";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    aktion: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn() },
    anmeldung: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    team: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
    wahlkreis: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({
  anmeldebestaetigungEmail: vi.fn(() => ({ subject: "", html: "" })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

function createAnmeldungBody(overrides: Record<string, unknown> = {}) {
  return {
    aktionIds: ["aktion-1"],
    vorname: "Max",
    nachname: "Muster",
    email: "max@test.de",
    telefon: "01711234567",
    datenschutz: true,
    ...overrides,
  };
}

describe("Eingabevalidierung: Öffentliche Anmeldung", () => {
  it("Ungültige E-Mail-Adresse → 400", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");

    const req = new Request("http://localhost:3000/api/anmeldungen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.1" },
      body: JSON.stringify(createAnmeldungBody({ email: "keine-email" })),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("Fehlende Pflichtfelder → 400", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");

    const req = new Request("http://localhost:3000/api/anmeldungen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.2" },
      body: JSON.stringify({ aktionIds: ["aktion-1"] }), // Nur aktionIds, Rest fehlt
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("Leere aktionIds → 400", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");

    const req = new Request("http://localhost:3000/api/anmeldungen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.3" },
      body: JSON.stringify(createAnmeldungBody({ aktionIds: [] })),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("SQL-Injection-Versuch im Namen → wird durch Zod/Prisma abgefangen", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");
    const { prisma } = await import("@/lib/db");

    // Aktion existiert
    (prisma.aktion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "aktion-1",
      status: "AKTIV",
      maxTeilnehmer: null,
      _count: { anmeldungen: 0 },
    });
    (prisma.anmeldung.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "anm-1" });

    const req = new Request("http://localhost:3000/api/anmeldungen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.4" },
      body: JSON.stringify(createAnmeldungBody({
        vorname: "Robert'; DROP TABLE anmeldungen;--",
        nachname: "Muster",
      })),
    });

    const res = await POST(req as any);

    // Prisma parametrisiert alle Queries – SQL-Injection ist nicht möglich.
    // Der Request kann durchgehen (Zod akzeptiert den String), aber Prisma
    // behandelt ihn als sicheren String-Parameter.
    if (res.status === 200) {
      const createCall = (prisma.anmeldung.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Der Wert wird als String-Parameter übergeben, NICHT als SQL ausgeführt
      expect(createCall.data.vorname).toBe("Robert'; DROP TABLE anmeldungen;--");
    }
    // Alternativ: Zod könnte den Wert ablehnen – beides ist akzeptabel
    expect([200, 400]).toContain(res.status);
  });

  it("Datenschutz nicht akzeptiert → 400", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");

    const req = new Request("http://localhost:3000/api/anmeldungen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.5" },
      body: JSON.stringify(createAnmeldungBody({ datenschutz: false })),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("Weder Telefon noch Signal angegeben → 400", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");

    const req = new Request("http://localhost:3000/api/anmeldungen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.6" },
      body: JSON.stringify({
        aktionIds: ["aktion-1"],
        vorname: "Max",
        nachname: "Muster",
        email: "max@test.de",
        telefon: "",
        signalName: "",
        datenschutz: true,
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});

describe("Input-Validierung: PUT /api/admin/users (userUpdateSchema)", () => {
  it("PUT ohne ID wird abgelehnt (400)", async () => {
    await mockAuth(ADMIN_SESSION);
    const { PUT } = await import("@/app/api/admin/users/route");
    const { prisma } = await import("@/lib/db");

    const req = createJsonRequest("/api/admin/users", { name: "Test" }, "PUT");
    const res = await PUT(req as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validierungsfehler");
    expect(prisma.user.update as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("PUT mit ungueltigem E-Mail-Format wird abgelehnt (400)", async () => {
    await mockAuth(ADMIN_SESSION);
    const { PUT } = await import("@/app/api/admin/users/route");
    const { prisma } = await import("@/lib/db");

    const req = createJsonRequest("/api/admin/users", { id: "user-1", email: "not-an-email" }, "PUT");
    const res = await PUT(req as any);

    expect(res.status).toBe(400);
    expect(prisma.user.update as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("PUT mit zu kurzem Passwort wird abgelehnt (400)", async () => {
    await mockAuth(ADMIN_SESSION);
    const { PUT } = await import("@/app/api/admin/users/route");
    const { prisma } = await import("@/lib/db");

    const req = createJsonRequest("/api/admin/users", { id: "user-1", password: "abc" }, "PUT");
    const res = await PUT(req as any);

    expect(res.status).toBe(400);
    expect(prisma.user.update as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("PUT mit ungueltiger Role wird abgelehnt (400)", async () => {
    await mockAuth(ADMIN_SESSION);
    const { PUT } = await import("@/app/api/admin/users/route");
    const { prisma } = await import("@/lib/db");

    const req = createJsonRequest("/api/admin/users", { id: "user-1", role: "SUPERADMIN" }, "PUT");
    const res = await PUT(req as any);

    expect(res.status).toBe(400);
    expect(prisma.user.update as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("PUT mit gueltigem partiellem Update funktioniert (200)", async () => {
    await mockAuth(ADMIN_SESSION);
    const { PUT } = await import("@/app/api/admin/users/route");
    const { prisma } = await import("@/lib/db");

    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      name: "Neuer Name",
      email: "test@test.de",
      role: "EXPERT",
      active: true,
      password: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      teams: [],
    });

    const req = createJsonRequest("/api/admin/users", { id: "user-1", name: "Neuer Name" }, "PUT");
    const res = await PUT(req as any);

    expect(res.status).toBe(200);
    expect(prisma.user.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } })
    );
  });

  it("PUT mit active=false funktioniert (boolean-Validierung)", async () => {
    await mockAuth(ADMIN_SESSION);
    const { PUT } = await import("@/app/api/admin/users/route");
    const { prisma } = await import("@/lib/db");

    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      name: "Test User",
      email: "test@test.de",
      role: "EXPERT",
      active: false,
      password: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      teams: [],
    });

    const req = createJsonRequest("/api/admin/users", { id: "user-1", active: false }, "PUT");
    const res = await PUT(req as any);

    expect(res.status).toBe(200);
    expect(prisma.user.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ active: false }),
      })
    );
  });
});

describe("Input-Validierung: PATCH /api/aktionen/bulk-kategorie", () => {
  it("Ungueltige Kategorie wird abgelehnt (400)", async () => {
    await mockAuth(ADMIN_SESSION);
    const { PATCH } = await import("@/app/api/aktionen/bulk-kategorie/route");
    const { prisma } = await import("@/lib/db");

    const req = createJsonRequest(
      "/api/aktionen/bulk-kategorie",
      { ids: ["aktion-1"], kategorie: "DROP TABLE aktionen" },
      "PATCH"
    );
    const res = await PATCH(req as any);

    expect(res.status).toBe(400);
    expect(prisma.aktion.updateMany as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("Leeres ids-Array wird abgelehnt (400)", async () => {
    await mockAuth(ADMIN_SESSION);
    const { PATCH } = await import("@/app/api/aktionen/bulk-kategorie/route");
    const { prisma } = await import("@/lib/db");

    const req = createJsonRequest(
      "/api/aktionen/bulk-kategorie",
      { ids: [], kategorie: "HAUSTUER" },
      "PATCH"
    );
    const res = await PATCH(req as any);

    expect(res.status).toBe(400);
    // Ohne diese Pruefung wuerde updateMany ohne id-Filter laufen
    expect(prisma.aktion.updateMany as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("Fehlende Kategorie wird abgelehnt (400)", async () => {
    await mockAuth(ADMIN_SESSION);
    const { PATCH } = await import("@/app/api/aktionen/bulk-kategorie/route");
    const { prisma } = await import("@/lib/db");

    const req = createJsonRequest(
      "/api/aktionen/bulk-kategorie",
      { ids: ["aktion-1"] },
      "PATCH"
    );
    const res = await PATCH(req as any);

    expect(res.status).toBe(400);
    expect(prisma.aktion.updateMany as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("Gueltige Eingabe wird akzeptiert (200)", async () => {
    await mockAuth(ADMIN_SESSION);
    const { PATCH } = await import("@/app/api/aktionen/bulk-kategorie/route");
    const { prisma } = await import("@/lib/db");
    (prisma.aktion.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    const req = createJsonRequest(
      "/api/aktionen/bulk-kategorie",
      { ids: ["aktion-1"], kategorie: "INFOSTAND" },
      "PATCH"
    );
    const res = await PATCH(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
  });
});

describe("Eingabevalidierung: Grenzen der öffentlichen Anmeldung", () => {
  function post(body: unknown, ip: string, headers: Record<string, string> = {}) {
    return new Request("http://localhost:3000/api/anmeldungen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("101 Aktionen auf einmal → 400", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");
    const ids = Array.from({ length: 101 }, (_, i) => `aktion-${i}`);
    const res = await POST(post(createAnmeldungBody({ aktionIds: ids }), "10.1.0.1") as any);
    expect(res.status).toBe(400);
  });

  it("Vorname mit 101 Zeichen → 400", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");
    const res = await POST(post(createAnmeldungBody({ vorname: "a".repeat(101) }), "10.1.0.2") as any);
    expect(res.status).toBe(400);
  });

  it("Anfrage über 32 KB → 413, ohne Datenbankzugriff", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");
    const { prisma } = await import("@/lib/db");
    const body = JSON.stringify(createAnmeldungBody({ nachname: "x".repeat(40_000) }));
    const res = await POST(post(body, "10.1.0.3") as any);
    expect(res.status).toBe(413);
    expect(prisma.aktion.findUnique).not.toHaveBeenCalled();
  });

  it("Content-Length über dem Limit → 413 vor dem Lesen", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");
    const res = await POST(post(createAnmeldungBody(), "10.1.0.4", { "content-length": "999999" }) as any);
    expect(res.status).toBe(413);
  });

  it("Ungültiges JSON → 400", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");
    const res = await POST(post("{kaputt", "10.1.0.5") as any);
    expect(res.status).toBe(400);
  });

  it("doppelte Aktions-IDs → nur eine Anmeldung", async () => {
    const { POST } = await import("@/app/api/anmeldungen/route");
    const { prisma } = await import("@/lib/db");
    (prisma.aktion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "aktion-1",
      titel: "T",
      datum: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      startzeit: "10:00",
      endzeit: "12:00",
      adresse: "A",
      ansprechpersonName: "N",
      ansprechpersonEmail: "n@test.de",
      ansprechpersonTelefon: "030",
      maxTeilnehmer: null,
      status: "AKTIV",
      _count: { anmeldungen: 0 },
    });
    (prisma.anmeldung.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(
      post(createAnmeldungBody({ aktionIds: ["aktion-1", "aktion-1", "aktion-1"] }), "10.1.0.6") as any
    );
    expect(res.status).toBe(200);
    expect(prisma.anmeldung.create).toHaveBeenCalledTimes(1);
  });
});

describe("Passwort-Regeln für verwaltete Accounts", () => {
  it("weniger als 12 Zeichen, mehr als 72 Byte → abgelehnt; 12 Zeichen → ok", async () => {
    const { userSchema, userUpdateSchema } = await import("@/lib/validators");
    const base = { name: "Test", email: "t@test.de", role: "EXPERT" as const };

    expect(userSchema.safeParse({ ...base, password: "a".repeat(11) }).success).toBe(false);
    expect(userSchema.safeParse({ ...base, password: "a".repeat(12) }).success).toBe(true);
    expect(userSchema.safeParse({ ...base, password: "a".repeat(73) }).success).toBe(false);
    // 37 Umlaute = 74 Byte: bcrypt würde den Rest ignorieren
    expect(userSchema.safeParse({ ...base, password: "ä".repeat(37) }).success).toBe(false);

    expect(userUpdateSchema.safeParse({ id: "u1", password: "kurz12345" }).success).toBe(false);
    expect(userUpdateSchema.safeParse({ id: "u1" }).success).toBe(true);
  });
});
