"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { WAHLKREIS_LABEL, WAHLKREIS_LABEL_PLURAL, WAHLKREIS_NUMMERN_ANZEIGEN } from "@/lib/wahlkreis-label";
import PageHeader from "@/components/PageHeader";

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
    fetch("/api/districts")
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
      <PageHeader title={WAHLKREIS_LABEL_PLURAL} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {wahlkreise.map((wk) => (
          <div
            key={wk.id}
            className="bg-white rounded-card border-ui border-line p-4 shadow-ui"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-headline font-bold text-primary text-lg case-ui tracking-ui">
                  {WAHLKREIS_LABEL} {WAHLKREIS_NUMMERN_ANZEIGEN ? wk.nummer : wk.name}
                </h3>
                {WAHLKREIS_NUMMERN_ANZEIGEN && <p className="text-sm text-gray-700 mt-1">{wk.name}</p>}
              </div>
              <Link href={`/manage/districts/${wk.id}`}>
                <Button variant="outline" size="sm">Bearbeiten</Button>
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
