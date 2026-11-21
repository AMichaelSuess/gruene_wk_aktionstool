import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./db";
import { authorizeCredentials } from "./credentials";

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
        token.lastChecked = Date.now();
      }

      // Alle 5 Minuten User-Status, Rolle und Teams aus DB prüfen (SEC-04),
      // damit Herabstufungen und Team-Entzug auch laufende Sessions erreichen
      // trigger "update": die Person hat ihr Konto geaendert (z. B. den Namen), sofort neu laden
      const CHECK_INTERVAL = 5 * 60 * 1000; // 5 Minuten
      if (trigger === "update" || Date.now() - ((token.lastChecked as number) ?? 0) > CHECK_INTERVAL) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub! },
          select: { active: true, role: true, name: true, teams: { select: { teamId: true } } },
        });
        if (!dbUser || !dbUser.active) {
          return null; // Session invalidiert — deaktivierter oder gelöschter Nutzer
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
