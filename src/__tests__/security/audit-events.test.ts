/**
 * Sicherheitstests: Protokoll für Angriffsspuren
 *
 * Fehlgeschlagene Logins, Sperren, verweigerte Zugriffe und Serverfehler
 * hinterlassen eine Protokollzeile – ohne E-Mail-Adressen im Klartext und
 * ohne die Argumente fehlgeschlagener Datenbankaufrufe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockAuth, EXPERT_TEAM_B, createRequest } from "./helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockPrisma = {
  user: { findUnique: vi.fn() },
  aktion: { findUnique: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

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
    const { GET } = await import("@/app/api/aktionen/[id]/anmeldungen/route");

    const res = await GET(createRequest("/api/aktionen/akt-1/anmeldungen") as never, {
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
    logServerError("POST /api/anmeldungen", err);

    const [line] = lines(errorSpy);
    expect(line).toMatchObject({
      serverError: true,
      route: "POST /api/anmeldungen",
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      message: "Invalid `prisma.anmeldung.create()` invocation:",
    });
    expect(JSON.stringify(line)).not.toContain("geheim@example.org");
  });
});
