"use client";

import { useEffect, useState, use } from "react";
import Button from "@/components/ui/Button";
import Card, { CardHeader, CardTitle } from "@/components/ui/Card";
import Dialog from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toaster";

interface Anmeldung {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string | null;
  signalName: string | null;
  createdAt: string;
}

interface Aktion {
  titel: string;
  datum: string;
  startzeit: string;
}

export default function AnmeldungenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [anmeldungen, setAnmeldungen] = useState<Anmeldung[]>([]);
  const [aktion, setAktion] = useState<Aktion | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Anmeldung | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/aktionen/${id}/anmeldungen`).then((r) => r.json()),
      fetch(`/api/aktionen/${id}`).then((r) => r.json()),
    ]).then(([anm, akt]) => {
      setAnmeldungen(anm);
      setAktion(akt);
      setLoading(false);
    });
  }, [id]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const anmeldungId = deleteTarget.id;
    setDeleteTarget(null);
    const res = await fetch(`/api/aktionen/${id}/anmeldungen?anmeldungId=${anmeldungId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setAnmeldungen((prev) => prev.filter((a) => a.id !== anmeldungId));
      toast.success("Die Anmeldung wurde gelöscht.");
    } else {
      toast.error("Die Anmeldung konnte nicht gelöscht werden.");
    }
  }

  function downloadExport(format: "xlsx" | "txt") {
    window.open(`/api/export?aktionId=${id}&format=${format}`, "_blank");
  }

  if (loading) {
    return <div className="text-gray-500">Lade Anmeldungen...</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-bold text-primary case-ui">
            Anmeldungen
          </h1>
          {aktion && (
            <p className="text-gray-600 mt-1">{aktion.titel}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => downloadExport("xlsx")}>
            Excel-Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadExport("txt")}>
            TXT (Signal)
          </Button>
        </div>
      </div>

      {anmeldungen.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-center py-8">Noch keine Anmeldungen.</p>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{anmeldungen.length} Anmeldung{anmeldungen.length !== 1 ? "en" : ""}</CardTitle>
          </CardHeader>
          {/* Mobile: stacked cards */}
          <div className="block md:hidden divide-y divide-gray-100">
            {anmeldungen.map((a) => (
              <div key={a.id} className="py-3">
                <div className="font-medium">{a.vorname} {a.nachname}</div>
                <div className="text-sm text-gray-600 break-all">{a.email}</div>
                {a.telefon && <div className="text-sm text-gray-600">{a.telefon}</div>}
                {a.signalName && <div className="text-sm text-gray-600">Signal: {a.signalName}</div>}
                <Button variant="danger" size="sm" className="mt-2" onClick={() => setDeleteTarget(a)}>
                  Löschen
                </Button>
              </div>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-sm font-bold text-gray-600">Name</th>
                  <th className="text-left py-2 text-sm font-bold text-gray-600">E-Mail</th>
                  <th className="text-left py-2 text-sm font-bold text-gray-600">Telefon</th>
                  <th className="text-left py-2 text-sm font-bold text-gray-600">Signal</th>
                  <th className="text-right py-2 text-sm font-bold text-gray-600">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {anmeldungen.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="py-2 font-medium">
                      {a.vorname} {a.nachname}
                    </td>
                    <td className="py-2 text-gray-600">{a.email}</td>
                    <td className="py-2 text-gray-600">{a.telefon || "–"}</td>
                    <td className="py-2 text-gray-600">{a.signalName || "–"}</td>
                    <td className="py-2 text-right">
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(a)}>
                        Löschen
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Anmeldung löschen"
      >
        <p className="mb-6 text-gray-700">
          Die Anmeldung von &bdquo;{deleteTarget?.vorname} {deleteTarget?.nachname}&ldquo; wird
          endgültig gelöscht. Die Person wird darüber nicht per E-Mail benachrichtigt.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Abbrechen
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Anmeldung löschen
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
