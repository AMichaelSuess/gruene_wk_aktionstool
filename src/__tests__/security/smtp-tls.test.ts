/**
 * Sicherheitstests: SMTP nur verschlüsselt
 *
 * Ohne erzwungenes STARTTLS könnte ein Angreifer im Netz die Verschlüsselung
 * unterdrücken und SMTP-Passwort sowie Mail-Inhalte mitlesen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const createTransport = vi.fn(() => ({ sendMail: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("@/lib/db", () => ({ prisma: { emailLog: { create: vi.fn() } } }));

beforeEach(() => {
  vi.resetModules();
  createTransport.mockClear();
});

describe("SMTP-Transport", () => {
  it("Port 587 (SMTP_SECURE nicht gesetzt) → STARTTLS ist Pflicht, mindestens TLS 1.2", async () => {
    vi.stubEnv("SMTP_SECURE", "");
    await import("@/lib/email");
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: false, requireTLS: true, tls: { minVersion: "TLSv1.2" } })
    );
  });

  it("Port 465 (SMTP_SECURE=true) → direktes TLS", async () => {
    vi.stubEnv("SMTP_SECURE", "true");
    await import("@/lib/email");
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true, tls: { minVersion: "TLSv1.2" } })
    );
  });

  it("Zertifikatsprüfung bleibt aktiv", async () => {
    await import("@/lib/email");
    const options = (createTransport.mock.calls[0] as unknown[])[0] as { tls: Record<string, unknown> };
    expect(options.tls).not.toHaveProperty("rejectUnauthorized");
  });
});
