/**
 * Shared test function for all specs.
 *
 * Fails a test when the browser logs an error or throws, e.g. a hydration
 * mismatch or a failed fetch to a renamed API route. Those don't break the
 * visible page right away, so the assertions alone would miss them.
 * A test that expects an error (a 404 for an unknown token) names it in
 * `erlaubteFehler`.
 */
import { test as base, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "./env";

export const db = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

export const test = base.extend<{ erlaubteFehler: RegExp[]; browserErrors: string[] }>({
  erlaubteFehler: [[], { option: true }],
  browserErrors: [
    async ({ page, erlaubteFehler }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
      });
      await use(errors);
      const unerwartet = errors.filter((e) => !erlaubteFehler.some((re) => re.test(e)));
      expect(unerwartet, "Fehler in der Browser-Konsole").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
