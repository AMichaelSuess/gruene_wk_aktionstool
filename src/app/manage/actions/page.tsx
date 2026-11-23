"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Dialog from "@/components/ui/Dialog";
import { toast, useToastLift } from "@/components/ui/Toaster";
import Select from "@/components/ui/Select";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import { de } from "date-fns/locale";
import { KATEGORIEN, kategorieLabel } from "@/lib/kategorien";

interface Aktion {
  id: string;
  titel: string;
  datum: string;
  startzeit: string;
  endzeit: string;
  adresse: string;
  status: string;
  kategorie: string;
  wahlkreis: { nummer: number; name: string };
  teams: { id: string; name: string }[];
  _count: { anmeldungen: number };
  maxTeilnehmer: number | null;
  createdById: string;
}

interface TeamOption {
  id: string;
  name: string;
}

type DateFilter = "alle" | "heute" | "morgen" | "woche";

interface Filters {
  dateFilter: DateFilter;
  activeOnly: boolean;
  hidePast: boolean;
  kategorieFilter: string[];
  teamFilter: string;
  nurEigene: boolean;
}

const DATE_FILTERS: DateFilter[] = ["alle", "heute", "morgen", "woche"];

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "alle", label: "Alle" },
  { value: "heute", label: "Heute" },
  { value: "morgen", label: "Morgen" },
  { value: "woche", label: "Diese Woche" },
];

const DEFAULT_FILTERS: Filters = {
  dateFilter: "alle",
  activeOnly: false,
  hidePast: true,
  kategorieFilter: [],
  teamFilter: "",
  nurEigene: false,
};

// Filter bleiben im Browser gespeichert (pro Person), damit sie nach einem
// Seitenwechsel oder Neuladen erhalten bleiben
function filterStorageKey(userId: string) {
  return `dashboard-filter:${userId}`;
}

function loadFilters(userId: string): Partial<Filters> {
  try {
    const raw = localStorage.getItem(filterStorageKey(userId));
    if (!raw) return {};
    const data = JSON.parse(raw);
    const result: Partial<Filters> = {};
    if (DATE_FILTERS.includes(data.dateFilter)) result.dateFilter = data.dateFilter;
    if (typeof data.activeOnly === "boolean") result.activeOnly = data.activeOnly;
    if (typeof data.hidePast === "boolean") result.hidePast = data.hidePast;
    if (Array.isArray(data.kategorieFilter)) {
      result.kategorieFilter = data.kategorieFilter.filter((k: unknown) =>
        KATEGORIEN.some((kat) => kat.value === k)
      );
    }
    if (typeof data.teamFilter === "string") result.teamFilter = data.teamFilter;
    if (typeof data.nurEigene === "boolean") result.nurEigene = data.nurEigene;
    return result;
  } catch {
    return {};
  }
}

function saveFilters(userId: string, filters: Filters) {
  try {
    localStorage.setItem(filterStorageKey(userId), JSON.stringify(filters));
  } catch {
    // Speicher nicht verfuegbar (z. B. privates Fenster): Filter gelten nur bis zum Neuladen
  }
}

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = session?.user.role === "ADMIN";
  const userId = session?.user.id;

  const [aktionen, setAktionen] = useState<Aktion[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Aktion | null>(null);

  // Filter: null, bis die gespeicherten Werte geladen sind. Das geht erst, wenn
  // feststeht, wer eingeloggt ist (auf dem Server ist die Session immer "loading")
  const [savedFilters, setSavedFilters] = useState<Filters | null>(null);
  if (savedFilters === null && sessionStatus !== "loading") {
    setSavedFilters({ ...DEFAULT_FILTERS, ...(userId ? loadFilters(userId) : {}) });
  }
  const filters = savedFilters ?? DEFAULT_FILTERS;
  const { dateFilter, activeOnly, hidePast, kategorieFilter, nurEigene } = filters;
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    const next = { ...filters, [key]: value };
    setSavedFilters(next);
    if (userId) saveFilters(userId, next);
  }

  function resetFilters() {
    setSavedFilters(DEFAULT_FILTERS);
    if (userId) saveFilters(userId, DEFAULT_FILTERS);
  }

  // Mehrfachauswahl fuer die Bulk-Umkategorisierung
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkKategorie, setBulkKategorie] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bulkBarRef = useRef<HTMLDivElement>(null);
  useToastLift(bulkBarRef, selectedIds.size > 0);

  useEffect(() => {
    fetch("/api/actions")
      .then((r) => r.json())
      .then((data) => {
        setAktionen(data);
        setLoading(false);
      });
  }, []);

  // Teams fuer den Team-Filter: Admins alle Teams, Expert*innen ihre eigenen
  useEffect(() => {
    if (!session) return;
    fetch(isAdmin ? "/api/teams" : "/api/me/teams")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: TeamOption[]) => {
        setTeams(data.map((t) => ({ id: t.id, name: t.name })));
        setTeamsLoaded(true);
      });
  }, [session, isAdmin]);

  // Expert*innen mit nur einem Team brauchen keinen Team-Filter
  const showTeamFilter = isAdmin ? teams.length > 0 : teams.length > 1;

  // Ein gespeichertes Team, das es nicht mehr gibt (oder dessen Filter gar nicht
  // angezeigt wird), wuerde sonst unsichtbar alle Aktionen ausblenden
  const teamFilter =
    !teamsLoaded || (showTeamFilter && teams.some((t) => t.id === filters.teamFilter))
      ? filters.teamFilter
      : "";

  // "Filter zurücksetzen" nur anbieten, wenn etwas vom Standard abweicht
  const filtersActive =
    dateFilter !== DEFAULT_FILTERS.dateFilter ||
    activeOnly !== DEFAULT_FILTERS.activeOnly ||
    hidePast !== DEFAULT_FILTERS.hidePast ||
    kategorieFilter.length > 0 ||
    teamFilter !== DEFAULT_FILTERS.teamFilter ||
    nurEigene !== DEFAULT_FILTERS.nurEigene;

  function handleCancel(id: string) {
    setCancelId(id);
  }

  async function confirmCancel() {
    if (!cancelId) return;
    const id = cancelId;
    setCancelId(null);
    const res = await fetch(`/api/actions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAktionen((prev) => prev.map((a) => (a.id === id ? { ...a, status: "ABGESAGT" } : a)));
      toast.success("Die Aktion wurde abgesagt.");
    } else {
      toast.error("Die Aktion konnte nicht abgesagt werden.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id, titel } = deleteTarget;
    setDeleteTarget(null);
    const res = await fetch(`/api/admin/aktionen/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAktionen((prev) => prev.filter((a) => a.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success(`„${titel}“ wurde gelöscht.`);
    } else {
      toast.error("Die Aktion konnte nicht gelöscht werden.");
    }
  }

  // Aktionen filtern
  const filteredAktionen = aktionen.filter((a) => {
    // Status Filter
    if (activeOnly && a.status === "ABGESAGT") return false;

    // Team Filter
    if (teamFilter && !a.teams.some((t) => t.id === teamFilter)) return false;

    // Nur selbst angelegte
    if (nurEigene && a.createdById !== userId) return false;

    // Vergangene ausblenden (älter als 1 Tag)
    if (hidePast) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 1);
      cutoff.setHours(0, 0, 0, 0);
      if (new Date(a.datum) < cutoff) return false;
    }

    // Kategorie Filter
    if (kategorieFilter.length > 0 && !kategorieFilter.includes(a.kategorie)) return false;

    // Datums Filter
    const date = new Date(a.datum);
    if (dateFilter === "heute" && !isToday(date)) return false;
    if (dateFilter === "morgen" && !isTomorrow(date)) return false;
    // weekStartsOn: 1 setzt Montag als ersten Tag der Woche
    if (dateFilter === "woche" && !isThisWeek(date, { weekStartsOn: 1 })) return false;

    return true;
  });

  // Export-URL Parameter aufbauen
  const exportParams = new URLSearchParams();
  if (dateFilter !== "alle") exportParams.set("dateFilter", dateFilter);
  if (activeOnly) exportParams.set("activeOnly", "true");
  if (hidePast) exportParams.set("hidePast", "true");
  if (kategorieFilter.length > 0) exportParams.set("category", kategorieFilter.join(","));
  if (teamFilter) exportParams.set("teamId", teamFilter);
  if (nurEigene) exportParams.set("mine", "true");
  const exportQuery = exportParams.toString() ? `&${exportParams.toString()}` : "";

  function toggleKategorieFilter(value: string) {
    updateFilter(
      "kategorieFilter",
      kategorieFilter.includes(value)
        ? kategorieFilter.filter((k) => k !== value)
        : [...kategorieFilter, value]
    );
  }

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected =
    filteredAktionen.length > 0 && filteredAktionen.every((a) => selectedIds.has(a.id));

  function toggleSelectAll() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredAktionen.map((a) => a.id)));
  }

  async function confirmBulkKategorie() {
    if (!bulkKategorie || selectedIds.size === 0) return;
    setBulkSaving(true);
    const ids = Array.from(selectedIds);

    const res = await fetch("/api/actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, kategorie: bulkKategorie }),
    });

    setBulkSaving(false);
    setBulkConfirm(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Die Kategorie konnte nicht geändert werden.");
      return;
    }

    setAktionen((prev) =>
      prev.map((a) => (ids.includes(a.id) ? { ...a, kategorie: bulkKategorie } : a))
    );
    setSelectedIds(new Set());
    setBulkKategorie("");
    toast.success(
      `Kategorie von ${ids.length} Aktion${ids.length !== 1 ? "en" : ""} geändert.`
    );
  }

  // Erst rendern, wenn die gespeicherten Filter da sind, damit die Liste nicht
  // kurz mit den Standardfiltern aufblitzt
  if (loading || savedFilters === null) {
    return <div className="text-gray-500 p-8">Lade Aktionen...</div>;
  }

  return (
    <div className={selectedIds.size > 0 ? "pb-40 sm:pb-28" : ""}>
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-headline text-2xl font-bold text-primary case-ui">
          Aktionen
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {filteredAktionen.length > 0 && (
            <>
              <a href={`/api/actions/export?format=xlsx${exportQuery}`}>
                <Button variant="outline" size="sm">Excel exportieren</Button>
              </a>
              <a href={`/api/actions/export?format=txt${exportQuery}`}>
                <Button variant="outline" size="sm">Signal-Text</Button>
              </a>
            </>
          )}
          <Link href="/manage/actions/new">
            <Button>Neue Aktion</Button>
          </Link>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-8 bg-white rounded-card border-ui border-line p-4 shadow-ui">
        <div className="flex items-center justify-between gap-4 pb-3 mb-4 border-b-ui border-line">
          <h2 className="font-headline text-lg font-bold case-ui">Filter</h2>
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-bold case-ui tracking-ui text-ink underline underline-offset-2 cursor-pointer hover:text-primary hover:decoration-2 focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
        <div className="space-y-4">
          <FilterRow label="Zeitraum">
            {DATE_FILTER_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={dateFilter === opt.value ? "primary" : "outline"}
                size="sm"
                aria-pressed={dateFilter === opt.value}
                onClick={() => updateFilter("dateFilter", opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </FilterRow>
          <FilterRow label="Art">
            <Button
              variant={kategorieFilter.length === 0 ? "primary" : "outline"}
              size="sm"
              aria-pressed={kategorieFilter.length === 0}
              onClick={() => updateFilter("kategorieFilter", [])}
            >
              Alle
            </Button>
            {KATEGORIEN.map((kat) => (
              <Button
                key={kat.value}
                variant={kategorieFilter.includes(kat.value) ? "primary" : "outline"}
                size="sm"
                aria-pressed={kategorieFilter.includes(kat.value)}
                onClick={() => toggleKategorieFilter(kat.value)}
              >
                {kat.label}
              </Button>
            ))}
          </FilterRow>
          {showTeamFilter && (
            <FilterRow label="Team">
              <div className="w-full sm:w-64">
                <Select
                  aria-label="Team"
                  value={teamFilter}
                  onChange={(e) => updateFilter("teamFilter", e.target.value)}
                  options={teams.map((t) => ({ value: t.id, label: t.name }))}
                  placeholder="Alle Teams"
                />
              </div>
            </FilterRow>
          )}
          <FilterRow label="Ausblenden">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
              <FilterCheckbox
                checked={activeOnly}
                onChange={(checked) => updateFilter("activeOnly", checked)}
              >
                Abgesagte
              </FilterCheckbox>
              <FilterCheckbox
                checked={hidePast}
                onChange={(checked) => updateFilter("hidePast", checked)}
              >
                Vergangene (älter als 1 Tag)
              </FilterCheckbox>
              <FilterCheckbox
                checked={nurEigene}
                onChange={(checked) => updateFilter("nurEigene", checked)}
              >
                Von anderen angelegte
              </FilterCheckbox>
            </div>
          </FilterRow>
        </div>
      </div>

      {filteredAktionen.length === 0 ? (
        <div className="bg-white rounded-card border-ui border-line shadow-ui p-8 text-center text-gray-500">
          <p>Keine Aktionen für diese Filter gefunden.</p>
          {aktionen.length === 0 && (
            <Link href="/manage/actions/new" className="text-primary font-bold hover:underline mt-2 inline-block">
              Erste Aktion anlegen
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-bold case-ui cursor-pointer">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-primary cursor-pointer"
            />
            Alle auswählen
          </label>
          {filteredAktionen.map((aktion) => (
            <div
              key={aktion.id}
              className={`bg-white rounded-card border-ui shadow-ui p-4 ${
                selectedIds.has(aktion.id) ? "border-primary" : "border-line"
              }`}
            >
              <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                <div className="flex flex-1 gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(aktion.id)}
                    onChange={() => toggleSelection(aktion.id)}
                    aria-label={`${aktion.titel} auswählen`}
                    className="w-4 h-4 mt-1 accent-primary cursor-pointer shrink-0"
                  />
                <div className="flex-1">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <h3 className="font-headline font-bold text-primary case-ui tracking-ui">{aktion.titel}</h3>
                    <StatusBadge status={aktion.status} />
                    {aktion.kategorie && (
                      <Badge variant="info">{kategorieLabel(aktion.kategorie)}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-ink space-y-0.5">
                    <p>
                      📅 {format(new Date(aktion.datum), "EEEE, d. MMMM yyyy", { locale: de })} · {aktion.startzeit} – {aktion.endzeit}
                    </p>
                    <p>📍 {aktion.adresse}</p>
                    {aktion.teams.length > 0 && (
                      <p className="flex flex-wrap gap-1">
                        {aktion.teams.map((team) => (
                          <span
                            key={team.id}
                            className="text-xs font-bold case-ui tracking-ui rounded-badge bg-ink text-white px-2 py-0.5 inline-block mt-1"
                          >
                            {team.name}
                          </span>
                        ))}
                      </p>
                    )}
                    <p className="pt-1">
                      👥 {aktion._count.anmeldungen} Anmeldungen
                      {aktion.maxTeilnehmer ? ` / ${aktion.maxTeilnehmer} Plätze` : ""}
                    </p>
                  </div>
                </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0 sm:flex-row sm:flex-wrap items-start">
                  <Link href={`/manage/actions/${aktion.id}/signups`} className="sm:w-auto self-start">
                    <Button variant="outline" size="sm" className="w-full sm:w-auto">
                      Anmeldungen
                    </Button>
                  </Link>
                  <div className="flex gap-2 w-full sm:w-auto self-start items-center">
                    <Link href={`/manage/actions/${aktion.id}`} className="flex-1 sm:flex-none self-start">
                      <Button variant="outline" size="sm" className="w-full sm:w-auto">
                        Bearbeiten
                      </Button>
                    </Link>
                    {aktion.status !== "ABGESAGT" && (
                      <Button
                        variant="danger"
                        size="sm"
                        className="flex-none self-start"
                        onClick={() => handleCancel(aktion.id)}
                      >
                        Absagen
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        variant="danger"
                        size="sm"
                        className="flex-none self-start"
                        onClick={() => setDeleteTarget(aktion)}
                      >
                        Löschen
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Aktionsleiste fuer die Mehrfachauswahl */}
      {selectedIds.size > 0 && (
        <div ref={bulkBarRef} className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-ui border-line p-4 shadow-ui-up">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-end gap-3">
            <p className="text-sm font-bold case-ui sm:mb-2">
              {selectedIds.size} Aktion{selectedIds.size !== 1 ? "en" : ""} ausgewählt
            </p>
            <div className="sm:w-64">
              <Select
                label="Art der Aktion ändern in"
                value={bulkKategorie}
                onChange={(e) => setBulkKategorie(e.target.value)}
                options={KATEGORIEN}
                placeholder="Bitte wählen"
              />
            </div>
            <div className="flex gap-2 sm:mb-0">
              <Button
                onClick={() => setBulkConfirm(true)}
                disabled={!bulkKategorie || bulkSaving}
              >
                Kategorie ändern
              </Button>
              <Button variant="secondary" onClick={() => setSelectedIds(new Set())}>
                Auswahl aufheben
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={bulkConfirm}
        onClose={() => setBulkConfirm(false)}
        title="Kategorie ändern"
      >
        <p className="mb-6 text-gray-700">
          Die Art von {selectedIds.size} Aktion{selectedIds.size !== 1 ? "en" : ""} wird auf
          &bdquo;{kategorieLabel(bulkKategorie)}&ldquo; geändert. Es werden keine E-Mails
          verschickt.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setBulkConfirm(false)}>
            Abbrechen
          </Button>
          <Button onClick={confirmBulkKategorie} disabled={bulkSaving}>
            {bulkSaving ? "Wird geändert..." : "Ändern"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={cancelId !== null}
        onClose={() => setCancelId(null)}
        title="Aktion absagen"
      >
        <p className="mb-6 text-gray-700">
          Aktion wirklich absagen? Alle Angemeldeten werden benachrichtigt.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setCancelId(null)}>
            Abbrechen
          </Button>
          <Button variant="danger" onClick={confirmCancel}>
            Absagen
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Aktion endgültig löschen"
      >
        <p className="mb-6 text-gray-700">
          &bdquo;{deleteTarget?.titel}&ldquo; wird endgültig gelöscht
          {deleteTarget && deleteTarget._count.anmeldungen > 0
            ? `, zusammen mit ${deleteTarget._count.anmeldungen} Anmeldung${deleteTarget._count.anmeldungen !== 1 ? "en" : ""}`
            : ""}
          . Es werden <strong>keine</strong> E-Mails verschickt. Das kann nicht rückgängig gemacht
          werden. Wenn die Angemeldeten benachrichtigt werden sollen, sage die Aktion stattdessen ab.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Abbrechen
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Endgültig löschen
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

// Eine Filterzeile: Beschriftung links, auf dem Handy darueber
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="text-sm font-bold case-ui sm:w-32 shrink-0">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function FilterCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-baseline gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="self-center w-5 h-5 accent-primary cursor-pointer"
      />
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "AKTIV":
      return <Badge variant="success">Aktiv</Badge>;
    case "GEAENDERT":
      return <Badge variant="warning">Geändert</Badge>;
    case "ABGESAGT":
      return <Badge variant="danger">Abgesagt</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}