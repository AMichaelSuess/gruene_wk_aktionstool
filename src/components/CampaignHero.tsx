import Link from "next/link";
import type { ReactNode } from "react";
import { wordmarkClass } from "@/components/BrandLogo";
import { districtConfig } from "@/lib/district-config";
import type { HeroConfig } from "@/lib/theme";

// Raster reicht weit genug nach links für sehr breite Bildschirme
const VIEW_LEFT = -4000;

/**
 * Kampagnen-Kopfbereich der Startseite (Leipziger OBM-Kampagne): Emerald mit
 * Pfeilen in der helleren Emerald-Abstufung, Wortmarke und Menü obenauf,
 * rechts randabfallend das Foto mit gelbgrünen Pfeilen. Laut Kampagnen-Manual
 * ist Gelbgrün nur für Pfeile auf Fotos vorgesehen. Das Pfeil-Raster aus der
 * Theme-Konfiguration setzt die Pfeile im Foto nahtlos fort.
 */
export default function CampaignHero({ hero, nav }: { hero: HeroConfig; nav: ReactNode }) {
  const { heroTitle, heroText, orgShortName } = districtConfig;
  const { photo, width, height, arrowPeriod, arrowTipX, arrowTipY } = hero;
  const stroke = hero.arrowBandWidth / Math.SQRT2;
  const arrowsLeftOfPhoto = Math.ceil(-VIEW_LEFT / arrowPeriod) + 1;
  const arrowTips = Array.from(
    { length: arrowsLeftOfPhoto + Math.ceil(width / arrowPeriod) + 1 },
    (_, i) => arrowTipX + arrowPeriod * (i - arrowsLeftOfPhoto),
  );

  return (
    <header className="relative overflow-hidden bg-primary text-white">
      {/* Die Höhe des Kopfbereichs bestimmt den Maßstab; das Foto sitzt am rechten Rand */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        viewBox={`${VIEW_LEFT} 0 ${width - VIEW_LEFT} ${height}`}
        preserveAspectRatio="xMaxYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {arrowTips.map((x) => (
          <path
            key={x}
            d={`M${x - 2 * height} ${arrowTipY - 2 * height} L${x} ${arrowTipY} L${x - 2 * height} ${arrowTipY + 2 * height}`}
            fill="none"
            strokeWidth={stroke}
            strokeLinejoin="miter"
            className="stroke-primary-hover"
          />
        ))}
        {photo && (
          <image
            href={photo}
            x="0"
            y="0"
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid slice"
            className="hidden lg:inline"
          />
        )}
      </svg>

      <div className="relative max-w-7xl mx-auto px-4 sm:h-64 flex flex-col">
        <div className="py-3 flex items-center justify-between lg:justify-start lg:gap-8">
          <Link href="/">
            <span className={`font-headline font-bold text-lg ${wordmarkClass}`}>{orgShortName}</span>
            <span className="hidden sm:inline text-sm text-white/70 ml-2">Wahlkampfaktionen</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">{nav}</nav>
        </div>
        <div className="flex-1 pt-4 pb-8 flex flex-col justify-center gap-3 lg:max-w-[calc(100%-32rem)]">
          <p className="font-headline font-black text-3xl md:text-5xl leading-none">{heroTitle}</p>
          {heroText && <p className="text-base md:text-lg max-w-xl">{heroText}</p>}
        </div>
      </div>
    </header>
  );
}
