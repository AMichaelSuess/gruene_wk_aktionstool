/**
 * Jeder Pfad, den der Code aufruft oder verlinkt (fetch, href, router.push,
 * redirect, Links in E-Mails), muss zu einer existierenden Seite, API-Route
 * oder Datei in public/ fuehren.
 *
 * Die Handler-Tests importieren Routen ueber ihren Dateipfad und pruefen nie,
 * ob die URL, die eine Seite aufruft, dort ankommt. Ein Tippfehler oder ein
 * vergessener Pfad nach dem Verschieben einer Route faellt sonst erst im
 * Browser auf.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import ts from "typescript";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const APP = path.join(SRC, "app");
const PUBLIC = path.join(ROOT, "public");

// Steht fuer einen eingesetzten Wert (`${id}`) in einem Template-String
const PLACEHOLDER = "\u0000";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Routen aus src/app: Segmente ohne Routengruppen wie "(public)". */
function collectRoutes(fileName: "page.tsx" | "route.ts"): string[][] {
  return walk(APP)
    .filter((f) => path.basename(f) === fileName)
    .map((f) =>
      path
        .relative(APP, path.dirname(f))
        .split(path.sep)
        .filter((s) => s !== "" && !/^\(.*\)$/.test(s))
    );
}

function matches(route: string[], segments: string[]): boolean {
  for (let i = 0; i < route.length; i++) {
    const r = route[i];
    if (/^\[\[\.\.\..+\]\]$/.test(r)) return true; // optional catch-all
    if (/^\[\.\.\..+\]$/.test(r)) return segments.length > i; // catch-all
    if (i >= segments.length) return false;
    if (/^\[.+\]$/.test(r)) continue; // dynamisches Segment: jeder Wert
    // Ein eingesetzter Wert passt nur auf ein dynamisches Segment
    if (segments[i] !== r) return false;
  }
  return route.length === segments.length;
}

interface PathLiteral {
  value: string;
  where: string;
}

/** Alle String- und Template-Literale, die wie ein App-Pfad aussehen. */
function collectPathLiterals(): PathLiteral[] {
  const files = walk(SRC).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${path.sep}__tests__${path.sep}`)
  );
  const found: PathLiteral[] = [];

  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node) => {
      let text: string | null = null;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        text = node.text;
      } else if (ts.isTemplateExpression(node)) {
        text = node.head.text + node.templateSpans.map((s) => PLACEHOLDER + s.literal.text).join("");
      }
      if (text !== null) {
        // `${baseUrl}/privacy`: ein Wert vor dem ersten "/" ist der Origin
        const value = text.startsWith(PLACEHOLDER + "/") ? text.slice(1) : text;
        if (/^\/[a-z]/.test(value)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart());
          found.push({ value, where: `${path.relative(ROOT, file)}:${line + 1}` });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

/** Pfadsegmente ohne Query, Hash und abschliessenden Schraegstrich. */
function toSegments(value: string): string[] | null {
  const pathname = value.split(/[?#]/)[0].replace(/\/+$/, "");
  // Kein Pfad, sondern ein Muster (Proxy-Matcher) oder Text
  if (/[\s:(),*]/.test(pathname)) return null;
  return pathname.split("/").slice(1);
}

describe("Links und API-Aufrufe", () => {
  const pages = collectRoutes("page.tsx");
  const apiRoutes = collectRoutes("route.ts");
  const literals = collectPathLiterals();

  it("findet die Pfade im Code", () => {
    // Schutz gegen einen Scanner, der still nichts mehr findet
    expect(literals.filter((l) => l.value.startsWith("/api/")).length).toBeGreaterThan(30);
    expect(literals.filter((l) => l.value.startsWith("/manage/")).length).toBeGreaterThan(20);
  });

  it("fuehrt jeder Pfad zu einer Seite, API-Route oder Datei in public/", () => {
    const broken = literals.filter(({ value }) => {
      const segments = toSegments(value);
      if (segments === null) return false;
      // "/manage/users/" (startsWith-Pruefung im Proxy): Praefix mindestens einer Route
      if (value.split(/[?#]/)[0].endsWith("/")) {
        return ![...pages, ...apiRoutes].some(
          (r) => r.length > segments.length && matches(r.slice(0, segments.length), segments)
        );
      }
      if (segments[0] === "api") return !apiRoutes.some((r) => matches(r, segments));
      if (pages.some((r) => matches(r, segments))) return false;
      return !(segments.every((s) => !s.includes(PLACEHOLDER)) && existsSync(path.join(PUBLIC, ...segments)));
    });

    expect(
      broken.map((b) => `${b.where}  ${b.value.replaceAll(PLACEHOLDER, "${…}")}`),
      "Pfade ohne passende Seite, API-Route oder Datei"
    ).toEqual([]);
  });
});
