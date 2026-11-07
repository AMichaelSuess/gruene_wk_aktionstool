"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import FilterBar, { type FilterState } from "@/components/FilterBar";
import AktionCard from "@/components/AktionCard";
import SelectionBar from "@/components/SelectionBar";

const AktionMap = dynamic(() => import("@/components/AktionMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] md:h-[600px] bg-gray-100 rounded-card border-ui border-line flex items-center justify-center text-ink font-bold case-ui tracking-ui">
      Karte wird geladen...
    </div>
  ),
});

/**
 * Erzeugt die Query-Parameter aus dem Filterzustand.
 * Wird sowohl fuer die URL (teilbare Links) als auch fuer den API-Fetch genutzt,
 * damit beide nicht auseinanderdriften.
 */
function buildFilterParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.datum) params.set("datum", filters.datum);
  if (filters.datumBis) params.set("datumBis", filters.datumBis);
  if (filters.tageszeit.length > 0) params.set("tageszeit", filters.tageszeit.join(","));
  if (filters.wahlkreise.length > 0) params.set("wahlkreis", filters.wahlkreise.join(","));
  if (filters.kategorien.length > 0) params.set("kategorie", filters.kategorien.join(","));
  return params;
}

interface Aktion {
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
  maxTeilnehmer: number | null;
  status: string;
  _count: { anmeldungen: number };
}

function AktionenPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [aktionen, setAktionen] = useState<Aktion[]>([]);
  const [wahlkreise, setWahlkreise] = useState<{ nummer: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"liste" | "karte">("liste");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [aktionTitles, setAktionTitles] = useState<Map<string, string>>(new Map());
  const [filters, setFilters] = useState<FilterState>({
    datum: searchParams.get("datum") ?? "",
    datumBis: searchParams.get("datumBis") ?? "",
    tageszeit: searchParams.get("tageszeit")?.split(",").filter(Boolean) ?? [],
    wahlkreise: searchParams.get("wahlkreis")?.split(",").map(Number).filter(Boolean) ?? [],
    kategorien: searchParams.get("kategorie")?.split(",").filter(Boolean) ?? [],
  });

  function handleFilterChange(newFilters: FilterState) {
    setFilters(newFilters);
    router.replace(`/?${buildFilterParams(newFilters)}`, { scroll: false });
  }

  useEffect(() => {
    fetch("/api/wahlkreise")
      .then((r) => r.json())
      .then(setWahlkreise)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = buildFilterParams(filters);
    params.set("public", "true");
    fetch(`/api/aktionen?${params}`)
      .then((r) => r.json())
      .then((data: Aktion[]) => {
        setAktionen(data);
        setAktionTitles((prev) => {
          const next = new Map(prev);
          for (const a of data) next.set(a.id, a.titel);
          return next;
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filters]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className={selectedIds.size > 0 ? "pb-24" : ""}>
      <FilterBar filters={filters} onFilterChange={handleFilterChange} wahlkreise={wahlkreise} />

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* View toggle */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-headline text-xl md:text-3xl font-bold text-primary case-ui">
            Aktionen
          </h1>
          <div className="flex overflow-hidden rounded-button border-ui border-line">
            <button
              onClick={() => setView("liste")}
              className={`px-4 py-2 text-sm font-bold case-ui tracking-ui min-h-[44px] transition-colors focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus ${
                view === "liste"
                  ? "bg-primary text-white"
                  : "bg-white text-ink hover:bg-ink hover:text-white"
              }`}
            >
              Liste
            </button>
            <button
              onClick={() => setView("karte")}
              className={`px-4 py-2 text-sm font-bold case-ui tracking-ui min-h-[44px] transition-colors border-l-ui border-line focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus ${
                view === "karte"
                  ? "bg-primary text-white"
                  : "bg-white text-ink hover:bg-ink hover:text-white"
              }`}
            >
              Karte
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-ink font-bold case-ui tracking-ui">
            Lade Aktionen...
          </div>
        ) : aktionen.length === 0 ? (
          <div className="bg-white rounded-card border-ui border-line p-8 text-center shadow-ui">
            <p className="font-headline font-bold text-lg case-ui tracking-ui">
              Aktuell keine Aktionen geplant.
            </p>
            <p className="text-gray-600 text-base mt-2">
              Schau später nochmal vorbei!
            </p>
          </div>
        ) : view === "liste" ? (
          <div className="space-y-3">
            {selectedIds.size === 0 && (
              <p className="text-base text-gray-500">
                Wähle eine oder mehrere Aktionen aus, um dich anzumelden.
              </p>
            )}
            {aktionen.map((aktion) => (
              <AktionCard
                key={aktion.id}
                aktion={aktion}
                selected={selectedIds.has(aktion.id)}
                onToggle={toggleSelection}
              />
            ))}
          </div>
        ) : (
          <AktionMap aktionen={aktionen} onSelect={toggleSelection} />
        )}
      </div>

      <SelectionBar
        selectedIds={Array.from(selectedIds)}
        aktionTitles={aktionTitles}
      />
    </div>
  );
}

export default function AktionenPage() {
  return (
    <Suspense>
      <AktionenPageInner />
    </Suspense>
  );
}
