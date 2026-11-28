"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { WAHLKREIS_LABEL, formatWahlkreisMitLabel } from "@/lib/wahlkreis-label";
import { toast } from "@/components/ui/Toaster";
import PageHeader from "@/components/PageHeader";

interface Team {
  id: string;
  name: string;
  wahlkreis: { id: string; nummer: number; name: string } | null;
  _count: { members: number; aktionen: number };
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  useEffect(() => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data) => {
        setTeams(data);
        setLoading(false);
      });
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    setDeleteTarget(null);
    const res = await fetch(`/api/teams/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTeams((prev) => prev.filter((t) => t.id !== id));
      toast.success(`„${name}“ wurde gelöscht.`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Das Team konnte nicht gelöscht werden.");
    }
  }

  if (loading) {
    return <div className="text-gray-500">Lade Teams...</div>;
  }

  return (
    <div>
      <PageHeader
        title="Teams"
        actions={
          <Link href="/manage/teams/new">
            <Button>Neues Team</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map((team) => (
          <div
            key={team.id}
            className="bg-white rounded-card border-ui border-line p-4 shadow-ui"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-headline font-bold text-primary text-lg case-ui tracking-ui">{team.name}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {team.wahlkreis
                    ? formatWahlkreisMitLabel(team.wahlkreis, WAHLKREIS_LABEL)
                    : "Bezirksweit"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Link href={`/manage/teams/${team.id}`}>
                  <Button variant="outline" size="sm">Bearbeiten</Button>
                </Link>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget(team)}>
                  Löschen
                </Button>
              </div>
            </div>
            <div className="flex gap-4 mt-3 text-sm text-gray-700 border-t-ui border-line pt-3">
              <span>👤 {team._count.members} Mitglieder</span>
              <span>📋 {team._count.aktionen} Aktionen</span>
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Team löschen"
      >
        {deleteTarget && (deleteTarget._count.members > 0 || deleteTarget._count.aktionen > 0) ? (
          // Die API lehnt das Loeschen dann ab; besser gleich erklaeren als einen Fehler zeigen
          <>
            <p className="mb-6 text-gray-700">
              &bdquo;{deleteTarget.name}&ldquo; kann noch nicht gelöscht werden, weil das Team noch{" "}
              {[
                deleteTarget._count.members > 0 &&
                  `${deleteTarget._count.members} Mitglied${deleteTarget._count.members !== 1 ? "er" : ""}`,
                deleteTarget._count.aktionen > 0 &&
                  `${deleteTarget._count.aktionen} Aktion${deleteTarget._count.aktionen !== 1 ? "en" : ""}`,
              ]
                .filter(Boolean)
                .join(" und ")}{" "}
              hat. Bitte entferne sie zuerst aus dem Team.
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Schließen
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-6 text-gray-700">
              &bdquo;{deleteTarget?.name}&ldquo; wird endgültig gelöscht. Das kann nicht rückgängig
              gemacht werden.
            </p>
            <div className="flex flex-wrap gap-3 justify-end">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Abbrechen
              </Button>
              <Button variant="danger" onClick={confirmDelete}>
                Team löschen
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
