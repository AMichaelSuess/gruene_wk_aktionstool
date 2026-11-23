/**
 * Sicherheitstests: Grenzen für den Excel-Import
 *
 * Eine sehr große Datei, eine Zip-Bombe oder zehntausende Zeilen dürfen den
 * Server nicht lahmlegen. Geocoding hält sich an Nominatims 1 Anfrage/Sekunde.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ExcelJS from "exceljs";
import { mockAuth, EXPERT_TEAM_A } from "./helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    wahlkreis: { findMany: vi.fn(async () => []) },
    team: { findMany: vi.fn(async () => []), count: vi.fn(async () => 1) },
    aktion: { findFirst: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/geocoding", () => ({ geocodeAddress: vi.fn() }));

const parseSpy = vi.fn();
vi.mock("@/lib/excel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/excel")>();
  return {
    ...actual,
    parseExcelFile: (buf: ArrayBuffer) => parseSpy(buf) ?? actual.parseExcelFile(buf),
  };
});

async function xlsxBuffer(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Aktionen").addRow(["Titel", "Datum"]);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer).slice().buffer;
}

function upload(content: BlobPart, name = "aktionen.xlsx") {
  const form = new FormData();
  form.append("file", new File([content], name));
  return new Request("http://localhost:3000/api/actions/import", { method: "POST", body: form });
}

beforeEach(async () => {
  vi.clearAllMocks();
  parseSpy.mockReturnValue(undefined);
  await mockAuth(EXPERT_TEAM_A);
});

describe("POST /api/actions/import: Grenzen", () => {
  it("Datei über 5 MB → 413, wird nicht eingelesen", async () => {
    const { POST } = await import("@/app/api/actions/import/route");
    const res = await POST(upload(new Uint8Array(5 * 1024 * 1024 + 1)) as any);
    expect(res.status).toBe(413);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("Content-Length deutlich über 5 MB → 413 vor dem Einlesen", async () => {
    const { POST } = await import("@/app/api/actions/import/route");
    const req = new Request("http://localhost:3000/api/actions/import", {
      method: "POST",
      headers: { "content-length": String(50 * 1024 * 1024) },
      body: "x",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(413);
  });

  it("Keine .xlsx-Datei → 400", async () => {
    const { POST } = await import("@/app/api/actions/import/route");
    const res = await POST(upload(await xlsxBuffer(), "aktionen.xls") as any);
    expect(res.status).toBe(400);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("Datei ist kein Zip → 400", async () => {
    const { POST } = await import("@/app/api/actions/import/route");
    const res = await POST(upload(new TextEncoder().encode("kein excel"), "a.xlsx") as any);
    expect(res.status).toBe(400);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("Zip-Bombe (entpackt über 100 MB) → 413, wird nicht entpackt", async () => {
    const { POST } = await import("@/app/api/actions/import/route");
    const buf = await xlsxBuffer();

    // Im Zentralverzeichnis die entpackte Größe des ersten Eintrags auf 200 MB setzen
    const view = new DataView(buf);
    let eocd = buf.byteLength - 22;
    while (view.getUint32(eocd, true) !== 0x06054b50) eocd--;
    const cd = view.getUint32(eocd + 16, true);
    view.setUint32(cd + 24, 200 * 1024 * 1024, true);

    const res = await POST(upload(buf) as any);
    expect(res.status).toBe(413);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("mehr als 2000 Zeilen → 400", async () => {
    const { POST } = await import("@/app/api/actions/import/route");
    parseSpy.mockReturnValue(Promise.resolve(Array.from({ length: 2001 }, () => ({}))));
    const res = await POST(upload(await xlsxBuffer()) as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("2000");
  });

  it("gültige kleine Datei wird eingelesen", async () => {
    const { POST } = await import("@/app/api/actions/import/route");
    parseSpy.mockReturnValue(Promise.resolve([]));
    const res = await POST(upload(await xlsxBuffer()) as any);
    expect(res.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledOnce();
  });

  it("Import sucht höchstens 100 verschiedene Adressen (Geocoding-Warteschlange bleibt frei)", async () => {
    const { POST } = await import("@/app/api/actions/import/route");
    const { prisma } = await import("@/lib/db");
    const { geocodeAddress } = await import("@/lib/geocoding");
    (prisma.wahlkreis.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "wk-1", nummer: 1, name: "Mitte" }]);
    (prisma.aktion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.aktion.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (geocodeAddress as ReturnType<typeof vi.fn>).mockResolvedValue({ latitude: 52.5, longitude: 13.4, displayName: "" });

    parseSpy.mockReturnValue(
      Promise.resolve(
        Array.from({ length: 150 }, (_, i) => ({
          titel: `Aktion ${i}`,
          datum: "01.06.2099",
          startzeit: "10:00",
          endzeit: "12:00",
          adresse: `Teststraße ${i}`,
          wahlkreis: 1,
          kategorie: "INFOSTAND",
          ansprechpersonName: "Lara",
          ansprechpersonEmail: "lara@example.org",
          ansprechpersonTelefon: "030123456",
        }))
      )
    );

    const req = upload(await xlsxBuffer());
    const form = await req.formData();
    form.append("import", "true");
    const res = await POST(new Request("http://localhost:3000/api/actions/import", { method: "POST", body: form }) as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created).toBe(150);
    expect(geocodeAddress).toHaveBeenCalledTimes(100);
    expect(body.ohneKoordinaten).toBe(50);
    expect(body.message).toContain("Kartenpunkt");
  });
});

describe("xlsxUncompressedSize", () => {
  it("liefert für eine echte .xlsx eine plausible Größe", async () => {
    const { xlsxUncompressedSize } = await vi.importActual<typeof import("@/lib/excel")>("@/lib/excel");
    const size = xlsxUncompressedSize(await xlsxBuffer());
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(1024 * 1024);
  });
});

describe("Geocoding: höchstens 1 Anfrage pro Sekunde", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("drei gleichzeitige Aufrufe gehen im Abstand von ≥ 1,1 s an Nominatim", async () => {
    vi.useFakeTimers();
    const times: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        times.push(Date.now());
        return new Response("[]", { status: 200 });
      })
    );
    const { geocodeAddress } = await vi.importActual<typeof import("@/lib/geocoding")>("@/lib/geocoding");

    const all = Promise.all([geocodeAddress("a"), geocodeAddress("b"), geocodeAddress("c")]);
    await vi.advanceTimersByTimeAsync(5_000);
    await all;

    expect(times).toHaveLength(3);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1100);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(1100);
  });
});

describe("Geocoding: Zeitlimit und User-Agent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Anfrage hat ein Zeitlimit und einen User-Agent mit Kontakt-URL", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { geocodeAddress } = await vi.importActual<typeof import("@/lib/geocoding")>("@/lib/geocoding");

    await geocodeAddress("Alexanderplatz 1");

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(
      /^[A-Za-z0-9]+-Wahlkampf-App\/1\.0 \(\+https:\/\/\S+\)$/
    );
  });

  it("Zeitüberschreitung → null statt hängender Anfrage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timeout", "TimeoutError");
      })
    );
    const { geocodeAddress } = await vi.importActual<typeof import("@/lib/geocoding")>("@/lib/geocoding");
    expect(await geocodeAddress("Irgendwo")).toBeNull();
  });
});
