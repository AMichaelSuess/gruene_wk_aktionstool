import { districtConfig } from "@/lib/district-config";

interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Nominatim's usage policy allows at most one request per second. All calls
// in this process are queued so that imports cannot exceed it (and get the
// server's IP banned).
const MIN_INTERVAL_MS = 1100;
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await delay(wait);
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function geocodeAddress(
  address: string
): Promise<GeocodingResult | null> {
  return throttled(() => fetchGeocode(address));
}

async function fetchGeocode(address: string): Promise<GeocodingResult | null> {
  try {
    const params = new URLSearchParams({
      q: `${address}, ${districtConfig.geocodingCity}, Germany`,
      format: "json",
      limit: "1",
      addressdetails: "1",
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          "User-Agent": `${process.env.ORG_SHORT_NAME?.replace(/[^a-zA-Z0-9]/g, "") || "GrueneAktionen"}-Wahlkampf-App/1.0`,
        },
      }
    );

    if (!response.ok) return null;

    const results = await response.json();
    if (results.length === 0) return null;

    return {
      latitude: parseFloat(results[0].lat),
      longitude: parseFloat(results[0].lon),
      displayName: results[0].display_name,
    };
  } catch {
    return null;
  }
}

export async function geocodeAddresses(
  addresses: string[]
): Promise<(GeocodingResult | null)[]> {
  const results: (GeocodingResult | null)[] = [];

  for (const address of addresses) {
    // geocodeAddress already keeps to 1 request per second
    results.push(await geocodeAddress(address));
  }

  return results;
}
