"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { MAP_ATTRIBUTION, MAP_CENTER, MAP_TILE_URL, MAP_ZOOM } from "@/lib/map-config";
import { theme } from "@/lib/theme";
import { WAHLKREIS_LABEL_SHORT, WAHLKREIS_NUMMERN_ANZEIGEN } from "@/lib/wahlkreis-label";

// Fix default marker icons
const DefaultIcon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Marker in den Theme-Farben, falls das Theme welche vorgibt
function themedIcon(colors: NonNullable<typeof theme.mapMarker>) {
  return L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40" aria-hidden="true">
      <path d="M14 1C6.8 1 1 6.8 1 14c0 9.6 13 25 13 25s13-15.4 13-25C27 6.8 21.2 1 14 1z" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="${colors.dot}"/>
    </svg>`,
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -36],
  });
}

L.Marker.prototype.options.icon = theme.mapMarker ? themedIcon(theme.mapMarker) : DefaultIcon;

interface AktionMapProps {
  aktionen: {
    id: string;
    titel: string;
    datum: string;
    startzeit: string;
    endzeit: string;
    adresse: string;
    latitude: number | null;
    longitude: number | null;
    wahlkreis: { nummer: number; name: string };
    kategorie: string;
    ansprechpersonName: string;
    _count: { anmeldungen: number };
    maxTeilnehmer: number | null;
  }[];
  onSelect: (id: string) => void;
}

function FitBounds({ aktionen }: { aktionen: AktionMapProps["aktionen"] }) {
  const map = useMap();

  useEffect(() => {
    const validAktionen = aktionen.filter((a) => a.latitude && a.longitude);
    if (validAktionen.length > 0) {
      const bounds = L.latLngBounds(
        validAktionen.map((a) => [a.latitude!, a.longitude!] as [number, number])
      );
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }, [aktionen, map]);

  return null;
}

// Touch devices: one finger scrolls the page, two fingers move and zoom the map.
// With dragging disabled, Leaflet's pinch handler still pans along with the fingers.
const isTouchDevice = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;

export default function AktionMap({ aktionen, onSelect }: AktionMapProps) {
  const geoAktionen = aktionen.filter((a) => a.latitude && a.longitude);
  const [touch] = useState(isTouchDevice);
  const [showHint, setShowHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  function handleTouchMove(e: React.TouchEvent) {
    if (!touch) return;
    if (hintTimer.current) clearTimeout(hintTimer.current);
    if (e.touches.length === 1) {
      setShowHint(true);
      hintTimer.current = setTimeout(() => setShowHint(false), 1500);
    } else {
      setShowHint(false);
    }
  }

  return (
    <div
      className="relative h-[500px] md:h-[600px] rounded-xl overflow-hidden border border-gray-200"
      onTouchMove={handleTouchMove}
      onTouchEnd={(e) => {
        if (e.touches.length === 0 && hintTimer.current) {
          clearTimeout(hintTimer.current);
          hintTimer.current = setTimeout(() => setShowHint(false), 800);
        }
      }}
    >
      {touch && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center bg-ink/60 p-6 text-center text-lg font-bold text-canvas transition-opacity duration-300 ${
            showHint ? "opacity-100" : "opacity-0"
          }`}
        >
          Zum Verschieben der Karte zwei Finger benutzen
        </div>
      )}
      <MapContainer
        center={MAP_CENTER}
        zoom={MAP_ZOOM}
        dragging={!touch}
        className="h-full w-full"
      >
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />

        <FitBounds aktionen={geoAktionen} />

        {geoAktionen.map((aktion) => (
          <Marker
            key={aktion.id}
            position={[aktion.latitude!, aktion.longitude!]}
          >
            <Popup>
              <div className="min-w-[200px]">
                <h3 className="font-bold text-primary mb-1">{aktion.titel}</h3>
                <p className="text-sm text-gray-600">
                  📅 {format(new Date(aktion.datum), "d. MMMM yyyy", { locale: de })}
                </p>
                <p className="text-sm text-gray-600">
                  🕐 {aktion.startzeit} – {aktion.endzeit} Uhr
                </p>
                <p className="text-sm text-gray-600">📍 {aktion.adresse}</p>
                <p className="text-sm text-gray-600">
                  {WAHLKREIS_LABEL_SHORT}{" "}
                  {WAHLKREIS_NUMMERN_ANZEIGEN ? aktion.wahlkreis.nummer : aktion.wahlkreis.name} · 👤 {aktion.ansprechpersonName}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {aktion._count.anmeldungen} Anmeldung{aktion._count.anmeldungen !== 1 ? "en" : ""}
                  {aktion.maxTeilnehmer ? ` / ${aktion.maxTeilnehmer}` : ""}
                </p>
                <button
                  onClick={() => onSelect(aktion.id)}
                  className="mt-2 text-sm bg-primary text-white px-3 py-1 rounded-button font-bold hover:bg-primary-hover"
                >
                  Anmelden
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
