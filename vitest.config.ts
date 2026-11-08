import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // Tests import route modules lazily (`await import(...)`), so the first
    // import of a route (Next.js, Prisma, ExcelJS) counts towards the test's
    // timeout. That alone takes ~2.5 s and exceeded the 5 s default under
    // parallel load, failing the Docker build at random.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
