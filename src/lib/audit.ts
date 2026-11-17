import crypto from "crypto";

export type AuditEvent =
  | "EXPORT_ANMELDUNGEN"
  | "EXPORT_AKTIONEN"
  | "EXPORT_STATISTIK"
  | "ANMELDUNG_GELOESCHT"
  | "USER_ERSTELLT"
  | "USER_GEAENDERT"
  | "USER_GELOESCHT"
  | "AKTION_ENDGUELTIG_GELOESCHT"
  | "AKTIONEN_IMPORTIERT"
  | "LOGIN_FEHLGESCHLAGEN"
  | "LOGIN_GESPERRT"
  | "ZUGRIFF_VERWEIGERT";

type AuditValue = string | number | boolean | null | undefined | string[];

/**
 * Writes one JSON line per security-relevant action to stdout, where the
 * container platform keeps it, so it can later be traced who exported or
 * changed what and when (DSGVO accountability, incident scoping).
 *
 * Pass IDs, counts and field names only — never names, email addresses,
 * phone numbers, passwords or request bodies. `actorId` is null when nobody
 * is logged in (e.g. a failed login).
 */
export function audit(event: AuditEvent, actorId: string | null, details: Record<string, AuditValue> = {}) {
  console.info(
    JSON.stringify({ audit: true, event, actorId, at: new Date().toISOString(), ...details })
  );
}

/**
 * Pseudonym for an email address in log lines: the first 16 hex characters of
 * an HMAC-SHA256 keyed with the session secret. Lines about the same address
 * can be matched, but the address cannot be read from the log, nor recovered
 * by hashing a list of known addresses without the secret.
 */
export function emailPseudonym(email: string): string {
  const key = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
  return crypto
    .createHmac("sha256", key)
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

/**
 * Logs an unexpected error behind a 500 response. Only the error type, the
 * Prisma error code and the first line of the message are written: Prisma's
 * full messages can quote the arguments of the failed call, including
 * personal data.
 */
export function logServerError(route: string, error: unknown) {
  const name = error instanceof Error ? error.name : typeof error;
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : undefined;
  const firstLine = error instanceof Error ? error.message.split("\n").find((l) => l.trim())?.trim() : undefined;
  console.error(
    JSON.stringify({
      serverError: true,
      route,
      at: new Date().toISOString(),
      name,
      ...(code ? { code } : {}),
      ...(firstLine ? { message: firstLine.slice(0, 200) } : {}),
    })
  );
}
