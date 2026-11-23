/**
 * Sicherheitstests: Team-Datenisolierung
 *
 * Der KRITISCHSTE Test: Stellt sicher, dass ein EXPERT nur Daten
 * von Aktionen seiner Teams (eine Aktion kann mehreren Teams gehören) oder
 * selbst angelegter Aktionen sehen und bearbeiten kann. Verhindert, dass
 * persönliche Daten (Namen, E-Mails, Telefonnummern) an unbefugte
 * Team-Mitglieder gelangen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockAuth, createRequest, createJsonRequest, EXPERT_TEAM_A, EXPERT_OHNE_TEAM, ADMIN_SESSION } from "./helpers";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

const mockPrisma = {
  aktion: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  anmeldung: {
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
  team: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
  wahlkreis: { findMany: vi.fn() },
};

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/geocoding", () => ({ geocodeAddress: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({
  anmeldebestaetigungEmail: vi.fn(() => ({ subject: "", html: "" })),
  aenderungsEmail: vi.fn(() => ({ subject: "", html: "" })),
  absageEmail: vi.fn(() => ({ subject: "", html: "" })),
}));

vi.mock("@/lib/excel", () => ({
  createAnmeldungenExcel: vi.fn(() => new ArrayBuffer(0)),
  createAnmeldungenTxt: vi.fn(() => ""),
  createAktionenExcel: vi.fn(() => new ArrayBuffer(0)),
  createAktionenTxt: vi.fn(() => ""),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Team-Isolation: Anmeldungen (persönliche Daten)", () => {
  it("EXPERT kann Anmeldungen des eigenen Teams abrufen", async () => {
    await mockAuth(EXPERT_TEAM_A);

    // Aktion gehört zu Team A
    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "aktion-1",
      createdById: "expert-x",
      teams: [{ teamId: "team-a" }],
    });
    mockPrisma.anmeldung.findMany.mockResolvedValue([
      { id: "a1", vorname: "Max", nachname: "Muster", email: "max@test.de", telefon: "0171234", signalName: null },
    ]);

    const { GET } = await import("@/app/api/actions/[id]/signups/route");
    const req = createRequest("/api/actions/aktion-1/signups");
    const res = await GET(req as any, { params: Promise.resolve({ id: "aktion-1" }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].vorname).toBe("Max");

    // Abmelde-Token darf nicht an den Browser gehen
    const { select } = mockPrisma.anmeldung.findMany.mock.calls[0][0];
    expect(select).toBeDefined();
    expect(select).not.toHaveProperty("cancelToken");
  });

  it("EXPERT kann NICHT Anmeldungen eines fremden Teams abrufen → 403", async () => {
    await mockAuth(EXPERT_TEAM_A);

    // Aktion gehört zu Team B – NICHT Team A
    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "aktion-2",
      createdById: "expert-b",
      teams: [{ teamId: "team-b" }],
    });

    const { GET } = await import("@/app/api/actions/[id]/signups/route");
    const req = createRequest("/api/actions/aktion-2/signups");
    const res = await GET(req as any, { params: Promise.resolve({ id: "aktion-2" }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Kein Zugriff");

    // Sicherstellen, dass keine Anmeldungsdaten abgerufen wurden
    expect(mockPrisma.anmeldung.findMany).not.toHaveBeenCalled();
  });

  it("ADMIN kann Anmeldungen aller Teams abrufen", async () => {
    await mockAuth(ADMIN_SESSION);

    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "aktion-2",
      createdById: "expert-b",
      teams: [{ teamId: "team-b" }],
    });
    mockPrisma.anmeldung.findMany.mockResolvedValue([
      { id: "a1", vorname: "Lisa", nachname: "Test", email: "lisa@test.de" },
    ]);

    const { GET } = await import("@/app/api/actions/[id]/signups/route");
    const req = createRequest("/api/actions/aktion-2/signups");
    const res = await GET(req as any, { params: Promise.resolve({ id: "aktion-2" }) });

    expect(res.status).toBe(200);
  });

  it("EXPERT sieht Anmeldungen, wenn sein Team eines von mehreren Teams der Aktion ist", async () => {
    await mockAuth(EXPERT_TEAM_A);

    // Aktion von Team B angelegt und zusätzlich Team A zugeordnet
    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "aktion-3",
      createdById: "expert-b",
      teams: [{ teamId: "team-b" }, { teamId: "team-a" }],
    });
    mockPrisma.anmeldung.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/actions/[id]/signups/route");
    const req = createRequest("/api/actions/aktion-3/signups");
    const res = await GET(req as any, { params: Promise.resolve({ id: "aktion-3" }) });

    expect(res.status).toBe(200);
  });

  it("EXPERT sieht Anmeldungen selbst angelegter Aktionen, auch wenn nur fremde Teams zugeordnet sind", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "aktion-4",
      createdById: "expert-a",
      teams: [{ teamId: "team-b" }],
    });
    mockPrisma.anmeldung.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/actions/[id]/signups/route");
    const req = createRequest("/api/actions/aktion-4/signups");
    const res = await GET(req as any, { params: Promise.resolve({ id: "aktion-4" }) });

    expect(res.status).toBe(200);
  });
});

describe("Team-Isolation: Anmeldung löschen", () => {
  it("EXPERT kann KEINE Anmeldung einer fremden Aktion über die eigene Aktion löschen → 404", async () => {
    await mockAuth(EXPERT_TEAM_A);

    // Eigene Aktion im Pfad, aber anmeldungId gehört zu einer fremden Aktion
    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "eigene",
      createdById: "expert-x",
      teams: [{ teamId: "team-a" }],
    });
    mockPrisma.anmeldung.deleteMany.mockResolvedValue({ count: 0 });

    const { DELETE } = await import("@/app/api/actions/[id]/signups/[signupId]/route");
    const req = createRequest("/api/actions/eigene/signups/fremd", { method: "DELETE" });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "eigene", signupId: "fremd" }) });

    expect(res.status).toBe(404);
    expect(mockPrisma.anmeldung.deleteMany).toHaveBeenCalledWith({
      where: { id: "fremd", aktionId: "eigene" },
    });
  });

  it("EXPERT kann Anmeldung der eigenen Aktion löschen", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "eigene",
      createdById: "expert-x",
      teams: [{ teamId: "team-a" }],
    });
    mockPrisma.anmeldung.deleteMany.mockResolvedValue({ count: 1 });

    const { DELETE } = await import("@/app/api/actions/[id]/signups/[signupId]/route");
    const req = createRequest("/api/actions/eigene/signups/a1", { method: "DELETE" });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "eigene", signupId: "a1" }) });

    expect(res.status).toBe(200);
  });

  it("EXPERT kann NICHT Anmeldungen einer fremden Aktion löschen → 403", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "aktion-2",
      createdById: "expert-b",
      teams: [{ teamId: "team-b" }],
    });

    const { DELETE } = await import("@/app/api/actions/[id]/signups/[signupId]/route");
    const req = createRequest("/api/actions/aktion-2/signups/a1", { method: "DELETE" });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "aktion-2", signupId: "a1" }) });

    expect(res.status).toBe(403);
    expect(mockPrisma.anmeldung.deleteMany).not.toHaveBeenCalled();
  });
});

describe("Team-Isolation: Aktionen bearbeiten", () => {
  it("EXPERT kann NICHT Aktion eines fremden Teams bearbeiten → 403", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "aktion-2",
      createdById: "expert-b",
      teams: [{ teamId: "team-b" }],
      anmeldungen: [],
      adresse: "Alte Straße 1",
      datum: new Date("2025-06-01"),
      startzeit: "10:00",
      endzeit: "12:00",
    });

    const { PUT } = await import("@/app/api/actions/[id]/route");
    const req = createJsonRequest("/api/actions/aktion-2", {
      titel: "Gehackt",
      datum: "2025-06-01",
      startzeit: "10:00",
      endzeit: "12:00",
      adresse: "Neue Straße 1",
      wahlkreisId: "wk-1",
      ansprechpersonName: "Test",
      ansprechpersonEmail: "test@test.de",
      ansprechpersonTelefon: "0170000",
    }, "PUT");

    const res = await PUT(req as any, { params: Promise.resolve({ id: "aktion-2" }) });

    expect(res.status).toBe(403);
    expect(mockPrisma.aktion.update).not.toHaveBeenCalled();
  });

  it("EXPERT kann NICHT Aktion eines fremden Teams löschen → 403", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "aktion-2",
      createdById: "expert-b",
      teams: [{ teamId: "team-b" }],
      anmeldungen: [],
    });

    const { DELETE } = await import("@/app/api/actions/[id]/route");
    const req = createRequest("/api/actions/aktion-2", { method: "DELETE" });
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "aktion-2" }) });

    expect(res.status).toBe(403);
    expect(mockPrisma.aktion.update).not.toHaveBeenCalled();
  });
});

describe("Team-Isolation: Datenexport", () => {
  it("EXPERT-Export filtert automatisch auf eigenes Team", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.anmeldung.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/signups/export/route");
    const req = createRequest("/api/signups/export?format=txt");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    // Prüfen, dass der Prisma-Aufruf den Team-Filter enthält
    const callArgs = mockPrisma.anmeldung.findMany.mock.calls[0][0];
    expect(callArgs.where.aktion).toEqual({ OR: [{ teams: { some: { teamId: { in: ["team-a"] } } } }, { createdById: "expert-a" }] });
  });

  it("EXPERT kann NICHT Daten anderer Teams exportieren (teamId-Parameter wird ignoriert)", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.anmeldung.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/signups/export/route");
    // Versuch, Team B zu exportieren
    const req = createRequest("/api/signups/export?format=txt&teamId=team-b");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    // Auch wenn teamId=team-b übergeben wird, muss der Filter team-a verwenden
    const callArgs = mockPrisma.anmeldung.findMany.mock.calls[0][0];
    expect(callArgs.where.aktion).toEqual({ OR: [{ teams: { some: { teamId: { in: ["team-a"] } } } }, { createdById: "expert-a" }] });
  });

  it("EXPERT ohne Team exportiert nur Anmeldungen selbst erstellter Aktionen", async () => {
    await mockAuth(EXPERT_OHNE_TEAM);

    mockPrisma.anmeldung.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/signups/export/route");
    const req = createRequest("/api/signups/export?format=txt");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    const callArgs = mockPrisma.anmeldung.findMany.mock.calls[0][0];
    expect(callArgs.where.aktion).toEqual({ OR: [{ createdById: "expert-ohne-team" }] });
  });

  it("EXPERT ohne Team kann NICHT per teamId-Parameter fremde Anmeldungen exportieren", async () => {
    await mockAuth(EXPERT_OHNE_TEAM);

    mockPrisma.anmeldung.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/signups/export/route");
    const req = createRequest("/api/signups/export?format=txt&teamId=team-b");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    const callArgs = mockPrisma.anmeldung.findMany.mock.calls[0][0];
    expect(callArgs.where.aktion).toEqual({ OR: [{ createdById: "expert-ohne-team" }] });
  });
});

describe("Team-Isolation: Aktionen-Export (export-aktionen)", () => {
  it("EXPERT-Export filtert automatisch auf eigenes Team", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.aktion.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/actions/export/route");
    const req = createRequest("/api/actions/export?format=txt");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    const callArgs = mockPrisma.aktion.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toEqual({ OR: [{ teams: { some: { teamId: { in: ["team-a"] } } } }, { createdById: "expert-a" }] }.OR);
  });

  it("EXPERT kann NICHT Aktionen anderer Teams exportieren (teamId-Parameter wird ignoriert)", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.aktion.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/actions/export/route");
    const req = createRequest("/api/actions/export?format=txt&teamId=team-b");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    // Auch wenn teamId=team-b übergeben wird, muss der Filter team-a verwenden
    const callArgs = mockPrisma.aktion.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toEqual({ OR: [{ teams: { some: { teamId: { in: ["team-a"] } } } }, { createdById: "expert-a" }] }.OR);
    expect(callArgs.where).not.toHaveProperty("teams");
  });

  it("EXPERT ohne Team exportiert nur selbst erstellte Aktionen", async () => {
    await mockAuth(EXPERT_OHNE_TEAM);

    mockPrisma.aktion.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/actions/export/route");
    const req = createRequest("/api/actions/export?format=txt&teamId=team-b");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    const callArgs = mockPrisma.aktion.findMany.mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty("teams");
    expect(callArgs.where.OR).toEqual([{ createdById: "expert-ohne-team" }]);
  });

  it("ADMIN sieht alle Aktionen ohne Filter", async () => {
    await mockAuth(ADMIN_SESSION);

    mockPrisma.aktion.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/actions/export/route");
    const req = createRequest("/api/actions/export?format=txt");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    const callArgs = mockPrisma.aktion.findMany.mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty("teams");
    expect(callArgs.where).not.toHaveProperty("OR");
  });

  it("ADMIN kann nach teamId filtern", async () => {
    await mockAuth(ADMIN_SESSION);

    mockPrisma.aktion.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/actions/export/route");
    const req = createRequest("/api/actions/export?format=txt&teamId=team-b");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    const callArgs = mockPrisma.aktion.findMany.mock.calls[0][0];
    expect(callArgs.where.teams).toEqual({ some: { teamId: "team-b" } });
  });

  it("EXPERT kann nach eigenem Team filtern, ohne die Team-Isolation zu verlieren", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.aktion.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/actions/export/route");
    const req = createRequest("/api/actions/export?format=txt&teamId=team-a");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    const callArgs = mockPrisma.aktion.findMany.mock.calls[0][0];
    expect(callArgs.where.teams).toEqual({ some: { teamId: "team-a" } });
    expect(callArgs.where.OR).toEqual([{ teams: { some: { teamId: { in: ["team-a"] } } } }, { createdById: "expert-a" }]);
  });

  it("nurEigene beschraenkt den Export auf selbst angelegte Aktionen", async () => {
    await mockAuth(ADMIN_SESSION);

    mockPrisma.aktion.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/actions/export/route");
    const req = createRequest("/api/actions/export?format=txt&mine=true");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    const callArgs = mockPrisma.aktion.findMany.mock.calls[0][0];
    expect(callArgs.where.createdById).toBe(ADMIN_SESSION.user.id);
  });

  it("hidePast laesst Aktionen aelter als einen Tag weg", async () => {
    await mockAuth(ADMIN_SESSION);

    mockPrisma.aktion.findMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/actions/export/route");
    const req = createRequest("/api/actions/export?format=txt&hidePast=true");
    const res = await GET(req as any);

    expect(res.status).toBe(200);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 1);
    cutoff.setHours(0, 0, 0, 0);
    const callArgs = mockPrisma.aktion.findMany.mock.calls[0][0];
    expect(callArgs.where.datum.gte).toEqual(cutoff);
  });
});

describe("PII-Schutz: Oeffentlicher Aktionszugriff", () => {
  const aktionMitPII = {
    id: "aktion-1",
    createdById: "expert-a",
    ansprechpersonName: "Max Muster",
    ansprechpersonEmail: "max@test.de",
    ansprechpersonTelefon: "0171234",
    wahlkreis: { id: "wk-1", name: "WK1", nummer: 1 },
    teams: [{ team: { id: "team-a", name: "Team A" } }],
    _count: { anmeldungen: 3 },
  };

  it("Unauthentifizierter Caller sieht keine Kontakt-PII", async () => {
    await mockAuth(null);

    mockPrisma.aktion.findUnique.mockResolvedValue(aktionMitPII);

    const { GET } = await import("@/app/api/actions/[id]/route");
    const req = createRequest("/api/actions/aktion-1");
    const res = await GET(req as any, { params: Promise.resolve({ id: "aktion-1" }) });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ansprechpersonName).toBe("Max Muster");
    expect(data.ansprechpersonEmail).toBeUndefined();
    expect(data.ansprechpersonTelefon).toBeUndefined();
  });

  it("Authentifizierter Nutzer sieht Kontakt-PII", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.aktion.findUnique.mockResolvedValue(aktionMitPII);

    const { GET } = await import("@/app/api/actions/[id]/route");
    const req = createRequest("/api/actions/aktion-1");
    const res = await GET(req as any, { params: Promise.resolve({ id: "aktion-1" }) });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ansprechpersonEmail).toBe("max@test.de");
    expect(data.ansprechpersonTelefon).toBe("0171234");
  });
});

describe("Team-Isolation: Bulk-Umkategorisierung", () => {
  it("EXPERT-Bulk-Update setzt Team-Filter im where", async () => {
    await mockAuth(EXPERT_TEAM_A);
    mockPrisma.aktion.updateMany.mockResolvedValue({ count: 1 });

    const { PATCH } = await import("@/app/api/actions/route");
    const req = createJsonRequest(
      "/api/actions",
      { ids: ["aktion-1", "fremde-aktion"], kategorie: "HAUSTUER" },
      "PATCH"
    );
    const res = await PATCH(req as any);

    expect(res.status).toBe(200);

    const where = mockPrisma.aktion.updateMany.mock.calls[0][0].where;
    // Ohne diesen Filter koennte ein EXPERT fremde Aktionen umkategorisieren
    expect(where.OR).toEqual({ OR: [{ teams: { some: { teamId: { in: ["team-a"] } } } }, { createdById: "expert-a" }] }.OR);
    expect(where.id).toEqual({ in: ["aktion-1", "fremde-aktion"] });
  });

  it("Fremde Aktions-IDs bleiben unveraendert (count 0)", async () => {
    await mockAuth(EXPERT_TEAM_A);
    // Prisma matcht keine Zeile, weil die IDs zu Team B gehoeren
    mockPrisma.aktion.updateMany.mockResolvedValue({ count: 0 });

    const { PATCH } = await import("@/app/api/actions/route");
    const req = createJsonRequest(
      "/api/actions",
      { ids: ["team-b-aktion"], kategorie: "INFOSTAND" },
      "PATCH"
    );
    const res = await PATCH(req as any);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(0);
  });

  it("ADMIN-Bulk-Update ohne Team-Filter", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.aktion.updateMany.mockResolvedValue({ count: 2 });

    const { PATCH } = await import("@/app/api/actions/route");
    const req = createJsonRequest(
      "/api/actions",
      { ids: ["a1", "a2"], kategorie: "SONSTIGES" },
      "PATCH"
    );
    const res = await PATCH(req as any);

    expect(res.status).toBe(200);
    const where = mockPrisma.aktion.updateMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });

  it("Bulk-Update verschickt keine E-Mails und aendert den Status nicht", async () => {
    await mockAuth(EXPERT_TEAM_A);
    mockPrisma.aktion.updateMany.mockResolvedValue({ count: 1 });
    const { sendEmail } = await import("@/lib/email");

    const { PATCH } = await import("@/app/api/actions/route");
    const req = createJsonRequest(
      "/api/actions",
      { ids: ["aktion-1"], kategorie: "HAUSTUER" },
      "PATCH"
    );
    await PATCH(req as any);

    expect(sendEmail).not.toHaveBeenCalled();
    const data = mockPrisma.aktion.updateMany.mock.calls[0][0].data;
    expect(data).toEqual({ kategorie: "HAUSTUER" });
    expect(data.status).toBeUndefined();
  });
});
