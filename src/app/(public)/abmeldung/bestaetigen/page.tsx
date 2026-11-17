"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface AktionInfo {
  titel: string;
  datum: string;
  startzeit: string;
}

type Status = "loading" | "ready" | "sending" | "done" | "invalid" | "error";

// Confirmation step for the unsubscribe link in emails. Unsubscribing only
// happens when a person clicks the button, never just by opening the link
// (mail scanners open every link in a mail).
function BestaetigenContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>(token ? "loading" : "invalid");
  const [aktion, setAktion] = useState<AktionInfo | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/anmeldungen/abmelden/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          setStatus(res.status === 404 || res.status === 400 ? "invalid" : "error");
          return;
        }
        setAktion(await res.json());
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  async function handleAbmelden() {
    setStatus("sending");
    try {
      const res = await fetch("/api/anmeldungen/abmelden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) setStatus("done");
      else if (res.status === 404 || res.status === 400) setStatus("invalid");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <div className="bg-white rounded-card border-ui border-line p-8 shadow-ui-brand-lg">
        {status === "loading" ? (
          <p className="text-ink">Lade…</p>
        ) : status === "invalid" ? (
          <>
            <p className="font-headline font-bold text-danger text-2xl case-ui mb-2">
              Abmeldung nicht möglich
            </p>
            <p className="text-ink mt-2">
              Der Abmelde-Link ist ungültig oder wurde bereits verwendet.
              Falls du dich von einer Aktion abmelden möchtest, wende dich
              bitte direkt an die Ansprechperson.
            </p>
          </>
        ) : status === "error" ? (
          <>
            <p className="font-headline font-bold text-danger text-2xl case-ui mb-2">
              Fehler
            </p>
            <p className="text-ink mt-2">
              Leider hat das nicht geklappt. Bitte versuche es später erneut.
            </p>
          </>
        ) : status === "done" ? (
          <>
            <p className="font-headline font-bold text-primary text-2xl case-ui mb-2">
              Erfolgreich abgemeldet
            </p>
            <p className="text-ink mt-2">
              Du wurdest erfolgreich von der Aktion abgemeldet.
              Vielen Dank für dein Interesse!
            </p>
          </>
        ) : (
          <>
            <p className="font-headline font-bold text-primary text-2xl case-ui mb-2">
              Von der Aktion abmelden?
            </p>
            {aktion && (
              <p className="text-ink mt-2">
                <strong>{aktion.titel}</strong>
                <br />
                {format(new Date(aktion.datum), "EEEE, d. MMMM yyyy", { locale: de })}, {aktion.startzeit} Uhr
              </p>
            )}
            <p className="text-ink mt-4 mb-6">
              Bitte klicke auf den Knopf, um dich abzumelden.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleAbmelden}
                disabled={status === "sending"}
                className="rounded-button bg-primary text-white text-lg font-bold px-6 py-3 border-ui border-line shadow-ui hover:shadow-none hover:press transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {status === "sending" ? "Wird abgemeldet …" : "Jetzt von der Aktion abmelden"}
              </button>
              <Link
                href="/"
                className="rounded-button bg-white text-ink font-bold px-6 py-3 border-ui border-line shadow-ui hover:shadow-none hover:press transition-all inline-block"
              >
                Abbrechen
              </Link>
            </div>
          </>
        )}
        {(status === "done" || status === "invalid" || status === "error") && (
          <Link
            href="/"
            className="mt-6 inline-block text-primary hover:underline font-bold"
          >
            ← Zurück zur Aktionsübersicht
          </Link>
        )}
      </div>
    </div>
  );
}

export default function AbmeldungBestaetigenPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-12 text-center">Lade…</div>}>
      <BestaetigenContent />
    </Suspense>
  );
}
