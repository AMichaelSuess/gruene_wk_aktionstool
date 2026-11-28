/**
 * Sicherheitstests: Datensäuberung
 *
 * Prüft, dass sensible Daten (Passwörter) niemals in API-Responses
 * auftauchen und dass öffentliche Endpunkte keine persönlichen Daten leaken.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockAuth, ADMIN_SESSION, EXPERT_TEAM_A, createJsonRequest } from "./helpers";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

const mockPrisma = {
  aktion: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  anmeldung: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
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

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(() => "$2a$12$hashedpassword"),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Passwörter werden nie in Responses exponiert", () => {
  it("GET /api/users → Passwörter entfernt", async () => {
    await mockAuth(ADMIN_SESSION);

    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        name: "Max Muster",
        email: "max@test.de",
        password: "$2a$12$geheimerHash",
        role: "ADMIN",
        active: true,
        teams: [{ team: { id: "team-1", name: "Team 1" } }],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const { GET } = await import("@/app/api/users/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0]).not.toHaveProperty("password");
    expect(JSON.stringify(data)).not.toContain("geheimerHash");
  });

  it("POST /api/users → Passwort nicht in Response", async () => {
    await mockAuth(ADMIN_SESSION);

    mockPrisma.user.findUnique.mockResolvedValue(null); // Kein existierender User
    mockPrisma.user.create.mockResolvedValue({
      id: "new-user",
      name: "Neue Person",
      email: "neu@test.de",
      password: "$2a$12$neuerHash",
      role: "EXPERT",
      active: true,
      teams: [{ team: { id: "team-1", name: "Team 1" } }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { POST } = await import("@/app/api/users/route");
    const req = createJsonRequest("/api/users", {
      name: "Neue Person",
      email: "neu@test.de",
      password: "sicheres-passwort",
      role: "EXPERT",
      teamIds: ["team-1"],
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data).not.toHaveProperty("password");
    expect(JSON.stringify(data)).not.toContain("neuerHash");
  });

  it("PUT /api/users → Passwort nicht in Response", async () => {
    await mockAuth(ADMIN_SESSION);

    mockPrisma.user.update.mockResolvedValue({
      id: "user-1",
      name: "Geändert",
      email: "max@test.de",
      password: "$2a$12$aktualisierterHash",
      role: "ADMIN",
      active: true,
      teams: [{ team: { id: "team-1", name: "Team 1" } }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { PUT } = await import("@/app/api/users/[id]/route");
    const req = createJsonRequest("/api/users/user-1", { name: "Geändert" }, "PUT");
    const res = await PUT(req as any, { params: Promise.resolve({ id: "user-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).not.toHaveProperty("password");
    expect(JSON.stringify(data)).not.toContain("aktualisierterHash");
  });
});

describe("Öffentliche Endpunkte leaken keine persönlichen Daten", () => {
  it("GET /api/actions (öffentlich) → enthält keine Anmeldungsdaten", async () => {
    await mockAuth(null); // Nicht authentifiziert

    const mockAktionen = [
      {
        id: "aktion-1",
        titel: "Haustürwahlkampf",
        beschreibung: "Test",
        // Zukünftiges Datum, da vergangene Aktionen öffentlich ausgeblendet werden
        datum: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        startzeit: "10:00",
        endzeit: "12:00",
        adresse: "Musterstr. 1",
        status: "AKTIV",
        wahlkreis: { id: "wk-1", name: "Wahlkreis 1", nummer: 1 },
        teams: [{ team: { id: "team-1", name: "Team 1" } }],
        _count: { anmeldungen: 5 },
        // Persönliche Daten die NICHT exponiert werden sollten:
        ansprechpersonName: "Kontakt Person",
        ansprechpersonEmail: "kontakt@gruene.de",
        ansprechpersonTelefon: "030123456",
      },
    ];

    mockPrisma.aktion.findMany.mockResolvedValue(mockAktionen);

    const { GET } = await import("@/app/api/actions/route");
    const req = new Request("http://localhost:3000/api/actions");
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);

    // Anmeldungsdaten (vorname, nachname, email, telefon) dürfen NICHT enthalten sein
    const responseText = JSON.stringify(data);
    expect(responseText).not.toContain("vorname");
    expect(responseText).not.toContain("nachname");
    expect(data[0]).not.toHaveProperty("anmeldungen");

    // Kontaktdaten der Ansprechperson und interne User-IDs sind nicht öffentlich
    expect(data[0].ansprechpersonName).toBe("K.P.");
    expect(data[0]).not.toHaveProperty("ansprechpersonEmail");
    expect(data[0]).not.toHaveProperty("ansprechpersonTelefon");
    expect(data[0]).not.toHaveProperty("createdById");
  });

  it("GET /api/actions?public=true (eingeloggt) → keine Kontaktdaten der Ansprechperson", async () => {
    await mockAuth(EXPERT_TEAM_A);

    mockPrisma.aktion.findMany.mockResolvedValue([
      {
        id: "aktion-1",
        titel: "Haustürwahlkampf",
        datum: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        startzeit: "10:00",
        status: "AKTIV",
        teams: [],
        _count: { anmeldungen: 0 },
        createdById: "user-1",
        ansprechpersonName: "Kontakt Person",
        ansprechpersonEmail: "kontakt@gruene.de",
        ansprechpersonTelefon: "030123456",
      },
    ]);

    const { GET } = await import("@/app/api/actions/route");
    const res = await GET(new Request("http://localhost:3000/api/actions?public=true") as any);
    const data = await res.json();

    expect(data[0]).not.toHaveProperty("ansprechpersonEmail");
    expect(data[0]).not.toHaveProperty("ansprechpersonTelefon");
    expect(data[0]).not.toHaveProperty("createdById");
  });

  it("GET /api/actions/[id] (öffentlich) → keine Kontaktdaten und keine User-ID", async () => {
    await mockAuth(null);

    mockPrisma.aktion.findUnique.mockResolvedValue({
      id: "aktion-1",
      titel: "Haustürwahlkampf",
      teams: [],
      _count: { anmeldungen: 0 },
      createdById: "user-1",
      ansprechpersonName: "Kontakt Person",
      ansprechpersonEmail: "kontakt@gruene.de",
      ansprechpersonTelefon: "030123456",
    });

    const { GET } = await import("@/app/api/actions/[id]/route");
    const res = await GET(new Request("http://localhost:3000/api/actions/aktion-1") as any, {
      params: Promise.resolve({ id: "aktion-1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ansprechpersonName).toBe("K.P.");
    expect(data).not.toHaveProperty("ansprechpersonEmail");
    expect(data).not.toHaveProperty("ansprechpersonTelefon");
    expect(data).not.toHaveProperty("createdById");
  });
});
