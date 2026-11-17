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
    team: { findMany: vi.fn(async () => []) },
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
  return new Request("http://localhost:3000/api/upload", { method: "POST", body: form });
}

beforeEach(async () => {
  vi.clearAllMocks();
  parseSpy.mockReturnValue(undefined);
  await mockAuth(EXPERT_TEAM_A);
});

describe("POST /api/upload: Grenzen", () => {
  it("Datei über 5 MB → 413, wird nicht eingelesen", async () => {
    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(upload(new Uint8Array(5 * 1024 * 1024 + 1)) as any);
    expect(res.status).toBe(413);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("Content-Length deutlich über 5 MB → 413 vor dem Einlesen", async () => {
    const { POST } = await import("@/app/api/upload/route");
    const req = new Request("http://localhost:3000/api/upload", {
      method: "POST",
      headers: { "content-length": String(50 * 1024 * 1024) },
      body: "x",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(413);
  });

  it("Keine .xlsx-Datei → 400", async () => {
    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(upload(await xlsxBuffer(), "aktionen.xls") as any);
    expect(res.status).toBe(400);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("Datei ist kein Zip → 400", async () => {
    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(upload(new TextEncoder().encode("kein excel"), "a.xlsx") as any);
    expect(res.status).toBe(400);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("Zip-Bombe (entpackt über 100 MB) → 413, wird nicht entpackt", async () => {
    const { POST } = await import("@/app/api/upload/route");
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
    const { POST } = await import("@/app/api/upload/route");
    parseSpy.mockReturnValue(Promise.resolve(Array.from({ length: 2001 }, () => ({}))));
    const res = await POST(upload(await xlsxBuffer()) as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("2000");
  });

  it("gültige kleine Datei wird eingelesen", async () => {
    const { POST } = await import("@/app/api/upload/route");
    parseSpy.mockReturnValue(Promise.resolve([]));
    const res = await POST(upload(await xlsxBuffer()) as any);
    expect(res.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledOnce();
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
