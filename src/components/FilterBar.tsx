"use client";

import { useState } from "react";
import { KATEGORIEN } from "@/lib/kategorien";
import { WAHLKREIS_LABEL_SHORT, WAHLKREIS_NUMMERN_ANZEIGEN } from "@/lib/wahlkreis-label";
import { theme } from "@/lib/theme";

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

  // Das Datum zaehlt als ein Filter, egal ob Anfang, Ende oder beides gesetzt ist
  const activeFilterCount =
    (filters.datum || filters.datumBis ? 1 : 0) +
    (filters.tageszeit.length > 0 ? 1 : 0) +
    (filters.wahlkreise.length > 0 ? 1 : 0) +
    (filters.kategorien.length > 0 ? 1 : 0);

  function resetFilters() {
    onFilterChange({ datum: "", datumBis: "", tageszeit: [], wahlkreise: [], kategorien: [] });
  }

  const resetLink = activeFilterCount > 0 && (
    <button
      type="button"
      onClick={resetFilters}
      className="shrink-0 text-xs font-bold case-ui tracking-ui text-ink underline underline-offset-2 cursor-pointer hover:text-primary hover:decoration-2 focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus"
    >
      Filter zurücksetzen
    </button>
  );

  // Mit Kampagnen-Kopfbereich gibt es auf der Startseite keinen sticky Header darüber
  return (
    <div className={`bg-white border-b-ui border-line sticky z-40 ${theme.hero ? "top-0" : "top-[52px]"}`}>
      <div className="max-w-7xl mx-auto px-4">
        {/* Kopfzeile auf Handy und Tablet: Auf-/Zuklappen, Zuruecksetzen auch im zugeklappten Zustand */}
        <div className="lg:hidden flex items-center gap-4">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls="filter-inhalt"
            className="flex-1 py-3 flex items-center justify-between text-sm font-bold case-ui tracking-ui text-ink cursor-pointer focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus"
          >
            <span>Filter {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}</span>
            <span className="text-xs" aria-hidden="true">{expanded ? "▲" : "▼"}</span>
          </button>
          {resetLink}
        </div>

        <div
          id="filter-inhalt"
          className={`${expanded ? "flex" : "hidden"} lg:flex items-start gap-4 pb-3 lg:pt-3`}
        >
          <div className="flex-1 min-w-0 space-y-3 lg:space-y-2">
            <FilterRow label="Datum">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="date"
                  aria-label="Datum von"
                  value={filters.datum}
                  onChange={(e) => onFilterChange({ ...filters, datum: e.target.value })}
                  className={DATE_INPUT_CLASS}
                />
                <span className="text-ink font-bold" aria-hidden="true">–</span>
                <input
                  type="date"
                  aria-label="Datum bis"
                  value={filters.datumBis}
                  onChange={(e) => onFilterChange({ ...filters, datumBis: e.target.value })}
                  className={DATE_INPUT_CLASS}
                />
              </div>
            </FilterRow>

            <FilterRow label="Tageszeit">
              {TAGESZEITEN.map((tz) => (
                <Chip
                  key={tz.value}
                  active={
                    tz.value === ""
                      ? filters.tageszeit.length === 0
                      : filters.tageszeit.includes(tz.value)
                  }
                  onClick={() =>
                    tz.value === ""
                      ? onFilterChange({ ...filters, tageszeit: [] })
                      : toggleTageszeit(tz.value)
                  }
                >
                  {tz.label}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Art">
              <Chip
                active={filters.kategorien.length === 0}
                onClick={() => onFilterChange({ ...filters, kategorien: [] })}
              >
                Alle
              </Chip>
              {KATEGORIEN.map((kat) => (
                <Chip
                  key={kat.value}
                  active={filters.kategorien.includes(kat.value)}
                  onClick={() => toggleKategorie(kat.value)}
                >
                  {kat.label}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label={WAHLKREIS_LABEL_SHORT}>
              <Chip
                active={filters.wahlkreise.length === 0}
                onClick={() => onFilterChange({ ...filters, wahlkreise: [] })}
              >
                Alle
              </Chip>
              {wahlkreise.map((wk) => (
                <Chip
                  key={wk.nummer}
                  active={filters.wahlkreise.includes(wk.nummer)}
                  onClick={() => toggleWahlkreis(wk.nummer)}
                  // Nummern-Chips bleiben kompakt (lange Berliner Namen); der Name steht im Tooltip
                  title={WAHLKREIS_NUMMERN_ANZEIGEN ? wk.name : undefined}
                  compact={WAHLKREIS_NUMMERN_ANZEIGEN}
                >
                  {WAHLKREIS_NUMMERN_ANZEIGEN ? wk.nummer : wk.name}
                </Chip>
              ))}
            </FilterRow>
          </div>

          {/* Auf grossen Bildschirmen oben rechts */}
          <div className="hidden lg:block">{resetLink}</div>
        </div>
      </div>
    </div>
  );
}

const DATE_INPUT_CLASS =
  "min-w-0 flex-1 sm:flex-none text-sm rounded-control border-ui border-line-strong bg-white px-2 py-1 focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus";

// Eine Filterzeile: Beschriftung links, auf dem Handy darueber
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="text-xs font-bold case-ui tracking-ui text-ink shrink-0 sm:w-28">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  title,
  compact = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-button text-xs font-bold border-ui transition-colors cursor-pointer focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus ${
        compact ? "w-7 h-7" : "px-2 py-1 case-ui tracking-ui"
      } ${
        active
          ? "bg-primary text-white border-line"
          : "bg-white text-ink border-line-strong hover:bg-ink hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export type { FilterState };
