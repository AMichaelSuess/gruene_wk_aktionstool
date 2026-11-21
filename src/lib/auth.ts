import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./db";
import { authorizeCredentials } from "./credentials";

// Hoechstdauer einer Sitzung ab dem Login. Auth.js verlaengert das Cookie bei
// jeder Nutzung, ohne diese Grenze liefe eine Sitzung unbegrenzt.
export const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      authorize: (credentials, request) => authorizeCredentials(credentials, request),
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = user.role;
        token.teamIds = user.teamIds;
        token.sessionVersion = user.sessionVersion;
        token.loginAt = Date.now();
        token.lastChecked = Date.now();
      }

      // Feste Obergrenze, unabhaengig davon, wie oft die Sitzung genutzt wird
      if (Date.now() - ((token.loginAt as number | undefined) ?? 0) > MAX_SESSION_AGE_MS) {
        return null;
      }

      // Alle 5 Minuten User-Status, Rolle und Teams aus DB prüfen (SEC-04),
      // damit Herabstufungen, Team-Entzug und Passwortwechsel auch laufende
      // Sessions erreichen
      // trigger "update": die Person hat ihr Konto geaendert (z. B. den Namen), sofort neu laden
      const CHECK_INTERVAL = 5 * 60 * 1000; // 5 Minuten
      if (trigger === "update" || Date.now() - ((token.lastChecked as number | undefined) ?? 0) > CHECK_INTERVAL) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub! },
          select: {
            active: true,
            role: true,
            name: true,
            sessionVersion: true,
            teams: { select: { teamId: true } },
          },
        });
        // Session invalidiert: deaktivierter oder geloeschter Nutzer, oder das
        // Passwort wurde seit dem Login geaendert
        if (!dbUser || !dbUser.active || dbUser.sessionVersion !== token.sessionVersion) {
          return null;
        }
        token.role = dbUser.role;
        token.name = dbUser.name;
        token.teamIds = dbUser.teams.map((t) => t.teamId);
        token.lastChecked = Date.now();
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
        session.user.teamIds = (token.teamIds as string[]) ?? [];
      }
      return session;
    },
  },
});
