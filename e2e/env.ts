/**
 * Environment of the E2E server and of the test helpers.
 *
 * Starts from the local .env (organisation, theme, secrets), but always
 * points at a separate database and never at a real mail server.
 */
import { existsSync } from "fs";

if (existsSync(".env")) process.loadEnvFile(".env");

export const E2E_PORT = 3300;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DIST_DIR = ".next-e2e";
// Served by e2e/smtp-sink.ts
export const E2E_SMTP_PORT = 3325;

function e2eDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt in .env");
  const url = new URL(process.env.DATABASE_URL);
  // Child processes of the E2E server already get the E2E URL as DATABASE_URL
  if (!url.pathname.endsWith("_e2e")) url.pathname = `${url.pathname.replace(/^\//, "")}_e2e`;
  return url.toString();
}

export const E2E_DATABASE_URL = e2eDatabaseUrl();

// prepare-db.ts wipes this database: refuse anything that is not a test database
if (!new URL(E2E_DATABASE_URL).pathname.endsWith("_e2e")) {
  throw new Error(`E2E-Datenbank muss auf "_e2e" enden: ${new URL(E2E_DATABASE_URL).pathname}`);
}

export const e2eEnv: Record<string, string> = {
  DATABASE_URL: E2E_DATABASE_URL,
  NEXTAUTH_URL: E2E_BASE_URL,
  AUTH_TRUST_HOST: "true",
  NEXT_DIST_DIR: E2E_DIST_DIR,
  // e2e/smtp-sink.ts: every mail fails at once and is logged as FEHLER in EmailLog
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(E2E_SMTP_PORT),
  SMTP_SECURE: "false",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  // Startup check in production mode requires these
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "e2e-secret-e2e-secret-e2e-secret-e2e",
  CRON_SECRET: process.env.CRON_SECRET || "e2e-cron-secret-e2e-cron-secret-e2e",
};
