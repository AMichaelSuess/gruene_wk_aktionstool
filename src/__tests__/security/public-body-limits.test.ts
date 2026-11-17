/**
 * Sicherheitstests: Größenlimit und Rate-Limit für öffentliche Schreib-Endpunkte
 *
 * Jeder Endpunkt, der ohne Login einen Request-Body annimmt, muss zu große
 * Bodies ablehnen, bevor er sie vollständig einliest (sonst kann jede*r den
 * Speicher des einzigen Containers füllen). Kommt ein neuer öffentlicher
 * POST/PUT/PATCH-Endpunkt hinzu, gehört er in PUBLIC_ROUTES.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    aktion: { findUnique: vi.fn() },
    anmeldung: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    emailLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

interface PublicRoute {
  name: string;
  file: string;
  load: () => Promise<{ POST: (req: NextRequest) => Promise<Response> }>;
  limitBytes: number;
  rateLimitPerMinute?: number;
}

const PUBLIC_ROUTES: PublicRoute[] = [
  {
    name: "POST /api/anmeldungen",
    file: "anmeldungen/route.ts",
    load: () => import("@/app/api/anmeldungen/route"),
    limitBytes: 32 * 1024,
  },
  {
    name: "POST /api/anmeldungen/abmelden",
    file: "anmeldungen/abmelden/route.ts",
    load: () => import("@/app/api/anmeldungen/abmelden/route"),
    limitBytes: 1024,
    rateLimitPerMinute: 20,
  },
  {
    name: "POST /api/anmeldungen/abmelden/info",
    file: "anmeldungen/abmelden/info/route.ts",
    load: () => import("@/app/api/anmeldungen/abmelden/info/route"),
    limitBytes: 1024,
    rateLimitPerMinute: 20,
  },
];

let ipCounter = 0;
function request(url: string, body: string, headers: Record<string, string> = {}) {
  ipCounter++;
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `198.51.100.${ipCounter}`,
      ...headers,
    },
    body,
  });
}

describe.each(PUBLIC_ROUTES)("$name", (route) => {
  const url = "http://localhost/api/" + route.file.replace(/\/?route\.ts$/, "");

  it("Body über dem Limit → 413", async () => {
    const { POST } = await route.load();
    const body = JSON.stringify({ token: "a".repeat(route.limitBytes) });
    const res = await POST(request(url, body));
    expect(res.status).toBe(413);
  });

  it("Content-Length über dem Limit → 413 vor dem Lesen", async () => {
    const { POST } = await route.load();
    const res = await POST(
      request(url, "{}", { "content-length": String(50 * 1024 * 1024) })
    );
    expect(res.status).toBe(413);
  });

  if (route.rateLimitPerMinute) {
    it(`mehr als ${route.rateLimitPerMinute} Anfragen pro Minute von einer IP → 429`, async () => {
      const { POST } = await route.load();
      const ip = "203.0.113.77";
      let last: Response | undefined;
      for (let i = 0; i <= route.rateLimitPerMinute!; i++) {
        last = await POST(request(url, "{}", { "x-forwarded-for": ip }));
      }
      expect(last!.status).toBe(429);
    });
  }
});

describe("Öffentliche API-Routen lesen Bodies nur begrenzt ein", () => {
  it("keine Route ohne auth() verwendet req.json() oder req.formData()", () => {
    const apiDir = path.join(process.cwd(), "src/app/api");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry === "route.ts") files.push(full);
      }
    };
    walk(apiDir);

    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      const readsBody = /\b(req|request)\.(json|formData|text|arrayBuffer)\(\)/.test(source);
      const requiresLogin = /\bawait auth\(\)/.test(source) || /isCronAuthorized\(/.test(source);
      // Login-Pflicht steht vor dem Lesen des Bodys; ohne sie muss readJsonLimited her
      return readsBody && !requiresLogin;
    });

    expect(offenders.map((f) => path.relative(apiDir, f))).toEqual([]);
  });
});
