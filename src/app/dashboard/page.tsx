"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Dialog from "@/components/ui/Dialog";
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
  team: { name: string } | null;
  _count: { anmeldungen: number };
  maxTeilnehmer: number | null;
}

export default function DashboardPage() {
  const [aktionen, setAktionen] = useState<Aktion[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);

  // Filter States
  const [dateFilter, setDateFilter] = useState<"alle" | "heute" | "morgen" | "woche">("alle");
  const [activeOnly, setActiveOnly] = useState(false);
  const [hidePast, setHidePast] = useState(true);
  const [kategorieFilter, setKategorieFilter] = useState<string[]>([]);

  // Mehrfachauswahl fuer die Bulk-Umkategorisierung
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkKategorie, setBulkKategorie] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState("");

  useEffect(() => {
    fetch("/api/aktionen")
      .then((r) => r.json())
      .then((data) => {
        setAktionen(data);
        setLoading(false);
      });
  }, []);

  function handleCancel(id: string) {
    setCancelId(id);
  }

  async function confirmCancel() {
    if (!cancelId) return;
    const id = cancelId;
    setCancelId(null);
    const res = await fetch(`/api/aktionen/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAktionen(aktionen.map((a) => (a.id === id ? { ...a, status: "ABGESAGT" } : a)));
    }
  }

  // Aktionen filtern
  const filteredAktionen = aktionen.filter((a) => {
    // Status Filter
    if (activeOnly && a.status === "ABGESAGT") return false;

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
  if (kategorieFilter.length > 0) exportParams.set("kategorie", kategorieFilter.join(","));
  const exportQuery = exportParams.toString() ? `&${exportParams.toString()}` : "";

  function toggleKategorieFilter(value: string) {
    setKategorieFilter((prev) =>
      prev.includes(value) ? prev.filter((k) => k !== value) : [...prev, value]
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
    setBulkError("");
    const ids = Array.from(selectedIds);

    const res = await fetch("/api/aktionen/bulk-kategorie", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, kategorie: bulkKategorie }),
    });

    setBulkSaving(false);
    setBulkConfirm(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBulkError(data.error || "Die Kategorie konnte nicht geändert werden.");
      return;
    }

    setAktionen((prev) =>
      prev.map((a) => (ids.includes(a.id) ? { ...a, kategorie: bulkKategorie } : a))
    );
    setSelectedIds(new Set());
    setBulkKategorie("");
  }

  if (loading) {
    return <div className="text-gray-500 p-8">Lade Aktionen...</div>;
  }

  return (
    <div className={selectedIds.size > 0 ? "pb-40 sm:pb-28" : ""}>
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-headline text-2xl font-bold text-primary case-ui">
          Meine Aktionen
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {filteredAktionen.length > 0 && (
            <>
              <a href={`/api/export-aktionen?format=xlsx${exportQuery}`}>
                <Button variant="outline" size="sm">Excel exportieren</Button>
              </a>
              <a href={`/api/export-aktionen?format=txt${exportQuery}`}>
                <Button variant="outline" size="sm">Signal-Text</Button>
              </a>
            </>
          )}
          <Link href="/dashboard/aktionen/neu">
            <Button>Neue Aktion</Button>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-6 mb-8 bg-white rounded-card border-ui border-line p-4 shadow-ui">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold case-ui">Zeitraum:</span>
          <Button
            variant={dateFilter === "alle" ? "primary" : "outline"}
            size="sm"
            onClick={() => setDateFilter("alle")}
          >
            Alle
          </Button>
          <Button
            variant={dateFilter === "heute" ? "primary" : "outline"}
            size="sm"
            onClick={() => setDateFilter("heute")}
          >
            Heute
          </Button>
          <Button
            variant={dateFilter === "morgen" ? "primary" : "outline"}
            size="sm"
            onClick={() => setDateFilter("morgen")}
          >
            Morgen
          </Button>
          <Button
            variant={dateFilter === "woche" ? "primary" : "outline"}
            size="sm"
            onClick={() => setDateFilter("woche")}
          >
            Diese Woche
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-l-ui border-gray-300 pl-6">
          <span className="text-sm font-bold case-ui">Art:</span>
          <Button
            variant={kategorieFilter.length === 0 ? "primary" : "outline"}
            size="sm"
            onClick={() => setKategorieFilter([])}
          >
            Alle
          </Button>
          {KATEGORIEN.map((kat) => (
            <Button
              key={kat.value}
              variant={kategorieFilter.includes(kat.value) ? "primary" : "outline"}
              size="sm"
              onClick={() => toggleKategorieFilter(kat.value)}
            >
              {kat.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 border-l-ui border-gray-300 pl-6">
          <label className="flex items-center gap-2 text-sm font-bold case-ui cursor-pointer">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="w-4 h-4 accent-primary cursor-pointer"
            />
            Nur Aktive (Aktiv & Geändert)
          </label>
          <label className="flex items-center gap-2 text-sm font-bold case-ui cursor-pointer">
            <input
              type="checkbox"
              checked={hidePast}
              onChange={(e) => setHidePast(e.target.checked)}
              className="w-4 h-4 accent-primary cursor-pointer"
            />
            Vergangene ausblenden (älter als 1 Tag)
          </label>
        </div>
      </div>

      {filteredAktionen.length === 0 ? (
        <div className="bg-white rounded-card border-ui border-line shadow-ui p-8 text-center text-gray-500">
          <p>Keine Aktionen für diese Filter gefunden.</p>
          {aktionen.length === 0 && (
            <Link href="/dashboard/aktionen/neu" className="text-primary font-bold hover:underline mt-2 inline-block">
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
                    {aktion.team && (
                      <p>
                        <span className="text-xs font-bold case-ui tracking-ui rounded-badge bg-ink text-white px-2 py-0.5 inline-block mt-1">
                          {aktion.team.name}
                        </span>
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
                  <Link href={`/dashboard/aktionen/${aktion.id}/anmeldungen`} className="sm:w-auto self-start">
                    <Button variant="outline" size="sm" className="w-full sm:w-auto">
                      Anmeldungen
                    </Button>
                  </Link>
                  <div className="flex gap-2 w-full sm:w-auto self-start items-center">
                    <Link href={`/dashboard/aktionen/${aktion.id}`} className="flex-1 sm:flex-none self-start">
                      <Button variant="secondary" size="sm" className="w-full sm:w-auto">
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
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Aktionsleiste fuer die Mehrfachauswahl */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-ui border-line p-4 shadow-ui-up">
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
          {bulkError && (
            <p className="max-w-5xl mx-auto mt-2 text-sm font-bold text-danger">{bulkError}</p>
          )}
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
    </div>
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