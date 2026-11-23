import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_DIST_DIR, E2E_PORT, e2eEnv } from "./e2e/env";

/**
 * End-to-end tests against a production build with its own database.
 * `npm run e2e` resets the E2E database, builds into .next-e2e and starts
 * the app on port 3300, so a dev server on 3200 keeps running.
 */
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/smtp-sink.ts",
  // One server, one database and in-memory rate limits: run one test at a time
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E_BASE_URL,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "public", testMatch: /public\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "expert",
      testMatch: /expert\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/expert.json" },
    },
    {
      name: "admin",
      testMatch: /admin\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
    },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD
      ? `npx tsx e2e/prepare-db.ts && npx next start -p ${E2E_PORT}`
      : `npx tsx e2e/prepare-db.ts && npx next build && npx next start -p ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health`,
    env: { ...e2eEnv, NEXT_DIST_DIR: E2E_DIST_DIR },
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
