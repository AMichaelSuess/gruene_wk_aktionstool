"use client";

import { useRouter } from "next/navigation";

interface SelectionBarProps {
  selectedIds: string[];
  aktionTitles: Map<string, string>;
}

export default function SelectionBar({ selectedIds, aktionTitles }: SelectionBarProps) {
  const router = useRouter();

  function handleAnmelden() {
    router.push(`/anmelden?aktionen=${selectedIds.join(",")}`);
  }

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 bg-bar border-t-ui-thick border-line shadow-ui-up z-50 transition-transform duration-300 ${
        selectedIds.length > 0 ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={selectedIds.length === 0}
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Counter + chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-headline font-bold text-bar-ink case-ui text-xl leading-tight">
              {selectedIds.length} Aktion{selectedIds.length !== 1 ? "en" : ""} ausgewählt
            </span>
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {selectedIds.map((id) => (
                <span
                  key={id}
                  className="rounded-badge text-xs bg-primary text-white px-2 py-1 font-bold case-ui tracking-ui border-badge border-line"
                >
                  {aktionTitles.get(id) || id}
                </span>
              ))}
            </div>
          </div>

          {/* CTA button */}
          <button
            onClick={handleAnmelden}
            className="w-full sm:w-auto shrink-0 rounded-button bg-cta text-cta-ink hover:bg-cta-hover font-headline font-bold case-ui text-base px-6 py-3 border-ui border-line shadow-ui hover:shadow-ui-sm hover:press-sm active:shadow-none active:press transition-all focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus"
          >
            Jetzt anmelden →
          </button>
        </div>
      </div>
    </div>
  );
}
