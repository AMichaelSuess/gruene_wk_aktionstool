"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function BestaetigenContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSend() {
    setStatus("sending");
    try {
      const res = await fetch(
        `/api/anmeldungen/meine-aktionen?email=${encodeURIComponent(email)}`
      );
      if (res.ok) {
        setStatus("sent");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <div className="bg-white rounded-card border-ui border-line p-8 shadow-ui-brand-lg">
        {!isValidEmail ? (
          <>
            <p className="font-headline font-bold text-danger text-2xl case-ui mb-2">
              Ungültige Anfrage
            </p>
            <p className="text-ink mt-2">
              Der Link ist ungültig. Bitte verwende den Link aus deiner
              Bestätigungs-E-Mail.
            </p>
          </>
        ) : status === "sent" ? (
          <>
            <p className="font-headline font-bold text-primary text-2xl case-ui mb-2">
              E-Mail wird gesendet
            </p>
            <p className="text-ink mt-2">
              Deine Aktionsübersicht wurde an <strong>{email}</strong> gesendet.
            </p>
          </>
        ) : status === "error" ? (
          <>
            <p className="font-headline font-bold text-danger text-2xl case-ui mb-2">
              Fehler beim Senden
            </p>
            <p className="text-ink mt-2">
              Leider konnte die E-Mail nicht gesendet werden. Bitte versuche es
              später erneut.
            </p>
          </>
        ) : (
          <>
            <p className="font-headline font-bold text-primary text-2xl case-ui mb-2">
              Übersicht anfordern
            </p>
            <p className="text-ink mt-2 mb-6">
              Soll eine Übersicht aller deiner Anmeldungen an{" "}
              <strong>{email}</strong> gesendet werden?
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleSend}
                disabled={status === "sending"}
                className="rounded-button bg-primary text-white font-bold px-6 py-3 border-ui border-line shadow-ui hover:shadow-none hover:press transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {status === "sending" ? "Wird gesendet …" : "E-Mail senden"}
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
        {(status === "sent" || status === "error" || !isValidEmail) && (
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

export default function MeineAktioneBestaetigenPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-12 text-center">Lade…</div>}>
      <BestaetigenContent />
    </Suspense>
  );
}
