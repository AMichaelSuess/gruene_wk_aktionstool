/**
 * Datenschutzbeauftragte*r in der Datenschutzerklärung
 *
 * Fehlende DSB-Angaben fallen auf die Berlin-Mitte-Defaults zurück. Ist ein
 * Kontaktformular (DSB_CONTACT_URL) angegeben, dürfen E-Mail und Telefon
 * fehlen – dann aber ohne Fallback, sonst stünden fremde Kontaktdaten in der
 * Datenschutzerklärung.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

async function loadConfig() {
  vi.resetModules();
  const { districtConfig } = await import("@/lib/district-config");
  return districtConfig;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DSB-Kontaktdaten", () => {
  it("ohne Angaben → Berlin-Mitte-Defaults (bisheriges Verhalten)", async () => {
    vi.stubEnv("DSB_EMAIL", "");
    vi.stubEnv("DSB_PHONE", "");
    vi.stubEnv("DSB_CONTACT_URL", "");

    const config = await loadConfig();

    expect(config.dsbEmail).toBe("datenschutz@gruene-berlin.de");
    expect(config.dsbPhone).toBe("02224/988290");
    expect(config.dsbContactUrl).toBe("");
  });

  it("mit Kontaktformular → E-Mail und Telefon leer statt Berlin-Fallback", async () => {
    vi.stubEnv("DSB_EMAIL", "");
    vi.stubEnv("DSB_PHONE", "");
    vi.stubEnv("DSB_CONTACT_URL", "https://example.org/datenschutz/kontakt/");

    const config = await loadConfig();

    expect(config.dsbEmail).toBe("");
    expect(config.dsbPhone).toBe("");
    expect(config.dsbContactUrl).toBe("https://example.org/datenschutz/kontakt/");
  });

  it("mit Kontaktformular und E-Mail → beides wird übernommen", async () => {
    vi.stubEnv("DSB_EMAIL", "dsb@example.org");
    vi.stubEnv("DSB_PHONE", "");
    vi.stubEnv("DSB_CONTACT_URL", "https://example.org/datenschutz/kontakt/");

    const config = await loadConfig();

    expect(config.dsbEmail).toBe("dsb@example.org");
    expect(config.dsbPhone).toBe("");
  });
});
