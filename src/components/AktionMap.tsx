"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { MAP_CENTER, MAP_ZOOM } from "@/lib/map-config";
import { theme } from "@/lib/theme";
import { WAHLKREIS_LABEL_SHORT } from "@/lib/wahlkreis-label";

// Fix default marker icons
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
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

export default function AktionMap({ aktionen, onSelect }: AktionMapProps) {
  const geoAktionen = aktionen.filter((a) => a.latitude && a.longitude);

  return (
    <div className="h-[500px] md:h-[600px] rounded-xl overflow-hidden border border-gray-200">
      <MapContainer
        center={MAP_CENTER}
        zoom={MAP_ZOOM}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

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
                  {WAHLKREIS_LABEL_SHORT} {aktion.wahlkreis.nummer} · 👤 {aktion.ansprechpersonName}
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
