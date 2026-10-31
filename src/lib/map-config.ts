/**
 * Startansicht der Karte, solange keine Aktionen mit Koordinaten vorhanden sind.
 * Default: Berlin-Mitte. Format NEXT_PUBLIC_MAP_CENTER: "lat,lng"
 */

export const DEFAULT_MAP_CENTER: [number, number] = [52.5235, 13.4115];
export const DEFAULT_MAP_ZOOM = 13;

export function parseMapCenter(value: string | undefined): [number, number] {
  const [lat, lng] = (value ?? "").split(",").map((v) => parseFloat(v.trim()));
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  return DEFAULT_MAP_CENTER;
}

export function parseMapZoom(value: string | undefined): number {
  return parseInt(value ?? "", 10) || DEFAULT_MAP_ZOOM;
}

// NEXT_PUBLIC_*-Variablen müssen wörtlich referenziert werden, damit Next.js sie einbettet
export const MAP_CENTER = parseMapCenter(process.env.NEXT_PUBLIC_MAP_CENTER);
export const MAP_ZOOM = parseMapZoom(process.env.NEXT_PUBLIC_MAP_ZOOM);
