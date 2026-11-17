/**
 * Konfigurationsprüfung beim Serverstart (src/instrumentation.ts)
 */
import { describe, it, expect } from "vitest";
import { checkConfig } from "@/lib/config-check";

const VALID = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  NEXTAUTH_URL: "https://aktionen.example.org",
  NEXTAUTH_SECRET: "x".repeat(32),
  CRON_SECRET: "y".repeat(32),
  SMTP_HOST: "smtp.example.org",
  EMAIL_FROM: "aktionen@example.org",
};

describe("checkConfig", () => {
  it("vollständige Konfiguration → keine Fehler, keine Warnungen", () => {
    expect(checkConfig(VALID)).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ["DATABASE_URL", undefined],
    ["NEXTAUTH_URL", undefined],
    ["NEXTAUTH_URL", "kein-url"],
    ["NEXTAUTH_SECRET", "zu-kurz"],
    ["CRON_SECRET", undefined],
    ["CRON_SECRET", "z".repeat(31)],
  ])("%s = %s → Fehler", (key, value) => {
    const { errors } = checkConfig({ ...VALID, [key]: value });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(key);
  });

  it("AUTH_SECRET reicht statt NEXTAUTH_SECRET", () => {
    const { errors } = checkConfig({ ...VALID, NEXTAUTH_SECRET: undefined, AUTH_SECRET: "a".repeat(32) });
    expect(errors).toEqual([]);
  });

  it("leerer SMTP_HOST ist erlaubt, erzeugt aber eine Warnung", () => {
    const { errors, warnings } = checkConfig({ ...VALID, SMTP_HOST: "" });
    expect(errors).toEqual([]);
    expect(warnings[0]).toContain("SMTP_HOST");
  });
});
