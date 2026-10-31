/**
 * Konfigurationstests: Kartenansicht und Geocoding-Stadt
 *
 * Prüft, dass Kartenmitte/Zoom und die beim Geocoding angehängte Stadt
 * über Umgebungsvariablen konfigurierbar sind und sinnvolle Defaults haben.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseMapCenter,
  parseMapZoom,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
} from "@/lib/map-config";

describe("parseMapCenter", () => {
  it("parst 'lat,lng'", () => {
    expect(parseMapCenter("51.3397,12.3731")).toEqual([51.3397, 12.3731]);
  });

  it("toleriert Leerzeichen", () => {
    expect(parseMapCenter(" 51.3397 , 12.3731 ")).toEqual([51.3397, 12.3731]);
  });

  it("fällt bei fehlendem Wert auf Berlin-Mitte zurück", () => {
    expect(parseMapCenter(undefined)).toEqual(DEFAULT_MAP_CENTER);
    expect(parseMapCenter("")).toEqual(DEFAULT_MAP_CENTER);
  });

  it("fällt bei ungültigem Wert auf Berlin-Mitte zurück", () => {
    expect(parseMapCenter("Leipzig")).toEqual(DEFAULT_MAP_CENTER);
    expect(parseMapCenter("51.3397")).toEqual(DEFAULT_MAP_CENTER);
  });
});

describe("parseMapZoom", () => {
  it("parst eine Zahl", () => {
    expect(parseMapZoom("12")).toBe(12);
  });

  it("fällt bei fehlendem oder ungültigem Wert auf den Default zurück", () => {
    expect(parseMapZoom(undefined)).toBe(DEFAULT_MAP_ZOOM);
    expect(parseMapZoom("abc")).toBe(DEFAULT_MAP_ZOOM);
  });
});

describe("geocodeAddress hängt die konfigurierte Stadt an", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GEOCODING_CITY", "");
    vi.stubEnv("ADDRESS_CITY", "");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "51.34", lon: "12.37", display_name: "Test" }],
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function geocodeQuery(): Promise<string | null> {
    const { geocodeAddress } = await import("@/lib/geocoding");
    await geocodeAddress("Hohe Straße 58");
    const url = new URL(fetchMock.mock.calls[0][0]);
    return url.searchParams.get("q");
  }

  it("verwendet GEOCODING_CITY, falls gesetzt", async () => {
    vi.stubEnv("GEOCODING_CITY", "Leipzig");
    vi.stubEnv("ADDRESS_CITY", "Berlin");
    expect(await geocodeQuery()).toBe("Hohe Straße 58, Leipzig, Germany");
  });

  it("fällt auf ADDRESS_CITY zurück", async () => {
    vi.stubEnv("ADDRESS_CITY", "Leipzig");
    expect(await geocodeQuery()).toBe("Hohe Straße 58, Leipzig, Germany");
  });

  it("fällt ohne Konfiguration auf Berlin zurück", async () => {
    expect(await geocodeQuery()).toBe("Hohe Straße 58, Berlin, Germany");
  });
});
