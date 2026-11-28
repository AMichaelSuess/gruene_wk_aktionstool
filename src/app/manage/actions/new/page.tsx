"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Card, { CardHeader, CardTitle } from "@/components/ui/Card";
import ExcelUpload from "@/components/ExcelUpload";
import { KATEGORIEN } from "@/lib/kategorien";
import { WAHLKREIS_LABEL, formatWahlkreis } from "@/lib/wahlkreis-label";
import TeamAuswahl from "@/components/TeamAuswahl";
import PageHeader from "@/components/PageHeader";

interface Wahlkreis {
  id: string;
  nummer: number;
  name: string;
}

interface Team {
  id: string;
  name: string;
}

export default function NewAktionPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [wahlkreise, setWahlkreise] = useState<Wahlkreis[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"manual" | "excel">("manual");

  const [form, setForm] = useState({
    titel: "",
    datum: "",
    startzeit: "",
    endzeit: "",
    adresse: "",
    wahlkreisId: "",
    kategorie: "",
    ansprechpersonName: "",
    ansprechpersonEmail: "",
    ansprechpersonTelefon: "",
    maxTeilnehmer: "",
  });
  // null = noch nichts ausgewählt (dann gilt die Vorauswahl unten)
  const [chosenTeamIds, setTeamIds] = useState<string[] | null>(null);

  useEffect(() => {
    fetch("/api/districts")
      .then((r) => r.json())
      .then(setWahlkreise);
  }, []);

  const ownTeamIds = session?.user.teamIds;
  const isAdmin = session?.user.role === "ADMIN";

  useEffect(() => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data: Team[]) => setTeams(data));
  }, []);

  // Experts mit genau einem Team: eigenes Team ist vorausgewählt
  const teamIds =
    chosenTeamIds ?? (!isAdmin && ownTeamIds?.length === 1 ? [ownTeamIds[0]] : []);

  function updateForm(field: string, value: string) {
    setForm({ ...form, [field]: value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!isAdmin && teams.length > 0 && teamIds.length === 0) {
      setError("Bitte wähle mindestens ein Team aus.");
      setLoading(false);
      return;
    }

    const body = {
      ...form,
      teamIds,
      maxTeilnehmer: form.maxTeilnehmer ? parseInt(form.maxTeilnehmer) : null,
    };

    const res = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      router.push("/manage/actions");
    } else {
      const data = await res.json();
      setError(data.error || "Fehler beim Erstellen");
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Neue Aktion" />

      {/* Tab Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("manual")}
          className={`rounded-button px-4 py-2 font-bold text-sm case-ui tracking-ui border-ui border-line transition-all ${
            tab === "manual"
              ? "bg-primary text-white shadow-ui-sm"
              : "bg-white text-ink shadow-ui hover:shadow-ui-sm hover:press-sm hover:bg-hover"
          }`}
        >
          Manuell anlegen
        </button>
        <button
          onClick={() => setTab("excel")}
          className={`rounded-button px-4 py-2 font-bold text-sm case-ui tracking-ui border-ui border-line transition-all ${
            tab === "excel"
              ? "bg-primary text-white shadow-ui-sm"
              : "bg-white text-ink shadow-ui hover:shadow-ui-sm hover:press-sm hover:bg-hover"
          }`}
        >
          Excel-Import
        </button>
      </div>

      {tab === "manual" ? (
        <Card>
          <CardHeader>
            <CardTitle>Aktion anlegen</CardTitle>
          </CardHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Titel"
              value={form.titel}
              onChange={(e) => updateForm("titel", e.target.value)}
              required
              placeholder="z.B. Infostand Alexanderplatz"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Datum"
                type="date"
                value={form.datum}
                onChange={(e) => updateForm("datum", e.target.value)}
                required
              />
              <Input
                label="Startzeit"
                type="time"
                value={form.startzeit}
                onChange={(e) => updateForm("startzeit", e.target.value)}
                required
              />
              <Input
                label="Endzeit"
                type="time"
                value={form.endzeit}
                onChange={(e) => updateForm("endzeit", e.target.value)}
                required
              />
            </div>

            <Input
              label="Adresse"
              value={form.adresse}
              onChange={(e) => updateForm("adresse", e.target.value)}
              required
              placeholder="Straße Nr., PLZ Berlin"
            />

            <Select
              label={WAHLKREIS_LABEL}
              value={form.wahlkreisId}
              onChange={(e) => updateForm("wahlkreisId", e.target.value)}
              options={wahlkreise.map((wk) => ({
                value: wk.id,
                label: formatWahlkreis(wk),
              }))}
              placeholder="Bitte wählen"
            />

            <Select
              label="Art der Aktion"
              value={form.kategorie}
              onChange={(e) => updateForm("kategorie", e.target.value)}
              options={KATEGORIEN}
              placeholder="Bitte wählen"
              required
            />

            <TeamAuswahl
              teams={teams}
              value={teamIds}
              onChange={setTeamIds}
              ownTeamIds={ownTeamIds}
              isAdmin={isAdmin}
            />

            <div className="border-t-ui border-line pt-4 mt-4">
              <h3 className="font-headline font-bold case-ui tracking-ui text-ink mb-3">Ansprechperson</h3>
              <div className="space-y-4">
                <Input
                  label="Name"
                  value={form.ansprechpersonName}
                  onChange={(e) => updateForm("ansprechpersonName", e.target.value)}
                  required
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="E-Mail"
                    type="email"
                    value={form.ansprechpersonEmail}
                    onChange={(e) => updateForm("ansprechpersonEmail", e.target.value)}
                    required
                  />
                  <Input
                    label="Telefon"
                    type="tel"
                    value={form.ansprechpersonTelefon}
                    onChange={(e) => updateForm("ansprechpersonTelefon", e.target.value)}
                    required
                  />
                </div>
                <p className="text-sm text-gray-600">
                  An diese E-Mail-Adresse schicken wir jeden Tag eine Übersicht mit Namen und Kontaktdaten
                  aller Angemeldeten. Bitte prüfe sie genau.
                </p>
              </div>
            </div>

            <Input
              label="Max. Teilnehmer (optional)"
              type="number"
              value={form.maxTeilnehmer}
              onChange={(e) => updateForm("maxTeilnehmer", e.target.value)}
              min="1"
              placeholder="Unbegrenzt"
            />

            {error && (
              <div className="rounded-control border-ui border-line bg-red-50 text-red-600 p-3 text-sm shadow-ui-sm">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={loading}>
                Aktion erstellen
              </Button>
              <Button variant="ghost" type="button" onClick={() => router.back()}>
                Abbrechen
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <ExcelUpload
          teams={teams}
          teamIds={teamIds}
          onTeamIdsChange={setTeamIds}
          ownTeamIds={ownTeamIds}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
