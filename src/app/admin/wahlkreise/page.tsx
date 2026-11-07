"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WAHLKREIS_LABEL, WAHLKREIS_LABEL_PLURAL } from "@/lib/wahlkreis-label";

interface Wahlkreis {
  id: string;
  nummer: number;
  name: string;
  _count: { teams: number; aktionen: number };
}

export default function WahlkreisePage() {
  const [wahlkreise, setWahlkreise] = useState<Wahlkreis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/wahlkreise")
      .then((r) => r.json())
      .then((data) => {
        setWahlkreise(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="text-gray-500">Lade {WAHLKREIS_LABEL_PLURAL}...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-headline text-2xl font-bold text-primary case-ui">{WAHLKREIS_LABEL_PLURAL}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {wahlkreise.map((wk) => (
          <div
            key={wk.id}
            className="bg-white rounded-card border-ui border-line p-4 shadow-ui"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-headline font-bold text-primary text-lg case-ui tracking-ui">
                  {WAHLKREIS_LABEL} {wk.nummer}
                </h3>
                <p className="text-sm text-gray-700 mt-1">{wk.name}</p>
              </div>
              <Link
                href={`/admin/wahlkreise/${wk.id}`}
                className="text-sm text-primary font-bold hover:underline"
              >
                Bearbeiten
              </Link>
            </div>
            <div className="flex gap-4 mt-3 text-sm text-gray-700 border-t-ui border-line pt-3">
              <span>👥 {wk._count.teams} Teams</span>
              <span>📋 {wk._count.aktionen} Aktionen</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
