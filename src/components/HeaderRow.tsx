"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { wordmarkClass } from "@/components/BrandLogo";
import NavIcon, { type NavIconName } from "@/components/NavIcon";
import { districtConfig } from "@/lib/district-config";

export interface HeaderLink {
  href: string;
  label: string;
  // Kuerzere Beschriftung unterhalb von md, falls die normale zu lang ist
  mobileLabel?: string;
  // Ersatz fuer die Beschriftung, wenn selbst der Kurzname sonst nicht in die Zeile passt
  icon: NavIconName;
}

interface Props {
  className: string;
  // Vor der Marke, z. B. der Menue-Button im internen Bereich
  start?: ReactNode;
  brandHref: string;
  logo?: ReactNode;
  nameClass: string;
  // Zusatz hinter dem Namen, z. B. "Wahlkampfaktionen" (nur auf breiten Bildschirmen)
  subtitle?: ReactNode;
  link?: HeaderLink;
}

// Stufen, von der ausfuehrlichsten zur knappsten: [Name, Link]
const LEVELS = [
  ["full", "text"],
  ["short", "text"],
  ["short", "icon"],
] as const;

/**
 * Zeile mit Marke und Link in den Kopfzeilen fester Hoehe (h-16). Zeigt den vollen
 * Namen; passt er neben dem Link nicht in die Zeile (schmales Handy, langer Name),
 * erst den Kurznamen, als letztes Mittel statt der Link-Beschriftung ein Icon.
 */
export default function HeaderRow({ className, start, brandHref, logo, nameClass, subtitle, link }: Props) {
  const [level, setLevel] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const name = nameRef.current;
    if (!row || !name) return;
    const check = () => {
      // Jede Stufe kurz direkt im DOM einstellen und messen. Das passiert synchron
      // vor dem Zeichnen; danach stellt React die gewaehlte Stufe dar.
      const parts = [...row.querySelectorAll<HTMLElement>("[data-fit]")];
      const saved = parts.map((p) => p.className);
      let fitting = LEVELS.length - 1;
      for (let i = 0; i < LEVELS.length; i++) {
        for (const p of parts) {
          p.className = p.dataset.fit!.split(" ").includes(String(i)) ? p.dataset.fitClass! : "hidden";
        }
        if (name.offsetHeight <= row.clientHeight) {
          fitting = i;
          break;
        }
      }
      parts.forEach((p, i) => (p.className = saved[i]));
      setLevel(fitting);
    };
    check();
    // Zeile: Bildschirmbreite; Name: nachgeladene Schrift aendert seine Breite
    const observer = new ResizeObserver(check);
    observer.observe(row);
    observer.observe(name);
    return () => observer.disconnect();
  }, []);

  // Teil, der nur auf den angegebenen Stufen sichtbar ist
  const fit = (variant: string, base: string) => {
    const levels = LEVELS.flatMap(([n, l], i) => (n === variant || l === variant ? [i] : []));
    return {
      "data-fit": levels.join(" "),
      "data-fit-class": base,
      className: levels.includes(level) ? base : "hidden",
    };
  };

  return (
    <div ref={rowRef} className={className}>
      <div className="flex items-center gap-3">
        {start}
        <Link href={brandHref} className="flex items-center gap-2">
          {logo}
          <div ref={nameRef}>
            <span {...fit("full", `${nameClass} ${wordmarkClass}`)}>{districtConfig.orgFullName}</span>
            <span {...fit("short", `${nameClass} ${wordmarkClass}`)}>{districtConfig.orgShortName}</span>
            {subtitle}
          </div>
        </Link>
      </div>
      {link && (
        <Link
          href={link.href}
          aria-label={link.label.replace(/\s*→$/, "")}
          title={LEVELS[level][1] === "icon" ? link.label.replace(/\s*→$/, "") : undefined}
          className="shrink-0 text-right text-sm font-medium text-white/70 hover:text-white transition-colors"
        >
          <span {...fit("text", "block max-w-24 md:max-w-none")}>
            {link.mobileLabel ? (
              <>
                <span className="md:hidden">{link.mobileLabel}</span>
                <span className="hidden md:inline">{link.label}</span>
              </>
            ) : (
              link.label
            )}
          </span>
          <span {...fit("icon", "block p-2 -mr-2")}>
            <NavIcon name={link.icon} />
          </span>
        </Link>
      )}
    </div>
  );
}
