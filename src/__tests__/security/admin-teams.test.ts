/**
 * Sicherheitstests: Team-Zuordnung beim Anlegen, Bearbeiten und Importieren
 *
 * Eine Aktion kann mehreren Teams gehören (z. B. Themen-Team + Bezirks-Team).
 * Admins und Experts dürfen beliebige Teams zuordnen. Admins dürfen bewusst
 * keins wählen. Wer eine fremde Aktion bearbeitet, muss mindestens eines
 * seiner eigenen Teams zugeordnet lassen, damit er sich nicht aussperrt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockAuth, createRequest, createJsonRequest, EXPERT_TEAM_A, type MockSession } from "./helpers";
import { EIGENES_TEAM_BEHALTEN_FEHLER, FREMDES_TEAM_ENTFERNEN_FEHLER, UNBEKANNTES_TEAM_FEHLER } from "@/lib/aktion-teams";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// vi.hoisted, weil @/lib/aktion-teams oben statisch importiert wird und dabei
// den gemockten Prisma-Client schon braucht
const mockPrisma = vi.hoisted(() => ({
  aktion: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  team: { count: vi.fn(), findMany: vi.fn() },
  wahlkreis: { findMany: vi.fn() },
}));

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
  // Die Testdatei ist kein echtes .xlsx; Größenprüfung hier als bestanden annehmen
  xlsxUncompressedSize: vi.fn(() => 1),
  convertDatumToISO: (datum: string) => {
    const m = datum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : datum;
  },
}));

const KNOWN_TEAMS = [
  { id: "team-a", name: "Team A" },
  { id: "team-b", name: "Team B" },
  { id: "team-c", name: "Team Ost" },
];

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

function importRequest(teamIds: string[] = []): Request {
  const formData = new FormData();
  formData.append("file", new File(["x"], "aktionen.xlsx"));
  formData.append("import", "true");
  for (const teamId of teamIds) formData.append("teamIds", teamId);
  return createRequest("/api/actions/import", { method: "POST", body: formData });
}

function previewRequest(): Request {
  const formData = new FormData();
  formData.append("file", new File(["x"], "aktionen.xlsx"));
  return createRequest("/api/actions/import", { method: "POST", body: formData });
}

function createdTeamIds(callIndex = 0): string[] {
  const data = mockPrisma.aktion.create.mock.calls[callIndex][0].data;
  return data.teams.create.map((t: { teamId: string }) => t.teamId);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.aktion.create.mockResolvedValue({ id: "neu" });
  mockPrisma.aktion.findFirst.mockResolvedValue(null);
  mockPrisma.wahlkreis.findMany.mockResolvedValue([{ id: "wk-1", nummer: 1 }]);
  mockPrisma.team.findMany.mockResolvedValue(KNOWN_TEAMS);
  mockPrisma.team.count.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.filter((id) => KNOWN_TEAMS.some((t) => t.id === id)).length
  );
});

describe("Team-Zuordnung: Aktion anlegen", () => {
  it("ADMIN kann mehrere Teams wählen, auch solche, denen er nicht angehört", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const { POST } = await import("@/app/api/actions/route");
    const res = await POST(
      createJsonRequest("/api/actions", { ...aktionBody, teamIds: ["team-b", "team-c"] }) as any
    );

    expect(res.status).toBe(201);
    expect(createdTeamIds()).toEqual(["team-b", "team-c"]);
  });

  it("ADMIN ohne Teamwahl legt Aktion ohne Team an (keine Zuordnung zum eigenen Team)", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const { POST } = await import("@/app/api/actions/route");
    const res = await POST(createJsonRequest("/api/actions", { ...aktionBody, teamIds: [] }) as any);

    expect(res.status).toBe(201);
    expect(createdTeamIds()).toEqual([]);
  });

  it("EXPERT kann eigenes und fremdes Team zuordnen (Themen-Team + Bezirks-Team)", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const { POST } = await import("@/app/api/actions/route");
    const res = await POST(
      createJsonRequest("/api/actions", { ...aktionBody, teamIds: ["team-a", "team-c"] }) as any
    );

    expect(res.status).toBe(201);
    expect(createdTeamIds()).toEqual(["team-a", "team-c"]);
  });

  it("EXPERT kann eine Aktion nur einem fremden Team zuordnen (behält als Ersteller Zugriff)", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const { POST } = await import("@/app/api/actions/route");
    const res = await POST(createJsonRequest("/api/actions", { ...aktionBody, teamIds: ["team-c"] }) as any);

    expect(res.status).toBe(201);
    expect(createdTeamIds()).toEqual(["team-c"]);
    expect(mockPrisma.aktion.create.mock.calls[0][0].data.createdById).toBe("expert-a");
  });

  it("EXPERT ohne Teamwahl bekommt sein eigenes Team", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const { POST } = await import("@/app/api/actions/route");
    const res = await POST(createJsonRequest("/api/actions", aktionBody) as any);

    expect(res.status).toBe(201);
    expect(createdTeamIds()).toEqual(["team-a"]);
  });

  it("Doppelte Team-IDs werden nur einmal zugeordnet", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const { POST } = await import("@/app/api/actions/route");
    const res = await POST(
      createJsonRequest("/api/actions", { ...aktionBody, teamIds: ["team-a", "team-a"] }) as any
    );

    expect(res.status).toBe(201);
    expect(createdTeamIds()).toEqual(["team-a"]);
  });

  it("Unbekannte Team-ID → 400, keine Aktion angelegt", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const { POST } = await import("@/app/api/actions/route");
    const res = await POST(
      createJsonRequest("/api/actions", { ...aktionBody, teamIds: ["team-a", "gibt-es-nicht"] }) as any
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(UNBEKANNTES_TEAM_FEHLER);
    expect(mockPrisma.aktion.create).not.toHaveBeenCalled();
  });
});

describe("Team-Zuordnung: Aktion bearbeiten", () => {
  // Aktion von jemand anderem, zugeordnet zu Team A
  const existing = {
    id: "aktion-1",
    ...aktionBody,
    datum: new Date("2099-06-01"),
    teams: [{ teamId: "team-a" }],
    status: "AKTIV",
    createdById: "expert-x",
    anmeldungen: [],
  };

  async function put(body: Record<string, unknown>, aktion = existing) {
    mockPrisma.aktion.findUnique.mockResolvedValue(aktion);
    mockPrisma.aktion.update.mockResolvedValue(aktion);
    const { PUT } = await import("@/app/api/actions/[id]/route");
    const req = createJsonRequest("/api/actions/aktion-1", body, "PUT");
    return PUT(req as any, { params: Promise.resolve({ id: "aktion-1" }) });
  }

  it("ADMIN kann alle Team-Zuordnungen entfernen", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const res = await put({ ...aktionBody, teamIds: [] });

    expect(res.status).toBe(200);
    expect(mockPrisma.aktion.update.mock.calls[0][0].data.teams).toEqual({
      deleteMany: {},
      create: [],
    });
  });

  it("EXPERT kann ein fremdes Team hinzufügen", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const res = await put({ ...aktionBody, teamIds: ["team-a", "team-c"] });

    expect(res.status).toBe(200);
    expect(mockPrisma.aktion.update.mock.calls[0][0].data.teams).toEqual({
      deleteMany: {},
      create: [{ teamId: "team-a" }, { teamId: "team-c" }],
    });
  });

  it("EXPERT kann sein letztes eigenes Team NICHT von einer fremden Aktion entfernen → 400", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const res = await put({ ...aktionBody, teamIds: ["team-c"] });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(EIGENES_TEAM_BEHALTEN_FEHLER);
    expect(mockPrisma.aktion.update).not.toHaveBeenCalled();
  });

  it("EXPERT, der die Aktion angelegt hat, darf sein eigenes Team entfernen", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const res = await put({ ...aktionBody, teamIds: ["team-c"] }, { ...existing, createdById: "expert-a" });

    expect(res.status).toBe(200);
    expect(mockPrisma.aktion.update.mock.calls[0][0].data.teams.create).toEqual([{ teamId: "team-c" }]);
  });

  it("Ohne teamIds im Body bleibt die Team-Zuordnung unverändert", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const res = await put(aktionBody);

    expect(res.status).toBe(200);
    expect(mockPrisma.aktion.update.mock.calls[0][0].data).not.toHaveProperty("teams");
  });

  it("Unbekannte Team-ID → 400, keine Änderung", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const res = await put({ ...aktionBody, teamIds: ["gibt-es-nicht"] });

    expect(res.status).toBe(400);
    expect(mockPrisma.aktion.update).not.toHaveBeenCalled();
  });

  // Gemeinsame Aktion von Team A und Team B, angelegt von jemand Drittem
  const gemeinsam = { ...existing, teams: [{ teamId: "team-a" }, { teamId: "team-b" }] };

  it("EXPERT kann ein fremdes Team NICHT aus einer gemeinsamen Aktion entfernen → 403", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const res = await put({ ...aktionBody, teamIds: ["team-a"] }, gemeinsam);

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(FREMDES_TEAM_ENTFERNEN_FEHLER);
    expect(mockPrisma.aktion.update).not.toHaveBeenCalled();
  });

  it("EXPERT darf sein eigenes Team aus einer gemeinsamen Aktion entfernen, wenn ein eigenes bleibt", async () => {
    await mockAuth({ ...EXPERT_TEAM_A, user: { ...EXPERT_TEAM_A.user, teamIds: ["team-a", "team-c"] } });

    const res = await put(
      { ...aktionBody, teamIds: ["team-b", "team-c"] },
      { ...gemeinsam, teams: [{ teamId: "team-a" }, { teamId: "team-b" }, { teamId: "team-c" }] }
    );

    expect(res.status).toBe(200);
  });

  it("wer die Aktion angelegt hat, darf auch fremde Teams entfernen", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const res = await put({ ...aktionBody, teamIds: ["team-a"] }, { ...gemeinsam, createdById: "expert-a" });

    expect(res.status).toBe(200);
  });

  it("ADMIN darf fremde Teams entfernen", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const res = await put({ ...aktionBody, teamIds: ["team-a"] }, gemeinsam);

    expect(res.status).toBe(200);
  });
});

describe("Aktion ansehen: Kontaktdaten nur mit Zugriff", () => {
  const fremd = {
    id: "aktion-9",
    ...aktionBody,
    datum: new Date("2099-06-01"),
    teams: [{ team: { id: "team-b", name: "Team B" } }],
    _count: { anmeldungen: 0 },
    wahlkreis: null,
    createdById: "expert-b",
  };

  async function get(aktion: Record<string, unknown>) {
    mockPrisma.aktion.findUnique.mockResolvedValue(aktion);
    const { GET } = await import("@/app/api/actions/[id]/route");
    const req = createRequest("/api/actions/aktion-9");
    return (await GET(req as any, { params: Promise.resolve({ id: "aktion-9" }) })).json();
  }

  it("EXPERT eines anderen Teams sieht keine E-Mail/Telefon der Ansprechperson", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const data = await get(fremd);
    expect(data.titel).toBe(aktionBody.titel);
    expect(data).not.toHaveProperty("ansprechpersonEmail");
    expect(data).not.toHaveProperty("ansprechpersonTelefon");
    expect(data).not.toHaveProperty("createdById");
  });

  it("EXPERT mit Zugriff (eigenes Team) sieht die Kontaktdaten", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const data = await get({ ...fremd, teams: [{ team: { id: "team-a", name: "Team A" } }] });
    expect(data.ansprechpersonEmail).toBe(aktionBody.ansprechpersonEmail);
  });

  it("ADMIN sieht die Kontaktdaten", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);
    const data = await get(fremd);
    expect(data.ansprechpersonEmail).toBe(aktionBody.ansprechpersonEmail);
  });
});

describe("Team-Zuordnung beim Excel-Import", () => {
  it("ADMIN kann in Teams importieren, denen er nicht angehört", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const { POST } = await import("@/app/api/actions/import/route");
    const res = await POST(importRequest(["team-b", "team-c"]) as any);

    expect(res.status).toBe(200);
    expect(createdTeamIds()).toEqual(["team-b", "team-c"]);
  });

  it("ADMIN ohne Teamwahl importiert ohne Team", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const { POST } = await import("@/app/api/actions/import/route");
    const res = await POST(importRequest() as any);

    expect(res.status).toBe(200);
    expect(createdTeamIds()).toEqual([]);
  });

  it("EXPERT kann in ein fremdes Team importieren", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const { POST } = await import("@/app/api/actions/import/route");
    const res = await POST(importRequest(["team-a", "team-c"]) as any);

    expect(res.status).toBe(200);
    expect(createdTeamIds()).toEqual(["team-a", "team-c"]);
  });

  it("EXPERT ohne Teamwahl importiert in sein eigenes Team", async () => {
    await mockAuth(EXPERT_TEAM_A);

    const { POST } = await import("@/app/api/actions/import/route");
    const res = await POST(importRequest() as any);

    expect(res.status).toBe(200);
    expect(createdTeamIds()).toEqual(["team-a"]);
  });

  it("Spalte „Teams“ hat Vorrang vor der Auswahl (Namen ohne Groß-/Kleinschreibung)", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const { parseExcelFile } = await import("@/lib/excel");
    (parseExcelFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { ...excelRow, teams: ["team ost", "Team A"] },
      { ...excelRow, titel: "Ohne Teams-Spalte" },
    ]);

    const { POST } = await import("@/app/api/actions/import/route");
    const res = await POST(importRequest(["team-b"]) as any);

    expect(res.status).toBe(200);
    expect(createdTeamIds(0)).toEqual(["team-c", "team-a"]);
    expect(createdTeamIds(1)).toEqual(["team-b"]);
  });

  it("Unbekannter Team-Name in der Spalte „Teams“ macht die Zeile ungültig", async () => {
    await mockAuth(EXPERT_TEAM_A);
    const { parseExcelFile } = await import("@/lib/excel");
    (parseExcelFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { ...excelRow, teams: ["Team Nirgendwo"] },
    ]);

    const { POST } = await import("@/app/api/actions/import/route");
    const res = await POST(previewRequest() as any);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results[0].valid).toBe(false);
    expect(data.results[0].errors).toContain("Unbekanntes Team: Team Nirgendwo");
  });

  it("Unbekannte Team-ID in der Auswahl → 400, nichts importiert", async () => {
    await mockAuth(ADMIN_IN_TEAM_A);

    const { POST } = await import("@/app/api/actions/import/route");
    const res = await POST(importRequest(["gibt-es-nicht"]) as any);

    expect(res.status).toBe(400);
    expect(mockPrisma.aktion.create).not.toHaveBeenCalled();
  });
});
