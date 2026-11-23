/**
 * Absagen und endgueltiges Loeschen einer Aktion sind getrennte Endpunkte:
 *
 * - POST /api/actions/[id]/cancel: Status ABGESAGT, Absage-Mail an alle
 *   Angemeldeten. Darf, wer Zugriff auf die Aktion hat (Team oder selbst angelegt).
 * - DELETE /api/actions/[id]: loescht ohne Mails. Nur Admins – auch die eigene
 *   Aktion darf eine Expert*in so nicht loeschen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockAuth, createRequest, ADMIN_SESSION, EXPERT_TEAM_A } from "./helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockPrisma = {
  aktion: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/email-templates", () => ({
  absageEmail: vi.fn(() => ({ subject: "Abgesagt", html: "" })),
  aenderungsEmail: vi.fn(() => ({ subject: "", html: "" })),
}));
vi.mock("@/lib/geocoding", () => ({ geocodeAddress: vi.fn() }));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const EIGENE_AKTION = {
  id: "eigene",
  titel: "Infostand",
  datum: new Date("2099-01-01"),
  startzeit: "10:00",
  endzeit: "12:00",
  adresse: "Markt 1",
  ansprechpersonName: "Anna",
  ansprechpersonEmail: "anna@test.de",
  ansprechpersonTelefon: "0170 1234567",
  createdById: "expert-a",
  teams: [{ teamId: "team-a" }],
  anmeldungen: [{ email: "eins@test.de" }, { email: "zwei@test.de" }],
};

const FREMDE_AKTION = { ...EIGENE_AKTION, id: "fremde", createdById: "expert-b", teams: [{ teamId: "team-b" }] };

async function absagen(id: string) {
  const { POST } = await import("@/app/api/actions/[id]/cancel/route");
  return POST(createRequest(`/api/actions/${id}/cancel`, { method: "POST" }) as any, params(id));
}

async function loeschen(id: string) {
  const { DELETE } = await import("@/app/api/actions/[id]/route");
  return DELETE(createRequest(`/api/actions/${id}`, { method: "DELETE" }) as any, params(id));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/actions/[id]/cancel", () => {
  it("ohne Login → 401, nichts geändert", async () => {
    await mockAuth(null);
    expect((await absagen("eigene")).status).toBe(401);
    expect(mockPrisma.aktion.update).not.toHaveBeenCalled();
  });

  it("Expert*in sagt eine Aktion des eigenen Teams ab: Status ABGESAGT, Mail an alle Angemeldeten", async () => {
    await mockAuth(EXPERT_TEAM_A);
    mockPrisma.aktion.findUnique.mockResolvedValue(EIGENE_AKTION);

    expect((await absagen("eigene")).status).toBe(200);
    expect(mockPrisma.aktion.update).toHaveBeenCalledWith({ where: { id: "eigene" }, data: { status: "ABGESAGT" } });
    expect(mockPrisma.aktion.delete).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "eins@test.de", typ: "ABSAGE" }));
  });

  it("Expert*in eines anderen Teams → 403, nichts geändert, keine Mail", async () => {
    await mockAuth(EXPERT_TEAM_A);
    mockPrisma.aktion.findUnique.mockResolvedValue(FREMDE_AKTION);

    expect((await absagen("fremde")).status).toBe(403);
    expect(mockPrisma.aktion.update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("unbekannte Aktion → 404", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.aktion.findUnique.mockResolvedValue(null);
    expect((await absagen("gibt-es-nicht")).status).toBe(404);
  });
});

describe("DELETE /api/actions/[id]", () => {
  it("Admin löscht endgültig, ohne Mails", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.aktion.findUnique.mockResolvedValue(EIGENE_AKTION);

    expect((await loeschen("eigene")).status).toBe(200);
    expect(mockPrisma.aktion.delete).toHaveBeenCalledWith({ where: { id: "eigene" } });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("Expert*in darf auch die eigene Aktion nicht löschen → 403", async () => {
    await mockAuth(EXPERT_TEAM_A);
    mockPrisma.aktion.findUnique.mockResolvedValue(EIGENE_AKTION);

    expect((await loeschen("eigene")).status).toBe(403);
    expect(mockPrisma.aktion.delete).not.toHaveBeenCalled();
    expect(mockPrisma.aktion.update).not.toHaveBeenCalled();
  });

  it("ohne Login → 401", async () => {
    await mockAuth(null);
    expect((await loeschen("eigene")).status).toBe(401);
    expect(mockPrisma.aktion.delete).not.toHaveBeenCalled();
  });

  it("unbekannte Aktion → 404", async () => {
    await mockAuth(ADMIN_SESSION);
    mockPrisma.aktion.findUnique.mockResolvedValue(null);
    expect((await loeschen("gibt-es-nicht")).status).toBe(404);
  });
});
