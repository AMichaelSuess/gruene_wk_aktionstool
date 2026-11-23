import { auth } from "@/lib/auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { appOrigin, isCrossOriginWrite } from "@/lib/same-origin";

// Seiten des internen Bereichs, die nur Admins oeffnen duerfen. Alle anderen
// (Aktionen, Statistik, Benutzer*innen-Liste, Konto) sehen auch Expert*innen;
// die Daten dort sind auf die eigenen Teams eingeschraenkt, die APIs pruefen das selbst.
const ADMIN_ONLY_SECTIONS = ["/manage/teams", "/manage/districts"];

function isAdminOnlyPage(pathname: string) {
  return (
    ADMIN_ONLY_SECTIONS.some((s) => pathname === s || pathname.startsWith(`${s}/`)) ||
    // Benutzer*innen anlegen und bearbeiten (/manage/users/new, /manage/users/[id])
    pathname.startsWith("/manage/users/")
  );
}

const pageGuard = auth((req) => {
  const { pathname } = req.nextUrl;

  // The internal area requires a session (EXPERT or ADMIN)
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (req.auth.user.role !== "ADMIN" && isAdminOnlyPage(pathname)) {
    return NextResponse.redirect(new URL("/manage/actions", req.url));
  }

  return NextResponse.next();
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    // Schreibende Anfragen nur von der eigenen Seite (Schutz gegen CSRF von
    // anderen Subdomains derselben Domain; die APIs pruefen Rechte selbst)
    if (isCrossOriginWrite(req.method, req.headers.get("origin"), appOrigin(req.nextUrl.origin))) {
      return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
    }
    return NextResponse.next();
  }
  return pageGuard(req, event as never);
}

export const config = {
  matcher: ["/manage/:path*", "/api/:path*"],
};
