import { auth } from "@/lib/auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { appOrigin, isCrossOriginWrite } from "@/lib/same-origin";

// Admin-Seiten, die auch Expert*innen sehen duerfen (Daten dort auf die eigenen
// Teams eingeschraenkt; die APIs pruefen das selbst)
const EXPERT_ADMIN_PAGES = ["/admin", "/admin/users"];

const pageGuard = auth((req) => {
  const { pathname } = req.nextUrl;

  // Admin routes require ADMIN role
  if (pathname.startsWith("/admin")) {
    if (!req.auth) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (req.auth.user.role !== "ADMIN" && !EXPERT_ADMIN_PAGES.includes(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // Dashboard routes require authentication (EXPERT or ADMIN)
  if (pathname.startsWith("/dashboard")) {
    if (!req.auth) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
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
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/:path*"],
};
