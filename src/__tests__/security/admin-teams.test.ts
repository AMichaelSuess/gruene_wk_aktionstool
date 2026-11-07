/**
 * Sicherheitstests: Team-Zuordnung beim Anlegen und Importieren
 *
 * Admins stehen über den Teams: Sie wählen beim Anlegen frei ein Team oder
 * bewusst keins, unabhängig von eigenen Team-Mitgliedschaften. Experts dürfen
 * Aktionen nur ihren eigenen Teams zuordnen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockAuth, createRequest, createJsonRequest, EXPERT_TEAM_A, type MockSession } from "./helpers";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

const mockPrisma = {
  aktion: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  wahlkreis: { findMany: vi.fn() },
};

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/geocoding", () => ({ geocodeAddress: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({
  aenderungsEmail: vi.fn(() => ({ subject: "", html: "" })),
  absageEmail: vi.fn(() => ({ subject: "", html: "" })),
}));

const excelRow = {
  titel: "Infostand",
  datum: "01.06.2099",
  startzeit: "10:00",
  endzeit: "12:00",
  adresse: "Alexanderplatz 1, 10178 Berlin",
  wahlkreis: 1,
  kategorie: "INFOSTAND",
  ansprechpersonName: "Max Muster",
  ansprechpersonEmail: "max@test.de",
  ansprechpersonTelefon: "0171234567",
};

vi.mock("@/lib/excel", () => ({
  parseExcelFile: vi.fn(async () => [excelRow]),
  convertDatumToISO: (datum: string) => {
    const m = datum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : datum;
  },
}));

// Admin, der selbst genau einem Team angehört
const ADMIN_IN_TEAM_A: MockSession = {
  user: {
    id: "admin-1",
    name: "Admin User",
    email: "admin@test.de",
    role: "ADMIN",
    teamId: "team-a",
    teamIds: ["team-a"],
  },
};

const EXPERT_TEAMS_A_B: MockSession = {
  user: {
    id: "expert-ab",
    name: "Expert AB",
    email: "expert-ab@test.de",
    role: "EXPERT",
    teamId: "team-a",
    teamIds: ["team-a", "team-b"],
  },
};

const aktionBody = {
  titel: "Infostand",
  datum: "2099-06-01",
  startzeit: "10:00",
  endzeit: "12:00",
  adresse: "Alexanderplatz 1, 10178 Berlin",
  wahlkreisId: "wk-1",
  kategorie: "INFOSTAND",
  ansprechpersonName: "Max Muster",
  ansprechpersonEmail: "max@test.de",
  ansprechpersonTelefon: "0171234567",
};

function importRequest(teamId?: string): Request {
  const formData = new FormData();
  formData.append("file", new File(["x"], "aktionen.xlsx"));
  formData.append("import", "true");
  if (teamId) formData.append("teamId", teamId);
  return createRequest("/api/upload", { method: "POST", body: formData });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.aktion.create.mockResolvedValue({ id: "neu" });
  mockPrisma.aktion.findFirst.mockResolvedValue(null);
  mockPrisma.wahlkreis.findMany.mockResolvedValue([{ id: "wk-1", nummer: 1 }]);
});

describe("Admins stehen über den Teams: Aktion anlegen", () => {
  it("ADMIN kann ein Team wählen, dem er nicht angehört", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const { POST } = await import("@/app/api/aktionen/route");
    const res = await POST(createJsonRequest("/api/aktionen", { ...aktionBody, teamId: "team-c" }) as any);

    expect(res.status).toBe(201);
    expect(mockPrisma.aktion.create.mock.calls[0][0].data.teamId).toBe("team-c");
  });

  it("ADMIN ohne Teamwahl legt Aktion ohne Team an (keine Zuordnung zum eigenen Team)", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const { POST } = await import("@/app/api/aktionen/route");
    const res = await POST(createJsonRequest("/api/aktionen", { ...aktionBody, teamId: null }) as any);

    expect(res.status).toBe(201);
    expect(mockPrisma.aktion.create.mock.calls[0][0].data.teamId).toBeNull();
  });

  it("EXPERT kann Aktion KEINEM fremden Team zuordnen", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const { POST } = await import("@/app/api/aktionen/route");
    const res = await POST(createJsonRequest("/api/aktionen", { ...aktionBody, teamId: "team-c" }) as any);

    expect(res.status).toBe(201);
    expect(mockPrisma.aktion.create.mock.calls[0][0].data.teamId).toBe("team-a");
  });
});

describe("Admins stehen über den Teams: Aktion bearbeiten", () => {
  const existing = {
    id: "aktion-1",
    ...aktionBody,
    datum: new Date("2099-06-01"),
    teamId: "team-a",
    status: "AKTIV",
    createdById: "expert-a",
    anmeldungen: [],
  };

  it("ADMIN kann die Team-Zuordnung entfernen", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);
    mockPrisma.aktion.findUnique.mockResolvedValue(existing);
    mockPrisma.aktion.update.mockResolvedValue(existing);

    const { PUT } = await import("@/app/api/aktionen/[id]/route");
    const req = createJsonRequest("/api/aktionen/aktion-1", { ...aktionBody, teamId: "" }, "PUT");
    const res = await PUT(req as any, { params: Promise.resolve({ id: "aktion-1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.aktion.update.mock.calls[0][0].data.teamId).toBeNull();
  });

  it("EXPERT kann die Team-Zuordnung NICHT ändern", async () => {
    await mockAuth(EXPERT_TEAM_A);
    mockPrisma.aktion.findUnique.mockResolvedValue(existing);
    mockPrisma.aktion.update.mockResolvedValue(existing);

    const { PUT } = await import("@/app/api/aktionen/[id]/route");
    const req = createJsonRequest("/api/aktionen/aktion-1", { ...aktionBody, teamId: "" }, "PUT");
    const res = await PUT(req as any, { params: Promise.resolve({ id: "aktion-1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.aktion.update.mock.calls[0][0].data).not.toHaveProperty("teamId");
  });
});

describe("Team-Zuordnung beim Excel-Import", () => {
  it("ADMIN kann in ein Team importieren, dem er nicht angehört", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(importRequest("team-c") as any);

    expect(res.status).toBe(200);
    expect(mockPrisma.aktion.create.mock.calls[0][0].data.teamId).toBe("team-c");
  });

  it("ADMIN ohne Teamwahl importiert ohne Team", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(importRequest() as any);

    expect(res.status).toBe(200);
    expect(mockPrisma.aktion.create.mock.calls[0][0].data.teamId).toBeNull();
  });

  it("EXPERT mit mehreren Teams importiert in gewähltes eigenes Team", async () => {
    await mockAuth(EXPERT_TEAMS_A_B);

    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(importRequest("team-b") as any);

    expect(res.status).toBe(200);
    expect(mockPrisma.aktion.create.mock.calls[0][0].data.teamId).toBe("team-b");
  });

  it("EXPERT kann NICHT in ein fremdes Team importieren → 403", async () => {
    await mockAuth(EXPERT_TEAMS_A_B);

    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(importRequest("team-c") as any);

    expect(res.status).toBe(403);
    expect(mockPrisma.aktion.create).not.toHaveBeenCalled();
  });
});
