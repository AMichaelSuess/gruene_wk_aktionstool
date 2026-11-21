import { z } from "zod";
import { KATEGORIE_VALUES, KATEGORIEN } from "@/lib/kategorien";
import { WAHLKREIS_LABEL } from "@/lib/wahlkreis-label";

// E-Mail-Adressen werden immer getrimmt und kleingeschrieben gespeichert/verglichen,
// damit z. B. "Max@Domain.de" und "max@domain.de" als dieselbe Adresse behandelt werden
// (siehe: fehlende Anmeldungen in der "Meine Aktionen"-Übersichtsmail durch Groß-/Kleinschreibung).
const emailSchema = (message = "Bitte gib eine gültige E-Mail-Adresse ein") =>
  z.string().trim().toLowerCase().max(254, "E-Mail-Adresse ist zu lang").email(message);

// Passwords of managed accounts. bcrypt ignores everything after 72 bytes,
// so longer passwords would only seem stronger (umlauts count as 2 bytes).
const passwordSchema = z
  .string()
  .min(12, "Passwort muss mindestens 12 Zeichen lang sein")
  .refine((pw) => new TextEncoder().encode(pw).length <= 72, {
    message: "Passwort darf höchstens 72 Zeichen lang sein",
  });

// No line breaks or other control characters in public free-text names:
// they end up line by line in the Signal text export experts paste into chats.
const KEINE_STEUERZEICHEN = /^[^\p{Cc}]*$/u;

// Team-IDs (cuids) in Formularen; bounded so a request cannot carry huge lists
const teamIdsSchema = z.array(z.string().max(40)).max(50, "Höchstens 50 Teams");

export const loginSchema = z.object({
  email: emailSchema(),
  password: z.string().min(1, "Bitte gib dein Passwort ein"),
});

export const userSchema = z.object({
  name: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein"),
  email: emailSchema(),
  password: passwordSchema,
  role: z.enum(["ADMIN", "EXPERT"]),
  teamIds: teamIdsSchema.optional().default([]),
});

export const userUpdateSchema = z.object({
  id: z.string().min(1, "ID fehlt"),
  name: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein").optional(),
  email: emailSchema().optional(),
  password: passwordSchema.optional(),
  role: z.enum(["ADMIN", "EXPERT"]).optional(),
  active: z.boolean().optional(),
  teamIds: teamIdsSchema.optional(),
});

export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// Eigenen Namen aendern (alle eingeloggten Rollen)
export const kontoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name muss mindestens 2 Zeichen lang sein")
    .max(100, "Name darf höchstens 100 Zeichen lang sein")
    .regex(KEINE_STEUERZEICHEN, "Name darf keine Zeilenumbrüche enthalten"),
});

// Eigenes Passwort aendern (alle eingeloggten Rollen)
export const passwortAendernSchema = z
  .object({
    aktuellesPasswort: z.string().min(1, "Bitte gib dein aktuelles Passwort ein").max(200),
    neuesPasswort: passwordSchema,
  })
  .refine((d) => d.aktuellesPasswort !== d.neuesPasswort, {
    message: "Das neue Passwort muss sich vom aktuellen unterscheiden",
    path: ["neuesPasswort"],
  });

export const teamSchema = z.object({
  name: z.string().min(2, "Teamname muss mindestens 2 Zeichen lang sein"),
  wahlkreisId: z.string().optional().nullable(),
});

export const aktionSchema = z.object({
  titel: z.string().min(3, "Titel muss mindestens 3 Zeichen lang sein").max(200, "Titel darf höchstens 200 Zeichen lang sein"),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT"),
  startzeit: z.string().regex(/^\d{2}:\d{2}$/, "Startzeit im Format HH:MM"),
  endzeit: z.string().regex(/^\d{2}:\d{2}$/, "Endzeit im Format HH:MM"),
  adresse: z.string().min(5, "Adresse muss mindestens 5 Zeichen lang sein").max(300, "Adresse darf höchstens 300 Zeichen lang sein"),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  wahlkreisId: z.string().min(1, `Bitte ${WAHLKREIS_LABEL} auswählen`),
  kategorie: z.enum(KATEGORIE_VALUES, { error: "Bitte wähle eine Art der Aktion" }),
  ansprechpersonName: z.string().min(2, "Name der Ansprechperson erforderlich").max(100, "Name der Ansprechperson darf höchstens 100 Zeichen lang sein"),
  ansprechpersonEmail: emailSchema(),
  ansprechpersonTelefon: z.string().min(5, "Telefonnummer erforderlich").max(50, "Telefonnummer darf höchstens 50 Zeichen lang sein"),
  maxTeilnehmer: z.number().int().positive().optional().nullable(),
  // Fehlt das Feld beim Bearbeiten, bleibt die Team-Zuordnung unveraendert
  teamIds: teamIdsSchema.optional(),
}).refine(
  (data) => data.startzeit < data.endzeit,
  { message: "Endzeit muss nach der Startzeit liegen", path: ["endzeit"] }
).refine(
  (data) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString().split("T")[0];
    return data.datum >= tomorrowISO;
  },
  { message: "Datum muss in der Zukunft liegen (ab morgen)", path: ["datum"] }
);

export const anmeldungSchema = z.object({
  aktionIds: z
    .array(z.string().max(40))
    .min(1, "Bitte wähle mindestens eine Aktion")
    .max(100, "Bitte wähle höchstens 100 Aktionen auf einmal"),
  vorname: z
    .string()
    .trim()
    .min(2, "Vorname muss mindestens 2 Zeichen lang sein")
    .max(100, "Vorname darf höchstens 100 Zeichen lang sein")
    .regex(KEINE_STEUERZEICHEN, "Vorname darf keine Zeilenumbrüche enthalten"),
  nachname: z
    .string()
    .trim()
    .min(2, "Nachname muss mindestens 2 Zeichen lang sein")
    .max(100, "Nachname darf höchstens 100 Zeichen lang sein")
    .regex(KEINE_STEUERZEICHEN, "Nachname darf keine Zeilenumbrüche enthalten"),
  email: emailSchema(),
  telefon: z
    .string()
    .refine(
      (val) => !val || /^[\d\s+\-()\/]{6,20}$/.test(val),
      { message: "Bitte gib eine gültige Telefonnummer ein" }
    )
    .optional()
    .nullable(),
  signalName: z
    .string()
    .refine(
      (val) => !val || /^[a-zA-Z0-9_]{2,32}\.\d+$/.test(val),
      { message: "Bitte gib deinen Signal-Nutzernamen ein (Format: name.123)" }
    )
    .optional()
    .nullable(),
  datenschutz: z.literal(true, {
    error: "Du musst der Datenschutzerklärung zustimmen",
  }),
  honeypot: z.string().max(0).optional(),
}).refine(
  (data) => (data.telefon && data.telefon.length > 0) || (data.signalName && data.signalName.length > 0),
  { message: "Bitte gib eine Telefonnummer oder einen Signal-Nutzernamen an", path: ["telefon"] }
);

export const excelRowSchema = z.object({
  titel: z.string().min(1, "Titel fehlt").max(200, "Titel darf höchstens 200 Zeichen lang sein"),
  datum: z.string().min(1, "Datum fehlt"),
  startzeit: z.string().regex(/^\d{2}:\d{2}$/, "Startzeit im Format HH:MM"),
  endzeit: z.string().regex(/^\d{2}:\d{2}$/, "Endzeit im Format HH:MM"),
  adresse: z.string().min(1, "Adresse fehlt").max(300, "Adresse darf höchstens 300 Zeichen lang sein"),
  // Die Upload-Route ordnet Name oder Nummer aus der Datei vorher einem vorhandenen Eintrag zu
  wahlkreis: z.number({ error: `${WAHLKREIS_LABEL} fehlt oder ist unbekannt` }).int().positive(),
  kategorie: z.enum(KATEGORIE_VALUES, { error: `Kategorie fehlt oder ungültig (erlaubt: ${KATEGORIEN.map((k) => k.label).join(", ")})` }),
  ansprechpersonName: z.string().min(1, "Ansprechperson Name fehlt").max(100, "Name der Ansprechperson darf höchstens 100 Zeichen lang sein"),
  ansprechpersonEmail: emailSchema("Ungültige E-Mail der Ansprechperson"),
  ansprechpersonTelefon: z.string().min(1, "Telefon der Ansprechperson fehlt").max(50, "Telefonnummer darf höchstens 50 Zeichen lang sein"),
  maxTeilnehmer: z.number().int().positive().optional().nullable(),
  // Team-Namen aus der optionalen Spalte "Teams"; leer = Auswahl beim Hochladen
  teams: z.array(z.string()).optional(),
}).refine(
  (data) => data.startzeit < data.endzeit,
  { message: "Endzeit muss nach der Startzeit liegen", path: ["endzeit"] }
);

export const bulkKategorieSchema = z.object({
  ids: z
    .array(z.string().max(40))
    .min(1, "Bitte wähle mindestens eine Aktion")
    .max(1000, "Bitte wähle höchstens 1000 Aktionen auf einmal"),
  kategorie: z.enum(KATEGORIE_VALUES, { error: "Bitte wähle eine Art der Aktion" }),
});

export const wahlkreisUpdateSchema = z.object({
  id: z.string().min(1, "ID fehlt"),
  name: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein"),
  nummer: z.number().int().positive("Nummer muss eine positive ganze Zahl sein"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type AktionInput = z.infer<typeof aktionSchema>;
export type AnmeldungInput = z.infer<typeof anmeldungSchema>;
export type ExcelRowInput = z.infer<typeof excelRowSchema>;
export type BulkKategorieInput = z.infer<typeof bulkKategorieSchema>;
export type WahlkreisUpdateInput = z.infer<typeof wahlkreisUpdateSchema>;
