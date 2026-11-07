import BrandLogo, { wordmarkClass } from "@/components/BrandLogo";
import ChevronBand from "@/components/ChevronBand";
import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { districtConfig } from "@/lib/district-config";
import NavAuthSection from "./NavAuthSection";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <div className="min-h-screen flex flex-col">
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
      <ChevronBand />

      <main className="flex-1">{children}</main>

      <footer className="bg-chrome text-white/70 text-sm border-t-ui-thick border-line">
        <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="font-bold case-ui tracking-ui">{districtConfig.orgFullName}</p>
            <div className="flex gap-4">
              {!session && (
                <Link href="/login" className="hover:text-white transition-colors case-ui tracking-ui font-bold">
                  Login
                </Link>
              )}
              <Link href="/datenschutz" className="hover:text-white transition-colors case-ui tracking-ui font-bold">
                Datenschutz
              </Link>
              <Link href={districtConfig.impressumUrl} className="hover:text-white transition-colors case-ui tracking-ui font-bold">
                Impressum
              </Link>
            </div>
          </div>
          <p className="text-xs text-white/50 text-center">
            Weiterentwickelt von Michael Süß für {districtConfig.orgFullName} (
            <a
              href="https://github.com/AMichaelSuess/gruene_wk_aktionstool"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white transition-colors"
            >
              GitHub
            </a>
            ) auf Basis des Aktionstools von BÜNDNIS 90/DIE GRÜNEN Berlin-Mitte (
            <a
              href="https://github.com/maassfm/gruene_wk_aktionstool"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white transition-colors"
            >
              GitHub
            </a>
            )
          </p>
        </div>
      </footer>
    </div>
  );
}
