import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { districtConfig } from "@/lib/district-config";
import PublicHeader from "./PublicHeader";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader session={session} />

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
