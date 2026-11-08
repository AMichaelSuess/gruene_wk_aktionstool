"use client";

import { format } from "date-fns";
import { de } from "date-fns/locale";
import Badge from "@/components/ui/Badge";
import { kategorieLabel } from "@/lib/kategorien";
import { WAHLKREIS_LABEL_SHORT } from "@/lib/wahlkreis-label";

interface AktionCardProps {
  aktion: {
    id: string;
    titel: string;
    datum: string;
    startzeit: string;
    endzeit: string;
    adresse: string;
    wahlkreis: { nummer: number; name: string };
    kategorie: string;
    ansprechpersonName: string;
    maxTeilnehmer: number | null;
    status: string;
    _count: { anmeldungen: number };
  };
  selected: boolean;
  onToggle: (id: string) => void;
}

export default function AktionCard({ aktion, selected, onToggle }: AktionCardProps) {
  const datum = new Date(aktion.datum);
  const isFull =
    aktion.maxTeilnehmer !== null &&
    aktion._count.anmeldungen >= aktion.maxTeilnehmer;

  return (
    <div
      className={`bg-white rounded-card border-ui transition-all cursor-pointer ${
        selected
          ? "border-primary shadow-ui-selected"
          : "border-line shadow-ui hover:shadow-ui-sm hover:press-sm"
      } ${isFull ? "opacity-60 cursor-not-allowed" : ""}`}
      onClick={() => !isFull && onToggle(aktion.id)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-headline font-bold text-primary text-xl leading-tight case-ui tracking-ui">
            {aktion.titel}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            {aktion.status === "GEAENDERT" && (
              <Badge variant="warning">Geändert</Badge>
            )}
            {aktion.status === "ABGESAGT" && (
              <Badge variant="danger">Abgesagt</Badge>
            )}
            {/* Square brutalist checkbox */}
            <div
              className={`w-6 h-6 border-ui flex items-center justify-center shrink-0 transition-colors ${
                selected
                  ? "bg-primary border-primary"
                  : "bg-white border-line-strong"
              } ${isFull ? "opacity-50" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!isFull) onToggle(aktion.id);
              }}
              role="checkbox"
              aria-checked={selected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  if (!isFull) onToggle(aktion.id);
                }
              }}
            >
              {selected && (
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="square" strokeLinejoin="miter" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1 text-base text-ink">
          <p>
            📅{" "}
            <span className="font-bold">
              {format(datum, "EEEE, d. MMMM", { locale: de })}
            </span>{" "}
            · {aktion.startzeit} – {aktion.endzeit} Uhr
          </p>
          <p>📍 {aktion.adresse}</p>
          <div className="flex items-center justify-between mt-3 mb-1">
            <span className="text-base font-medium">
              👋 {aktion.ansprechpersonName}
            </span>
          </div>
          <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold case-ui tracking-ui rounded-badge bg-ink text-white px-2 py-0.5 inline-block">
              {WAHLKREIS_LABEL_SHORT} {aktion.wahlkreis.nummer}: {aktion.wahlkreis.name}
            </span>
            {aktion.kategorie && (
              <Badge variant="info">{kategorieLabel(aktion.kategorie)}</Badge>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm text-gray-600 font-medium">
              {aktion._count.anmeldungen} Anmeldung{aktion._count.anmeldungen !== 1 ? "en" : ""}
              {aktion.maxTeilnehmer ? ` / ${aktion.maxTeilnehmer} Plätze` : ""}
            </span>
            {isFull && (
              <Badge variant="danger">Ausgebucht</Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
