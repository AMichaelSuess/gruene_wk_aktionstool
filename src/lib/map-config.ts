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

/**
 * Kachelserver der Karte. Default: Server von OpenStreetMap Deutschland (FOSSGIS e.V.,
 * Server in der EU). Dessen Nutzungsbedingungen verlangen Lizenzangaben und einen Link
 * zum Melden von Kartenfehlern, siehe
 * https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/
 *
 * Wer NEXT_PUBLIC_MAP_TILE_URL ändert, setzt auch die passende Quellenangabe und
 * MAP_TILE_PROVIDER / MAP_TILE_PROVIDER_PRIVACY_URL für die Datenschutzerklärung.
 */
export const DEFAULT_MAP_TILE_URL = "https://tile.openstreetmap.de/{z}/{x}/{y}.png";
export const DEFAULT_MAP_ATTRIBUTION =
  'Daten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende ' +
  '(<a href="https://opendatacommons.org/licenses/odbl/index.html">ODbL</a>), ' +
  '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
  '<a href="https://openstreetmap.org/fixthemap">mitmachen/Fehler melden</a>';

/**
 * Quelle für die CSP (img-src/connect-src) aus der Kachel-URL: Schema und Host,
 * ein Subdomain-Platzhalter {s} wird zu "*". Nur HTTPS ist erlaubt.
 */
export function tileSourceForCsp(tileUrl: string): string {
  const match = /^https:\/\/([^/?#]+)\//.exec(tileUrl);
  if (!match) {
    throw new Error(`NEXT_PUBLIC_MAP_TILE_URL muss eine https-URL sein: ${tileUrl}`);
  }
  const host = match[1].replace("{s}", "*");
  if (!/^(\*\.)?[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    throw new Error(`NEXT_PUBLIC_MAP_TILE_URL hat keinen gültigen Host: ${tileUrl}`);
  }
  return `https://${host}`;
}

// NEXT_PUBLIC_*-Variablen müssen wörtlich referenziert werden, damit Next.js sie einbettet
export const MAP_CENTER = parseMapCenter(process.env.NEXT_PUBLIC_MAP_CENTER);
export const MAP_ZOOM = parseMapZoom(process.env.NEXT_PUBLIC_MAP_ZOOM);
export const MAP_TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || DEFAULT_MAP_TILE_URL;
// Wird von Leaflet als HTML eingefügt. Kommt nur aus der Build-Konfiguration, nie aus Nutzerdaten.
export const MAP_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || DEFAULT_MAP_ATTRIBUTION;
