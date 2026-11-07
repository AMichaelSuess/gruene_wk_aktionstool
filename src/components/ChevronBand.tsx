import { theme } from "@/lib/theme";

/**
 * Pfeil-Band ("Visuals" der Leipziger OBM-Kampagne): gelbgrüne Chevrons auf
 * Emerald. Rein dekorativ; erscheint nur, wenn das Theme es vorsieht.
 */
export default function ChevronBand() {
  if (!theme.chevrons) return null;
  return (
    <div aria-hidden="true" className="bg-primary h-10 overflow-hidden">
      <svg className="block w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="theme-chevrons" width="44" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M8 -4 L28 20 L8 44"
              fill="none"
              strokeWidth="8"
              strokeLinejoin="miter"
              className="stroke-accent"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#theme-chevrons)" />
      </svg>
    </div>
  );
}
