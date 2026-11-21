/**
 * Sicherheitstests: Schreibende API-Anfragen nur von der eigenen Seite.
 *
 * SameSite=Lax schuetzt nicht gegen andere Subdomains derselben Domain. Eine
 * fremde Seite koennte sonst mit dem Cookie einer eingeloggten Admin-Person
 * z. B. per text/plain-POST ein Admin-Konto anlegen.
 */
import { describe, it, expect } from "vitest";
import { appOrigin, isCrossOriginWrite } from "@/lib/same-origin";

const APP = "https://aktionen.gruene-mitte.de";

describe("isCrossOriginWrite", () => {
  it("blockt POST von einer anderen Subdomain", () => {
    expect(isCrossOriginWrite("POST", "https://www.gruene-mitte.de", APP)).toBe(true);
  });

  it("blockt PUT, PATCH und DELETE von fremder Herkunft", () => {
    for (const m of ["PUT", "PATCH", "DELETE"]) {
      expect(isCrossOriginWrite(m, "https://evil.example", APP)).toBe(true);
    }
  });

  it("blockt Origin 'null' (z. B. aus einer Sandbox oder data:-URL)", () => {
    expect(isCrossOriginWrite("POST", "null", APP)).toBe(true);
  });

  it("blockt dieselbe Domain mit anderem Schema oder Port", () => {
    expect(isCrossOriginWrite("POST", "http://aktionen.gruene-mitte.de", APP)).toBe(true);
    expect(isCrossOriginWrite("POST", "https://aktionen.gruene-mitte.de:8443", APP)).toBe(true);
  });

  it("laesst Anfragen der eigenen Seite durch", () => {
    expect(isCrossOriginWrite("POST", APP, APP)).toBe(false);
  });

  it("laesst Anfragen ohne Origin durch (curl, Cron)", () => {
    expect(isCrossOriginWrite("POST", null, APP)).toBe(false);
  });

  it("laesst lesende Anfragen durch", () => {
    expect(isCrossOriginWrite("GET", "https://evil.example", APP)).toBe(false);
    expect(isCrossOriginWrite("HEAD", "https://evil.example", APP)).toBe(false);
  });
});

describe("appOrigin", () => {
  it("nimmt den Origin aus NEXTAUTH_URL, ohne Pfad", () => {
    expect(appOrigin("http://localhost:3000", "https://aktionen.gruene-mitte.de/")).toBe(APP);
  });

  it("faellt ohne NEXTAUTH_URL auf den Origin der Anfrage zurueck", () => {
    expect(appOrigin("http://localhost:3200", "")).toBe("http://localhost:3200");
  });
});

describe("proxy.ts", () => {
  it("prueft alle API-Routen", async () => {
    const { readFileSync } = await import("fs");
    const source = readFileSync("src/proxy.ts", "utf8");
    expect(source).toMatch(/"\/api\/:path\*"/);
    expect(source).toContain("isCrossOriginWrite");
  });
});
