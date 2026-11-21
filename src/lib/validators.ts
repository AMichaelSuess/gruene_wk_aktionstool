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

// Einzeiliger Freitext (Namen, Titel, Adressen) mit Laengengrenze
const einzeilig = (label: string, min: number, max: number, minMessage = `${label} muss mindestens ${min} Zeichen lang sein`) =>
  z
    .string()
    .trim()
    .min(min, minMessage)
    .max(max, `${label} darf höchstens ${max} Zeichen lang sein`)
    .regex(KEINE_STEUERZEICHEN, `${label} darf keine Zeilenumbrüche enthalten`);

// Team-IDs (cuids) in Formularen; bounded so a request cannot carry huge lists
const teamIdsSchema = z.array(z.string().max(40)).max(50, "Höchstens 50 Teams");

export const loginSchema = z.object({
  email: emailSchema(),
  password: z.string().min(1, "Bitte gib dein Passwort ein"),
});

export const userSchema = z.object({
  name: einzeilig("Name", 2, 100),
  email: emailSchema(),
  password: passwordSchema,
  role: z.enum(["ADMIN", "EXPERT"]),
  teamIds: teamIdsSchema.optional().default([]),
});

export const userUpdateSchema = z.object({
  id: z.string().min(1, "ID fehlt"),
  name: einzeilig("Name", 2, 100).optional(),
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
  name: einzeilig("Teamname", 2, 100),
  wahlkreisId: z.string().optional().nullable(),
});

export const aktionSchema = z.object({
  titel: einzeilig("Titel", 3, 200),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT"),
  startzeit: z.string().regex(/^\d{2}:\d{2}$/, "Startzeit im Format HH:MM"),
  endzeit: z.string().regex(/^\d{2}:\d{2}$/, "Endzeit im Format HH:MM"),
  adresse: einzeilig("Adresse", 5, 300),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  wahlkreisId: z.string().min(1, `Bitte ${WAHLKREIS_LABEL} auswählen`),
  kategorie: z.enum(KATEGORIE_VALUES, { error: "Bitte wähle eine Art der Aktion" }),
  ansprechpersonName: einzeilig("Name der Ansprechperson", 2, 100, "Name der Ansprechperson erforderlich"),
  ansprechpersonEmail: emailSchema(),
  ansprechpersonTelefon: einzeilig("Telefonnummer", 5, 50, "Telefonnummer erforderlich"),
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
  titel: einzeilig("Titel", 1, 200, "Titel fehlt"),
  datum: z.string().min(1, "Datum fehlt"),
  startzeit: z.string().regex(/^\d{2}:\d{2}$/, "Startzeit im Format HH:MM"),
  endzeit: z.string().regex(/^\d{2}:\d{2}$/, "Endzeit im Format HH:MM"),
  adresse: einzeilig("Adresse", 1, 300, "Adresse fehlt"),
  // Die Upload-Route ordnet Name oder Nummer aus der Datei vorher einem vorhandenen Eintrag zu
  wahlkreis: z.number({ error: `${WAHLKREIS_LABEL} fehlt oder ist unbekannt` }).int().positive(),
  kategorie: z.enum(KATEGORIE_VALUES, { error: `Kategorie fehlt oder ungültig (erlaubt: ${KATEGORIEN.map((k) => k.label).join(", ")})` }),
  ansprechpersonName: einzeilig("Name der Ansprechperson", 1, 100, "Ansprechperson Name fehlt"),
  ansprechpersonEmail: emailSchema("Ungültige E-Mail der Ansprechperson"),
  ansprechpersonTelefon: einzeilig("Telefonnummer", 1, 50, "Telefon der Ansprechperson fehlt"),
  maxTeilnehmer: z.number().int().positive().optional().nullable(),
  // Team-Namen aus der optionalen Spalte "Teams"; leer = Auswahl beim Hochladen
  teams: z.array(z.string().max(100)).max(50, "Höchstens 50 Teams").optional(),
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
  name: einzeilig("Name", 2, 100),
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
