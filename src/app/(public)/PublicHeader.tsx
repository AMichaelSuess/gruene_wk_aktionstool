"use client";

import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import BrandLogo from "@/components/BrandLogo";
import CampaignHero from "@/components/CampaignHero";
import HeaderRow, { type HeaderLink } from "@/components/HeaderRow";
import { theme } from "@/lib/theme";

/**
 * Header der öffentlichen Seiten. In Themes mit Kampagnen-Kopfbereich ersetzt
 * dieser auf der Startseite den Header.
 */
export default function PublicHeader({ session }: { session: Session | null }) {
  const pathname = usePathname();
  // Eingeloggte sehen nur den Wechsel in den internen Bereich, als Gegenstueck
  // zu "Oeffentliche Seite ansehen" im internen Bereich
  const link: HeaderLink | undefined = session
    ? { href: "/manage/actions", label: "Zum internen Bereich →", icon: "intern" }
    : undefined;

  if (theme.hero && pathname === "/") {
    return <CampaignHero hero={theme.hero} link={link} />;
  }

  return (
    // Gleiche feste Hoehe wie der Header im internen Bereich, damit beim Wechsel nichts springt
    <header className="bg-chrome text-white focus-chrome sticky top-0 z-50 h-16 border-b-ui-thick border-line">
      <HeaderRow
        className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between gap-4"
        brandHref="/"
        logo={<BrandLogo variant="onDark" size={36} />}
        nameClass="font-headline font-bold text-lg case-ui tracking-ui"
        subtitle={<span className="hidden sm:inline text-sm text-white/70 ml-2">Wahlkampfaktionen</span>}
        link={link}
      />
    </header>
  );
}
