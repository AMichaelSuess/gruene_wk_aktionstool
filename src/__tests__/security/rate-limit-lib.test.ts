/**
 * Sicherheitstests: gemeinsamer Rate-Limiter (src/lib/rate-limit.ts)
 *
 * - Der Schlüssel ist die vom Proxy (Traefik) angehängte, letzte Adresse in
 *   X-Forwarded-For. Vom Client gefälschte Einträge davor ändern ihn nicht.
 * - Die Map wächst nicht unbegrenzt.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

function req(headers: Record<string, string>) {
  return new Request("http://localhost:3000/", { headers });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("clientIp", () => {
  it("nimmt den letzten Eintrag aus X-Forwarded-For (vom Proxy gesetzt)", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(req({ "x-forwarded-for": "2.2.2.2,9.9.9.9 " }))).toBe("9.9.9.9");
  });

  it("einzelne Adresse und Fallbacks", () => {
    expect(clientIp(req({ "x-forwarded-for": "10.0.0.1" }))).toBe("10.0.0.1");
    expect(clientIp(req({ "x-real-ip": "10.0.0.2" }))).toBe("10.0.0.2");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("createRateLimiter", () => {
  it("gefälschte X-Forwarded-For-Präfixe teilen sich einen Zähler", () => {
    const isLimited = createRateLimiter(30, 60_000);
    for (let i = 0; i < 30; i++) {
      expect(isLimited(clientIp(req({ "x-forwarded-for": `1.1.1.${i}, 9.9.9.9` })))).toBe(false);
    }
    expect(isLimited(clientIp(req({ "x-forwarded-for": "2.2.2.2, 9.9.9.9" })))).toBe(true);
  });

  it("Fenster läuft ab — danach wieder erlaubt", () => {
    vi.useFakeTimers();
    const isLimited = createRateLimiter(1, 1_000);
    expect(isLimited("a")).toBe(false);
    expect(isLimited("a")).toBe(true);
    vi.advanceTimersByTime(1_001);
    expect(isLimited("a")).toBe(false);
  });

  it("begrenzt die Anzahl der Schlüssel und räumt abgelaufene auf", () => {
    vi.useFakeTimers();
    const isLimited = createRateLimiter(5, 1_000, 100);

    for (let i = 0; i < 100; i++) expect(isLimited(`k${i}`)).toBe(false);
    // Map voll, nichts abgelaufen → neue Schlüssel werden abgewiesen
    expect(isLimited("neu")).toBe(true);
    // bekannte Schlüssel funktionieren weiter
    expect(isLimited("k1")).toBe(false);

    // nach Ablauf werden alte Einträge entfernt und neue wieder angenommen
    vi.advanceTimersByTime(1_001);
    expect(isLimited("neu")).toBe(false);
  });

  it("20 000 verschiedene Schlüssel sprengen den Speicher nicht", () => {
    const isLimited = createRateLimiter(5, 60_000, 10_000);
    let blocked = 0;
    for (let i = 0; i < 20_000; i++) if (isLimited(`ip-${i}`)) blocked++;
    expect(blocked).toBe(10_000);
  });
});
