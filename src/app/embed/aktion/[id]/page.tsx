"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AnmeldeFormular from "@/components/AnmeldeFormular";

export default function EmbedAktionPage() {
  const params = useParams();
  const aktionId = params.id as string;

  const [aktionTitle, setAktionTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [bereitsAngemeldet, setBereitsAngemeldet] = useState(false);

  useEffect(() => {
    const sendHeight = () => {
      const h = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: 'grn-actions-resize', height: h }, '*');
    };
    sendHeight();
    const ro = new ResizeObserver(sendHeight);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);


  useEffect(() => {
    if (!aktionId) return;

    fetch(`/api/aktionen/${aktionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.titel) setAktionTitle(data.titel);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [aktionId]);

  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        Aktion wird geladen…
      </div>
    );
  }

  if (!aktionTitle) {
    return (
      <div className="p-4 text-center text-red-600 font-bold case-ui text-sm">
        Aktion nicht gefunden
      </div>
    );
  }

  if (success) {
    return (
      <div className="p-6 rounded-card bg-primary text-white border-ui border-line shadow-ui">
        <h2 className="font-headline text-xl font-bold case-ui mb-2">
          Anmeldung erfolgreich!
        </h2>
        <p>Vielen Dank für deine Anmeldung. Du erhältst in Kürze eine Bestätigungs-E-Mail.</p>
      </div>
    );
  }

  if (bereitsAngemeldet) {
    return (
      <div className="p-6 rounded-card bg-white border-ui border-line shadow-ui">
        <h2 className="font-headline text-xl font-bold case-ui mb-2">
          Bereits angemeldet
        </h2>
        <p>Du bist für diese Aktion bereits registriert.</p>
      </div>
    );
  }


  return (
    <div className="p-4">
      <h2 className="font-headline text-xl md:text-2xl font-bold case-ui text-primary mb-4">
        Anmeldung
        <br />
        <span className="text-ink text-lg font-normal">{aktionTitle}</span>
      </h2>

      <AnmeldeFormular
        selectedIds={[aktionId]}
        onSuccess={(bereitsAngemeldetIds) => {
          if (bereitsAngemeldetIds?.includes(aktionId)) {
            setBereitsAngemeldet(true);
          } else {
            setSuccess(true);
          }
        }}
      />
    </div>
  );
}
