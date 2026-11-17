/**
 * Configuration checked once at server start (see src/instrumentation.ts).
 *
 * Returns the problems that must stop a production server from starting,
 * and warnings that are only logged. Missing values would otherwise fail
 * silently or dangerously: without NEXTAUTH_URL, unsubscribe links (with
 * valid tokens) would point to another server; without CRON_SECRET the cron
 * endpoints are locked.
 */
export function checkConfig(env: Record<string, string | undefined> = process.env) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!env.DATABASE_URL) errors.push("DATABASE_URL fehlt");

  const url = env.NEXTAUTH_URL;
  if (!url) {
    errors.push("NEXTAUTH_URL fehlt (Basis für alle Links in E-Mails)");
  } else {
    try {
      new URL(url);
    } catch {
      errors.push("NEXTAUTH_URL ist keine gültige URL");
    }
  }

  const secret = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    errors.push("NEXTAUTH_SECRET (oder AUTH_SECRET) fehlt oder ist kürzer als 32 Zeichen");
  }

  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) {
    errors.push("CRON_SECRET fehlt oder ist kürzer als 32 Zeichen");
  }

  // Allowed to be empty (no emails are sent), but worth a visible hint
  if (!env.SMTP_HOST) warnings.push("SMTP_HOST ist leer – es werden keine E-Mails versendet");
  if (!env.EMAIL_FROM) warnings.push("EMAIL_FROM fehlt – Absender ist der Standardwert");

  return { errors, warnings };
}
