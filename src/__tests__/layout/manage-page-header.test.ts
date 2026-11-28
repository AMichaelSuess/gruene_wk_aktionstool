/**
 * Jede Seite im internen Bereich setzt ihren Titel ueber <PageHeader>.
 *
 * Handgeschriebene Titelzeilen (Titel und Knoepfe in einer Flex-Zeile ohne
 * Umbruch) waren auf dem Handy breiter als der Bildschirm und verschoben die
 * ganze Seite samt Kopfzeile. PageHeader bricht um; dieser Test verhindert,
 * dass eine neue Seite wieder ein eigenes <h1> baut.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const MANAGE = path.join(process.cwd(), "src", "app", "manage");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

describe("Interne Seiten nutzen PageHeader", () => {
  const files = pages(MANAGE);

  it("findet die Seiten", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  // Die Startseite /manage leitet nur weiter und hat keinen Titel
  const mitInhalt = files.filter((f) => !readFileSync(f, "utf8").includes("redirect("));

  it.each(mitInhalt.map((f) => [path.relative(MANAGE, f), f]))("%s", (_name, file) => {
    const src = readFileSync(file, "utf8");
    expect(src, "eigenes <h1> statt <PageHeader>").not.toMatch(/<h1[\s>]/);
    expect(src, "<PageHeader> fehlt").toMatch(/<PageHeader[\s/>]/);
  });
});
