import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
    // Tests import route modules lazily (`await import(...)`), so the first
    // import of a route (Next.js, Prisma, ExcelJS) counts towards the test's
    // timeout. That alone takes ~2.5 s and exceeded the 5 s default under
    // parallel load, failing the Docker build at random.
    testTimeout: 30_000,
    // The code under test logs audit events and config warnings. Show that
    // output only for failing tests, so the build log stays readable.
    silent: "passed-only",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
