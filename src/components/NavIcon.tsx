// Strich-Icons fuer die Seitenleiste. Sie uebernehmen die Textfarbe (currentColor),
// damit sie auf jedem Hintergrund und in jedem Theme lesbar sind; Emojis haben
// feste Farben und verschwinden z. B. lila auf dunkelgruenem Grund.

export type NavIconName =
  | "aktionen"
  | "statistik"
  | "teams"
  | "wahlkreise"
  | "benutzer"
  | "konto"
  | "abmelden"
  | "oeffentlich";

const paths: Record<NavIconName, React.ReactNode> = {
  aktionen: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  statistik: (
    <>
      <path d="M3 3v18h18" />
      <path d="M8 17v-5M13 17V7M18 17v-8" />
    </>
  ),
  teams: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21v-1a6 6 0 0 1 12 0v1" />
      <path d="M16 4a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.7" />
    </>
  ),
  wahlkreise: (
    <>
      <path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  benutzer: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </>
  ),
  konto: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.2 18.5a7 7 0 0 1 11.6 0" />
    </>
  ),
  abmelden: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  oeffentlich: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20" />
    </>
  ),
};

export default function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="w-5 h-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
