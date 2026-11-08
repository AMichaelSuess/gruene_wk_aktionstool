"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import BrandLogo, { wordmarkClass } from "@/components/BrandLogo";
import CampaignHero from "@/components/CampaignHero";
import { districtConfig } from "@/lib/district-config";
import { theme } from "@/lib/theme";
import NavAuthSection from "./NavAuthSection";

/**
 * Header der öffentlichen Seiten. In Themes mit Kampagnen-Kopfbereich ersetzt
 * dieser auf der Startseite den Header.
 */
export default function PublicHeader({ session }: { session: Session | null }) {
  const pathname = usePathname();

  if (theme.hero && pathname === "/") {
    return <CampaignHero hero={theme.hero} nav={<NavAuthSection session={session} />} />;
  }

  return (
    <header className="bg-chrome text-white sticky top-0 z-50 border-b-ui-thick border-line">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <BrandLogo variant="onDark" size={36} />
          <div>
            <span className={`font-headline font-bold text-lg case-ui tracking-ui ${wordmarkClass}`}>
              {districtConfig.orgShortName}
            </span>
            <span className="hidden sm:inline text-sm text-white/70 ml-2">
              Wahlkampfaktionen
            </span>
          </div>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <NavAuthSection session={session} />
        </nav>
      </div>
    </header>
  );
}
