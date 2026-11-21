"use client";

import Link from "next/link";
import BrandLogo, { wordmarkClass } from "@/components/BrandLogo";
import { districtConfig } from "@/lib/district-config";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, type ReactNode } from "react";
import { WAHLKREIS_LABEL_PLURAL } from "@/lib/wahlkreis-label";
import NavIcon, { type NavIconName } from "@/components/NavIcon";

interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  // Weitere Pfade, bei denen der Eintrag als aktiv gilt (Unterseiten)
  activePrefix?: string;
}

interface NavSection {
  // Ohne Titel, wenn der einzige Eintrag schon sagt, worum es geht
  title?: string;
  items: NavItem[];
}

const aktionen: NavItem = { href: "/dashboard", label: "Aktionen", icon: "aktionen", activePrefix: "/dashboard/aktionen/" };
const statistik: NavItem = { href: "/admin", label: "Statistik", icon: "statistik" };
const benutzer: NavItem = { href: "/admin/users", label: "Benutzer*innen", icon: "benutzer", activePrefix: "/admin/users/" };

// Expert*innen: Statistik und Benutzer*innen zeigen nur die eigenen Teams
const expertSections: NavSection[] = [{ items: [aktionen, statistik, benutzer] }];

const adminSections: NavSection[] = [
  { items: [aktionen, statistik] },
  {
    title: "Verwaltung",
    items: [
      { href: "/admin/teams", label: "Teams", icon: "teams", activePrefix: "/admin/teams/" },
      { href: "/admin/wahlkreise", label: WAHLKREIS_LABEL_PLURAL, icon: "wahlkreise", activePrefix: "/admin/wahlkreise/" },
      benutzer,
    ],
  },
];

function isActive(item: NavItem, pathname: string) {
  return pathname === item.href || (!!item.activePrefix && pathname.startsWith(item.activePrefix));
}

const itemClass =
  "flex items-center gap-3 rounded-button px-3 py-2 text-sm font-bold case-ui tracking-ui transition-colors border-ui mb-1";
const idleItemClass = "text-ink border-transparent hover:border-line hover:shadow-ui-sm";

/**
 * Gemeinsames Layout des internen Bereichs (Dashboard und Verwaltung).
 * Eine Seitenleiste fuer alle Rollen; der Abschnitt "Verwaltung" erscheint
 * nur fuer Admins. Name, Rolle, "Mein Konto" und Abmelden stehen unten.
 */
export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: session } = useSession();

  const isAdmin = session?.user.role === "ADMIN";
  const sections = isAdmin ? adminSections : expertSections;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Feste Hoehe h-16, damit die Seitenleiste darunter exakt andocken kann */}
      <header className="bg-chrome text-white sticky top-0 z-50 h-16 border-b-ui-thick border-line">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden text-xl"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menü"
            >
              ☰
            </button>
            <Link href="/dashboard" className="flex items-center gap-2">
              <BrandLogo variant="onDark" size={36} />
              <div>
                <span className={`font-headline font-bold text-lg case-ui tracking-ui ${wordmarkClass}`}>
                  {districtConfig.orgShortName}
                </span>
                <span className="hidden sm:inline text-sm text-white/70 ml-2">
                  Interner Bereich
                </span>
              </div>
            </Link>
          </div>
          <Link
            href="/"
            className="hidden md:block text-sm font-medium text-white/70 hover:text-white transition-colors"
          >
            Öffentliche Seite ansehen →
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* Mobil: Seitenleiste liegt ueber dem Inhalt, Klick daneben schliesst sie */}
        {menuOpen && (
          <div
            className="md:hidden fixed inset-0 top-16 z-30 bg-ink/40"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside
          className={`${
            menuOpen ? "flex" : "hidden"
          } md:flex flex-col w-64 shrink-0 bg-white border-r-ui border-line p-4 fixed top-16 bottom-0 left-0 z-40 overflow-y-auto md:sticky md:z-auto md:h-[calc(100vh-4rem)]`}
        >
          <nav className="space-y-4">
            {sections.map((section, i) => (
              <div key={section.title ?? i}>
                {section.title && (
                  <p className="px-3 mb-2 text-xs font-bold case-ui tracking-ui text-ink/60">
                    {section.title}
                  </p>
                )}
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`${itemClass} ${
                      isActive(item, pathname)
                        ? "bg-primary text-white border-line shadow-ui-sm"
                        : idleItemClass
                    }`}
                  >
                    <NavIcon name={item.icon} />
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div className="mt-auto pt-4 border-t-ui border-line">
            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className={`md:hidden ${itemClass} ${idleItemClass}`}
            >
              <NavIcon name="oeffentlich" /> Öffentliche Seite ansehen
            </Link>
            {session && (
              <div className="px-3 my-3">
                <p className="text-sm font-bold text-ink break-words">{session.user.name}</p>
                <p className="text-xs text-ink/60">
                  Angemeldet als {isAdmin ? "Admin" : "Expert*in"}
                </p>
              </div>
            )}
            <Link
              href="/dashboard/konto"
              onClick={() => setMenuOpen(false)}
              className={`${itemClass} ${
                pathname === "/dashboard/konto"
                  ? "bg-primary text-white border-line shadow-ui-sm"
                  : idleItemClass
              }`}
            >
              <NavIcon name="konto" /> Mein Konto
            </Link>
            <button
              onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/" }); }}
              className={`${itemClass} ${idleItemClass} w-full text-left`}
            >
              <NavIcon name="abmelden" /> Abmelden
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
