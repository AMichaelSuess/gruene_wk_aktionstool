"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Dialog from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toaster";

interface Team {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  teams: Team[];
  // Nur fuer Admins: Anzahl selbst angelegter Aktionen (entscheidet Loeschen vs. Anonymisieren)
  _count?: { aktionen: number };
}

export default function UsersPage() {
  // Expert*innen sehen hier nur die Mitglieder ihrer Teams, ohne Bearbeiten
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "ADMIN";
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data);
        setLoading(false);
      });
  }, []);

  async function toggleActive(user: User) {
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, active: !user.active }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Der Status konnte nicht geändert werden.");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, active: !u.active } : u)));
    toast.success(`${user.name} wurde ${user.active ? "deaktiviert" : "aktiviert"}.`);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    setDeleting(true);
    const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteTarget(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Die Person konnte nicht gelöscht werden.");
      return;
    }
    // Anonymisierte Konten erscheinen nicht mehr in der Liste
    setUsers((prev) => prev.filter((u) => u.id !== id));
    toast.success(`${name} wurde gelöscht.`);
  }

  if (loading) {
    return <div className="text-gray-500">Lade Benutzer*innen...</div>;
  }

  const anzahlAktionen = deleteTarget?._count?.aktionen ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-headline text-2xl font-bold text-primary case-ui">
            Benutzer*innen
          </h1>
          {!isAdmin && (
            <p className="text-sm text-gray-600 mt-1">Die Mitglieder deiner Teams und die Admins.</p>
          )}
        </div>
        {isAdmin && (
          <Link href="/manage/users/new">
            <Button>Neue*r Benutzer*in</Button>
          </Link>
        )}
      </div>


      <div className="rounded-card border-ui border-line overflow-hidden shadow-ui">
        <table className="w-full">
          <thead className="bg-muted border-b-ui border-line">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-bold text-ink case-ui tracking-ui">Name</th>
              <th className="text-left px-4 py-3 text-sm font-bold text-ink case-ui tracking-ui">E-Mail</th>
              <th className="text-left px-4 py-3 text-sm font-bold text-ink case-ui tracking-ui">Rolle</th>
              <th className="text-left px-4 py-3 text-sm font-bold text-ink case-ui tracking-ui">Teams</th>
              {isAdmin && (
                <>
                  <th className="text-left px-4 py-3 text-sm font-bold text-ink case-ui tracking-ui">Status</th>
                  <th className="text-right px-4 py-3 text-sm font-bold text-ink case-ui tracking-ui">Aktionen</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y-ui divide-line">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/50 bg-white">
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3 text-gray-700">{user.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={user.role === "ADMIN" ? "info" : "default"}>
                    {user.role === "ADMIN" ? "Admin" : "Expert*in"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-700 text-sm">
                  {/* Admins haben ueber ihre Rolle Zugriff auf alle Teams */}
                  {user.role === "ADMIN"
                    ? "Alle Teams"
                    : user.teams.length > 0
                      ? user.teams.map((t) => t.name).join(", ")
                      : "–"}
                </td>
                {isAdmin && (
                  <>
                    <td className="px-4 py-3">
                      <Badge variant={user.active ? "success" : "danger"}>
                        {user.active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Link href={`/manage/users/${user.id}`}>
                          <Button variant="outline" size="sm">Bearbeiten</Button>
                        </Link>
                        {/* Sich selbst deaktivieren oder loeschen sperrt sich aus */}
                        {user.id !== session?.user.id && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => toggleActive(user)}>
                              {user.active ? "Deaktivieren" : "Aktivieren"}
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => setDeleteTarget(user)}>
                              Löschen
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Benutzer*in löschen"
      >
        {anzahlAktionen === 0 ? (
          <p className="mb-6 text-gray-700">
            &bdquo;{deleteTarget?.name}&ldquo; wird endgültig gelöscht. Das kann nicht rückgängig
            gemacht werden.
          </p>
        ) : (
          <p className="mb-6 text-gray-700">
            &bdquo;{deleteTarget?.name}&ldquo; hat {anzahlAktionen}{" "}
            {anzahlAktionen === 1 ? "Aktion angelegt. Diese bleibt" : "Aktionen angelegt. Diese bleiben"}{" "}
            erhalten. Name,
            E-Mail-Adresse und Passwort werden gelöscht, die Person wird aus allen Teams entfernt
            und kann sich nicht mehr anmelden. Das kann nicht rückgängig gemacht werden.
          </p>
        )}
        <p className="mb-6 text-sm text-gray-600">
          Ist die Person bei Aktionen als Ansprechperson eingetragen, bleiben diese Kontaktdaten
          stehen. Bitte bei den Aktionen selbst ändern.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Abbrechen
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? "Wird gelöscht..." : "Endgültig löschen"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
