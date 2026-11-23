"use client";

import { useEffect, useState, type FormEvent } from "react";
import { signOut, useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import Card, { CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";

const leeresPasswortFormular = { aktuellesPasswort: "", neuesPasswort: "", wiederholung: "" };

export default function KontoPage() {
  const { update } = useSession();

  // Name
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [nameError, setNameError] = useState("");
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);

  // Passwort
  const [form, setForm] = useState(leeresPasswortFormular);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/user/konto")
      .then((r) => r.json())
      .then((data) => {
        setName(data.name ?? "");
        setEmail(data.email ?? "");
        setLoading(false);
      });
  }, []);

  async function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    setNameError("");
    setNameSuccess(false);
    setNameSaving(true);

    const res = await fetch("/api/user/konto", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setNameSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNameError(data.error || "Der Name konnte nicht gespeichert werden.");
      return;
    }

    // Sitzung neu laden, damit der neue Name sofort in der Seitenleiste steht. Erst ein
    // Argument macht daraus ein POST mit trigger "update"; der jwt-Callback liest den
    // Namen dann aus der Datenbank, der Inhalt des Arguments wird ignoriert.
    await update({});
    setNameSuccess(true);
  }

  function updateForm(field: keyof typeof leeresPasswortFormular, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (form.neuesPasswort !== form.wiederholung) {
      setError("Die beiden neuen Passwörter stimmen nicht überein.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/user/passwort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aktuellesPasswort: form.aktuellesPasswort,
        neuesPasswort: form.neuesPasswort,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Das Passwort konnte nicht geändert werden.");
      return;
    }

    // Der Passwortwechsel beendet alle Sitzungen, auch diese: neu anmelden
    setForm(leeresPasswortFormular);
    setSuccess(true);
    await signOut({ callbackUrl: "/login?passwortGeaendert=1" });
  }

  if (loading) {
    return <div className="text-gray-500">Lade Konto...</div>;
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="font-headline text-2xl font-bold text-primary case-ui">Mein Konto</h1>

      <Card>
        <CardHeader>
          <CardTitle>Name</CardTitle>
        </CardHeader>
        <form onSubmit={handleNameSubmit} className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameSuccess(false);
            }}
            required
            minLength={2}
            maxLength={100}
          />
          <p className="text-sm text-gray-600">
            E-Mail-Adresse (Login): <strong>{email}</strong>
            <br />
            Die E-Mail-Adresse kann nur ein Admin ändern.
          </p>

          {nameError && <p className="text-sm font-bold text-danger">{nameError}</p>}
          {nameSuccess && <p className="text-sm font-bold text-success">Dein Name wurde gespeichert.</p>}

          <Button type="submit" disabled={nameSaving}>
            {nameSaving ? "Wird gespeichert..." : "Name speichern"}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Passwort ändern</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Aktuelles Passwort"
            type="password"
            autoComplete="current-password"
            value={form.aktuellesPasswort}
            onChange={(e) => updateForm("aktuellesPasswort", e.target.value)}
            required
          />
          <Input
            label="Neues Passwort"
            hint="mindestens 12 Zeichen"
            type="password"
            autoComplete="new-password"
            value={form.neuesPasswort}
            onChange={(e) => updateForm("neuesPasswort", e.target.value)}
            required
            minLength={12}
          />
          <Input
            label="Neues Passwort wiederholen"
            type="password"
            autoComplete="new-password"
            value={form.wiederholung}
            onChange={(e) => updateForm("wiederholung", e.target.value)}
            required
          />

          {error && <p className="text-sm font-bold text-danger">{error}</p>}
          {success && (
            <p className="text-sm font-bold text-success">
              Dein Passwort wurde geändert. Du wirst jetzt abgemeldet und kannst dich mit dem neuen Passwort wieder anmelden.
            </p>
          )}

          <Button type="submit" disabled={saving}>
            {saving ? "Wird gespeichert..." : "Passwort ändern"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
