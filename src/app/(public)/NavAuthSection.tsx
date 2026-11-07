"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useState } from "react";
import type { Session } from "next-auth";

interface Props {
  session: Session | null;
}

export default function NavAuthSection({ session }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) {
    return null;
  }

  const isAdmin = session.user.role === "ADMIN";

  return (
    <>
      {/* Desktop: inline links */}
      <div className="hidden md:flex items-center gap-3">
        <span className="text-white/70 text-xs">
          {session.user.name} &middot; {isAdmin ? "Admin" : "Expert*in"}
        </span>
        <Link href="/dashboard" className="hover:text-accent transition-colors font-medium text-sm">
          Dashboard
        </Link>
        {isAdmin && (
          <Link href="/admin" className="hover:text-accent transition-colors font-medium text-sm">
            Admin Panel
          </Link>
        )}
        <Link href="/" className="text-white/70 hover:text-white transition-colors text-sm">
          Zur Übersicht
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-white/70 hover:text-white transition-colors text-sm"
        >
          Abmelden
        </button>
      </div>

      {/* Mobile: hamburger button */}
      <button
        className="md:hidden text-xl leading-none"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Menü"
      >
        ☰
      </button>

      {/* Mobile: sidebar overlay (same style as dashboard) */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />
          {/* Sidebar */}
          <aside className="md:hidden fixed top-0 left-0 h-full w-64 bg-white border-r-ui border-line z-50 p-4 flex flex-col">
            {/* Header row inside sidebar */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b-ui border-line">
              <span className="text-xs font-bold case-ui tracking-ui text-ink/60">
                {session.user.name} &middot; {isAdmin ? "Admin" : "Expert*in"}
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                className="text-xl leading-none"
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>
            <nav className="space-y-1">
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-button px-3 py-2 text-sm font-bold case-ui tracking-ui border-ui border-transparent hover:border-line hover:shadow-ui-sm transition-colors text-ink mb-1"
              >
                <span>📋</span> Dashboard
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-button px-3 py-2 text-sm font-bold case-ui tracking-ui border-ui border-transparent hover:border-line hover:shadow-ui-sm transition-colors text-ink mb-1"
                >
                  <span>⚙️</span> Admin Panel
                </Link>
              )}
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-button px-3 py-2 text-sm font-bold case-ui tracking-ui border-ui border-transparent hover:border-line hover:shadow-ui-sm transition-colors text-ink mb-1"
              >
                <span>🌐</span> Zur Übersicht
              </Link>
              <button
                onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/" }); }}
                className="flex items-center gap-3 rounded-button px-3 py-2 text-sm font-bold case-ui tracking-ui border-ui border-transparent hover:border-line hover:shadow-ui-sm transition-colors text-ink w-full text-left mb-1"
              >
                <span>🚪</span> Abmelden
              </button>
            </nav>
          </aside>
        </>
      )}
    </>
  );
}
