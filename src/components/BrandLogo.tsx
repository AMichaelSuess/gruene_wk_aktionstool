import Image from "next/image";
import { theme } from "@/lib/theme";

interface BrandLogoProps {
  /** onDark: Header/Footer, onLight: helle Flächen wie die Login-Seite */
  variant: "onDark" | "onLight";
  size: number;
}

/** Logo des aktiven Themes; rendert nichts, wenn das Theme eine Wortmarke nutzt. */
export default function BrandLogo({ variant, size }: BrandLogoProps) {
  if (!theme.logo) return null;
  return (
    <Image src={theme.logo[variant]} alt="Sonnenblume" width={size} height={size} className="shrink-0" />
  );
}

/** Klassen für den Organisationsnamen: ohne Logo wird er zur Wortmarke in der Akzentfarbe. */
export const wordmarkClass = theme.logo ? "" : "text-accent";
