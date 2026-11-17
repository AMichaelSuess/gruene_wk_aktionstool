export type AuditEvent =
  | "EXPORT_ANMELDUNGEN"
  | "EXPORT_AKTIONEN"
  | "EXPORT_STATISTIK"
  | "ANMELDUNG_GELOESCHT"
  | "USER_ERSTELLT"
  | "USER_GEAENDERT"
  | "USER_GELOESCHT"
  | "AKTION_ENDGUELTIG_GELOESCHT";

type AuditValue = string | number | boolean | null | undefined | string[];

/**
 * Writes one JSON line per security-relevant action to stdout, where the
 * container platform keeps it, so it can later be traced who exported or
 * changed what and when (DSGVO accountability, incident scoping).
 *
 * Pass IDs, counts and field names only — never names, email addresses,
 * phone numbers, passwords or request bodies.
 */
export function audit(event: AuditEvent, actorId: string, details: Record<string, AuditValue> = {}) {
  console.info(
    JSON.stringify({ audit: true, event, actorId, at: new Date().toISOString(), ...details })
  );
}
