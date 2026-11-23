"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import AnmeldeFormular, { BEREITS_ANGEMELDET_HINWEIS } from "@/components/AnmeldeFormular";

interface Aktion {
  id: string;
  titel: string;
  datum: string;
  startzeit: string;
  endzeit: string;
  adresse: string;
  latitude: number | null;
  longitude: number | null;
  wahlkreis: { nummer: number; name: string };
  ansprechpersonName: string;
  maxTeilnehmer: number | null;
  status: string;
  _count: { anmeldungen: number };
}

function AnmeldenPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [aktionen, setAktionen] = useState<Aktion[]>([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  const initialIds = useMemo(() => {
    const param = searchParams.get("actions");
    return param ? param.split(",").filter(Boolean) : [];
  }, [searchParams]);

  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);

  useEffect(() => {
    fetch("/api/actions?public=true")
      .then((r) => r.json())
      .then((data: Aktion[]) => {
        setAktionen(data);
        setLoading(false);
      });
  }, []);

  const aktionTitles = useMemo(
    () => new Map(aktionen.map((a) => [a.id, a.titel])),
    [aktionen]
  );

  function removeAktion(id: string) {
    const next = selectedIds.filter((sid) => sid !== id);
    if (next.length === 0) {
      router.push("/");
    } else {
      setSelectedIds(next);
    }
  }

  function handleSuccess() {
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="bg-white rounded-card border-ui border-line p-8 shadow-ui-brand-lg">
          <p className="font-headline font-bold text-primary text-2xl case-ui mb-2">
            Anmeldung erfolgreich!
          </p>
          <p className="text-ink mt-2">
            Du erhältst in Kürze eine Bestätigungs-E-Mail.
          </p>
          <p className="text-ink mt-2">
            {BEREITS_ANGEMELDET_HINWEIS}
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-primary hover:underline font-bold"
          >
            ← Zurück zur Aktionsübersicht
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium mb-6"
      >
        ← Zurück zur Aktionsübersicht
      </Link>

      <h1 className="font-headline text-2xl md:text-3xl font-bold text-primary case-ui mb-6">
        Anmeldung
      </h1>

      {/* Selected actions summary */}
      <div className="rounded-card border-ui border-line p-4 mb-6 shadow-ui">
        <p className="text-sm font-bold case-ui tracking-ui text-ink mb-3">
          {selectedIds.length === 1
            ? "Du hast 1 Aktion ausgewählt:"
            : `Du hast ${selectedIds.length} Aktionen ausgewählt:`}
        </p>
        {loading ? (
          <p className="text-sm text-gray-400">Lade Aktionen...</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-badge text-xs bg-primary text-white px-2.5 py-1 border-badge border-line font-bold case-ui tracking-ui"
              >
                {aktionTitles.get(id) || id}
                <button
                  type="button"
                  onClick={() => removeAktion(id)}
                  className="ml-0.5 text-white/70 hover:text-white transition-colors focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus"
                  aria-label={`${aktionTitles.get(id) || id} entfernen`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Registration form */}
      <AnmeldeFormular
        selectedIds={selectedIds}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

export default function AnmeldenPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64 text-gray-400">
          Lade...
        </div>
      }
    >
      <AnmeldenPageContent />
    </Suspense>
  );
}
