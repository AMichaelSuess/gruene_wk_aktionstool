/**
 * Sicherheitstests: Login gegen Passwort-Raten und Konto-Erkennung
 *
 * - Nach 5 Fehlversuchen pro E-Mail (bzw. 20 pro IP) innerhalb von 15 Minuten
 *   wird nicht mehr geprüft – auch das richtige Passwort hilft dann nicht.
 * - Jeder fehlgeschlagene Login kostet einen bcrypt-Vergleich, auch für
 *   unbekannte Konten, damit die Antwortzeit nichts verrät.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockPrisma = { user: { findUnique: vi.fn() } };
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const compare = vi.fn();
vi.mock("bcryptjs", () => ({ default: { compare: (...a: unknown[]) => compare(...a) } }));

const USER = {
  id: "u1",
  email: "expert@example.org",
  name: "Expert",
  role: "EXPERT",
  active: true,
  password: "$2b$12$echterhash",
  teams: [{ teamId: "t1" }],
};

function req(ip: string) {
  return new Request("http://localhost:3000/api/auth/callback/credentials", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(USER);
  compare.mockImplementation(async (pw: string, hash: string) => pw === "richtig" && hash === USER.password);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Login: Begrenzung von Fehlversuchen", () => {
  it("richtiges Passwort → Nutzer mit Rolle und Teams", async () => {
    const { authorizeCredentials } = await import("@/lib/credentials");
    const user = await authorizeCredentials({ email: USER.email, password: "richtig" }, req("10.0.0.1"));
    expect(user).toEqual({ id: "u1", email: USER.email, name: "Expert", role: "EXPERT", teamIds: ["t1"] });
  });

  it("nach 5 Fehlversuchen für eine E-Mail wird nicht mehr geprüft, auch nicht das richtige Passwort", async () => {
    const { authorizeCredentials } = await import("@/lib/credentials");

    for (let i = 0; i < 5; i++) {
      // wechselnde IPs: die Sperre hängt an der E-Mail
      expect(await authorizeCredentials({ email: USER.email, password: "falsch" }, req(`10.0.1.${i}`))).toBeNull();
    }
    compare.mockClear();

    const result = await authorizeCredentials({ email: "Expert@Example.org ", password: "richtig" }, req("10.0.2.1"));
    expect(result).toBeNull();
    expect(compare).not.toHaveBeenCalled();
  });

  it("Sperre läuft nach 15 Minuten ab", async () => {
    vi.useFakeTimers();
    const { authorizeCredentials } = await import("@/lib/credentials");
    for (let i = 0; i < 5; i++) {
      await authorizeCredentials({ email: USER.email, password: "falsch" }, req("10.0.3.1"));
    }
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(await authorizeCredentials({ email: USER.email, password: "richtig" }, req("10.0.3.1"))).not.toBeNull();
  });

  it("erfolgreicher Login setzt den Zähler der E-Mail zurück", async () => {
    const { authorizeCredentials } = await import("@/lib/credentials");
    for (let i = 0; i < 4; i++) {
      await authorizeCredentials({ email: USER.email, password: "falsch" }, req(`10.0.4.${i}`));
    }
    expect(await authorizeCredentials({ email: USER.email, password: "richtig" }, req("10.0.4.9"))).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      await authorizeCredentials({ email: USER.email, password: "falsch" }, req(`10.0.5.${i}`));
    }
    expect(await authorizeCredentials({ email: USER.email, password: "richtig" }, req("10.0.5.9"))).not.toBeNull();
  });

  it("nach 20 Fehlversuchen von einer IP werden auch andere Konten von dort gesperrt", async () => {
    const { authorizeCredentials } = await import("@/lib/credentials");
    for (let i = 0; i < 20; i++) {
      await authorizeCredentials({ email: `person${i}@example.org`, password: "falsch" }, req("10.0.6.1"));
    }
    compare.mockClear();
    expect(await authorizeCredentials({ email: USER.email, password: "richtig" }, req("10.0.6.1"))).toBeNull();
    expect(compare).not.toHaveBeenCalled();
  });
});

describe("Login: Antwortzeit verrät keine Konten", () => {
  it("Groß-/Kleinschreibung und Leerzeichen der E-Mail spielen keine Rolle", async () => {
    const { authorizeCredentials } = await import("@/lib/credentials");
    const user = await authorizeCredentials({ email: " Expert@Example.ORG ", password: "richtig" }, req("10.0.5.1"));
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "expert@example.org" } })
    );
    expect(user?.id).toBe("u1");
  });

  it("unbekannte E-Mail → trotzdem genau ein bcrypt-Vergleich", async () => {
    const { authorizeCredentials } = await import("@/lib/credentials");
    mockPrisma.user.findUnique.mockResolvedValue(null);

    expect(await authorizeCredentials({ email: "niemand@example.org", password: "x" }, req("10.0.7.1"))).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare.mock.calls[0][1]).toMatch(/^\$2[aby]\$12\$/);
  });

  it("deaktiviertes Konto → bcrypt gegen Dummy-Hash, kein Login auch mit richtigem Passwort", async () => {
    const { authorizeCredentials } = await import("@/lib/credentials");
    mockPrisma.user.findUnique.mockResolvedValue({ ...USER, active: false });

    expect(await authorizeCredentials({ email: USER.email, password: "richtig" }, req("10.0.8.1"))).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare.mock.calls[0][1]).not.toBe(USER.password);
  });
});
