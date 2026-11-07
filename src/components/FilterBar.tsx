"use client";

import { useState } from "react";
import { KATEGORIEN } from "@/lib/kategorien";
import { WAHLKREIS_LABEL_SHORT } from "@/lib/wahlkreis-label";

interface FilterState {
  datum: string;
  datumBis: string;
  tageszeit: string[];
  wahlkreise: number[];
  kategorien: string[];
}

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  wahlkreise: { nummer: number; name: string }[];
}

const TAGESZEITEN = [
  { value: "", label: "Alle" },
  { value: "vormittags", label: "Vormittags" },
  { value: "tagsueber", label: "Tagsüber" },
  { value: "abends", label: "Abends" },
];

export default function FilterBar({ filters, onFilterChange, wahlkreise }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  function toggleWahlkreis(nummer: number) {
    const current = filters.wahlkreise;
    const next = current.includes(nummer)
      ? current.filter((n) => n !== nummer)
      : [...current, nummer];
    onFilterChange({ ...filters, wahlkreise: next });
  }

  function toggleTageszeit(value: string) {
    const current = filters.tageszeit;
    const next = current.includes(value)
      ? current.filter((t) => t !== value)
      : [...current, value];
    onFilterChange({ ...filters, tageszeit: next });
  }

  function toggleKategorie(value: string) {
    const current = filters.kategorien;
    const next = current.includes(value)
      ? current.filter((k) => k !== value)
      : [...current, value];
    onFilterChange({ ...filters, kategorien: next });
  }

  const activeFilterCount =
    (filters.datum ? 1 : 0) +
    (filters.tageszeit.length > 0 ? 1 : 0) +
    (filters.wahlkreise.length > 0 ? 1 : 0) +
    (filters.kategorien.length > 0 ? 1 : 0);

  return (
    <div className="bg-white border-b-ui border-line sticky top-[52px] z-40">
      <div className="max-w-7xl mx-auto px-4">
        {/* Toggle button: visible on mobile and tablet (< lg) */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="lg:hidden w-full py-3 flex items-center justify-between text-sm font-bold case-ui tracking-ui text-ink focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus"
        >
          <span>
            Filter {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
          </span>
          <span className="text-xs">{expanded ? "▲" : "▼"}</span>
        </button>

        {/* Filter content */}
        <div
          className={`${
            expanded ? "block" : "hidden"
          } lg:block py-3`}
        >
          {/* Row 1: Datum + Tageszeit + Clear (lg: inline) */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:flex-nowrap">
            {/* Datum */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold case-ui tracking-ui text-ink shrink-0">Datum:</label>
              <input
                type="date"
                value={filters.datum}
                onChange={(e) => onFilterChange({ ...filters, datum: e.target.value })}
                className="text-sm rounded-control border-ui border-line-strong bg-white px-2 py-1 focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus"
              />
              <span className="text-ink font-bold">–</span>
              <input
                type="date"
                value={filters.datumBis}
                onChange={(e) => onFilterChange({ ...filters, datumBis: e.target.value })}
                className="text-sm rounded-control border-ui border-line-strong bg-white px-2 py-1 focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus"
              />
            </div>

            {/* Tageszeit */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs font-bold case-ui tracking-ui text-ink shrink-0">Tageszeit:</label>
              <div className="flex gap-1 flex-wrap">
                {TAGESZEITEN.map((tz) => (
                  <button
                    key={tz.value}
                    onClick={() =>
                      tz.value === ""
                        ? onFilterChange({ ...filters, tageszeit: [] })
                        : toggleTageszeit(tz.value)
                    }
                    className={`rounded-button text-xs px-2 py-1 font-bold case-ui tracking-ui border-ui transition-colors focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus ${
                      (tz.value === "" && filters.tageszeit.length === 0) ||
                      (tz.value !== "" && filters.tageszeit.includes(tz.value))
                        ? "bg-primary text-white border-line"
                        : "bg-white text-ink border-line-strong hover:bg-ink hover:text-white"
                    }`}
                  >
                    {tz.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear (shown inline on lg+, sobald Datum, Tageszeit oder Art gesetzt ist) */}
            {activeFilterCount > 0 &&
              (filters.datum || filters.tageszeit.length > 0 || filters.kategorien.length > 0) && (
              <button
                onClick={() =>
                  onFilterChange({
                    datum: "",
                    datumBis: "",
                    tageszeit: [],
                    wahlkreise: [],
                    kategorien: [],
                  })
                }
                className="text-xs font-bold case-ui tracking-ui text-ink underline lg:ml-auto hover:text-primary focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus hidden lg:block"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>

          {/* Row 2: Art (Kategorie) + Wahlkreise */}
          <div className="flex items-center gap-x-6 gap-y-3 mt-3 flex-wrap">
            {/* Art der Aktion */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs font-bold case-ui tracking-ui text-ink shrink-0">Art:</label>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => onFilterChange({ ...filters, kategorien: [] })}
                  className={`rounded-button text-xs px-2 py-1 font-bold case-ui tracking-ui border-ui transition-colors focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus ${
                    filters.kategorien.length === 0
                      ? "bg-primary text-white border-line"
                      : "bg-white text-ink border-line-strong hover:bg-ink hover:text-white"
                  }`}
                >
                  Alle
                </button>
                {KATEGORIEN.map((kat) => (
                  <button
                    key={kat.value}
                    onClick={() => toggleKategorie(kat.value)}
                    className={`rounded-button text-xs px-2 py-1 font-bold case-ui tracking-ui border-ui transition-colors focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus ${
                      filters.kategorien.includes(kat.value)
                        ? "bg-primary text-white border-line"
                        : "bg-white text-ink border-line-strong hover:bg-ink hover:text-white"
                    }`}
                  >
                    {kat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Wahlkreise */}
            <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-bold case-ui tracking-ui text-ink shrink-0">{WAHLKREIS_LABEL_SHORT}:</label>
            <div className="flex gap-1 flex-wrap">
              {wahlkreise.map((wk) => (
                <button
                  key={wk.nummer}
                  onClick={() => toggleWahlkreis(wk.nummer)}
                  title={wk.name}
                  className={`rounded-button w-7 h-7 text-xs font-bold border-ui transition-colors focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus ${
                    filters.wahlkreise.includes(wk.nummer)
                      ? "bg-primary text-white border-line"
                      : "bg-white text-ink border-line-strong hover:bg-ink hover:text-white"
                  }`}
                >
                  {wk.nummer}
                </button>
              ))}
            </div>
            </div>

            {/* Clear button (mobile/tablet: after WK row) */}
            {activeFilterCount > 0 && (
              <button
                onClick={() =>
                  onFilterChange({
                    datum: "",
                    datumBis: "",
                    tageszeit: [],
                    wahlkreise: [],
                    kategorien: [],
                  })
                }
                className="text-xs font-bold case-ui tracking-ui text-ink underline ml-auto hover:text-primary focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus lg:hidden"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { FilterState };
