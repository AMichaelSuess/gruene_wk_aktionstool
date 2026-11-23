/**
 * Sicherheitstests: Protokoll für Angriffsspuren
 *
 * Fehlgeschlagene Logins, Sperren, verweigerte Zugriffe und Serverfehler
 * hinterlassen eine Protokollzeile – ohne E-Mail-Adressen im Klartext und
 * ohne die Argumente fehlgeschlagener Datenbankaufrufe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockAuth, EXPERT_TEAM_A, EXPERT_TEAM_B, createJsonRequest, createRequest } from "./helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockPrisma = {
  user: { findUnique: vi.fn() },
  aktion: { findUnique: vi.fn(), update: vi.fn() },
  team: { count: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/geocoding", () => ({ geocodeAddress: vi.fn(async () => null) }));

const compare = vi.fn();
vi.mock("bcryptjs", () => ({ default: { compare: (...a: unknown[]) => compare(...a) } }));

let infoSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function lines(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return spy.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((l: string) => l.startsWith("{"))
    .map((l: string) => JSON.parse(l));
}

function loginRequest(ip: string) {
  return new Request("http://localhost:3000/api/auth/callback/credentials", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret-mit-mindestens-32-zeichen!!";
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  mockPrisma.user.findUnique.mockResolvedValue(null);
  compare.mockResolvedValue(false);
});

afterEach(() => {
  infoSpy.mockRestore();
  errorSpy.mockRestore();
});

describe("Login-Protokoll", () => {
  it("fehlgeschlagener Login → Zeile mit IP und Pseudonym, ohne E-Mail-Adresse", async () => {
    const { authorizeCredentials } = await import("@/lib/credentials");
    await authorizeCredentials({ email: "Opfer@Example.org", password: "falsch" }, loginRequest("10.1.0.1"));

    const [line] = lines(infoSpy).filter((l) => l.event === "LOGIN_FEHLGESCHLAGEN");
    expect(line).toMatchObject({ audit: true, actorId: null, ip: "10.1.0.1" });
    expect(line.emailHash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(line).toLowerCase()).not.toContain("opfer");
  });

  it("gleiche Adresse in anderer Schreibweise → gleiches Pseudonym", async () => {
    const { emailPseudonym } = await import("@/lib/audit");
    expect(emailPseudonym(" Opfer@Example.org ")).toBe(emailPseudonym("opfer@example.org"));
    expect(emailPseudonym("a@example.org")).not.toBe(emailPseudonym("b@example.org"));
  });

  it("der 5. Fehlversuch für eine Adresse von einer IP meldet die Sperre genau einmal", async () => {
    const { authorizeCredentials } = await import("@/lib/credentials");
    for (let i = 0; i < 7; i++) {
      await authorizeCredentials({ email: "opfer@example.org", password: "falsch" }, loginRequest("10.2.0.1"));
    }

    const all = lines(infoSpy);
    expect(all.filter((l) => l.event === "LOGIN_FEHLGESCHLAGEN")).toHaveLength(5);
    const sperren = all.filter((l) => l.event === "LOGIN_GESPERRT");
    expect(sperren).toHaveLength(1);
    expect(sperren[0].gesperrt).toEqual(["email+ip"]);
  });
});

describe("Verweigerter Zugriff", () => {
  it("Expert eines fremden Teams liest Anmeldungen → 403 und Protokollzeile", async () => {
    await mockAuth(EXPERT_TEAM_B);
    mockPrisma.aktion.findUnique.mockResolvedValue({ createdById: "someone", teams: [{ teamId: "team-a" }] });
    const { GET } = await import("@/app/api/actions/[id]/signups/route");

    const res = await GET(createRequest("/api/actions/akt-1/signups") as never, {
      params: Promise.resolve({ id: "akt-1" }),
    });

    expect(res.status).toBe(403);
    const [line] = lines(infoSpy).filter((l) => l.event === "ZUGRIFF_VERWEIGERT");
    expect(line).toMatchObject({ actorId: EXPERT_TEAM_B.user.id, aktionId: "akt-1" });
  });
});

describe("Serverfehler", () => {
  it("protokolliert Typ, Code und erste Zeile – nicht die Argumente des Aufrufs", async () => {
    const { logServerError } = await import("@/lib/audit");
    const err = Object.assign(
      new Error("\nInvalid `prisma.anmeldung.create()` invocation:\n\n{ data: { email: \"geheim@example.org\" } }"),
      { name: "PrismaClientKnownRequestError", code: "P2002" }
    );
    logServerError("POST /api/signups", err);

    const [line] = lines(errorSpy);
    expect(line).toMatchObject({
      serverError: true,
      route: "POST /api/signups",
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      message: "Invalid `prisma.anmeldung.create()` invocation:",
    });
    expect(JSON.stringify(line)).not.toContain("geheim@example.org");
  });
});

describe("Adresse der Ansprechperson", () => {
  const BESTEHEND = {
    id: "aktion-1",
    titel: "Infostand",
    datum: new Date("2099-06-01"),
    startzeit: "10:00",
    endzeit: "12:00",
    adresse: "Alexanderplatz 1",
    wahlkreisId: "wk-1",
    kategorie: "INFOSTAND",
    ansprechpersonName: "Lara",
    ansprechpersonEmail: "lara@example.org",
    ansprechpersonTelefon: "030123456",
    maxTeilnehmer: null,
    status: "AKTIV",
    createdById: EXPERT_TEAM_A.user.id,
    teams: [{ teamId: "team-a" }],
    anmeldungen: [],
  };

  function body(ansprechpersonEmail: string) {
    return {
      titel: BESTEHEND.titel,
      datum: "2099-06-01",
      startzeit: "10:00",
      endzeit: "12:00",
      adresse: BESTEHEND.adresse,
      wahlkreisId: "wk-1",
      kategorie: "INFOSTAND",
      ansprechpersonName: "Lara",
      ansprechpersonEmail,
      ansprechpersonTelefon: "030123456",
    };
  }

  async function put(ansprechpersonEmail: string) {
    await mockAuth(EXPERT_TEAM_A);
    mockPrisma.aktion.findUnique.mockResolvedValue(BESTEHEND);
    mockPrisma.aktion.update.mockResolvedValue({ ...BESTEHEND, ansprechpersonEmail });
    const { PUT } = await import("@/app/api/actions/[id]/route");
    return PUT(createJsonRequest("/api/actions/aktion-1", body(ansprechpersonEmail), "PUT") as any, {
      params: Promise.resolve({ id: "aktion-1" }),
    });
  }

  it("Aenderung wird protokolliert, ohne die Adresse", async () => {
    const res = await put("neu@example.org");
    expect(res.status).toBe(200);
    const zeilen = lines(infoSpy).filter((l) => l.event === "ANSPRECHPERSON_GEAENDERT");
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ actorId: EXPERT_TEAM_A.user.id, aktionId: "aktion-1" });
    expect(JSON.stringify(zeilen[0])).not.toContain("example.org");
  });

  it("gleiche Adresse → keine Protokollzeile", async () => {
    const res = await put("lara@example.org");
    expect(res.status).toBe(200);
    expect(lines(infoSpy).filter((l) => l.event === "ANSPRECHPERSON_GEAENDERT")).toHaveLength(0);
  });
});

