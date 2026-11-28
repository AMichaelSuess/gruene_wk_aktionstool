/** Internal area as an admin. */
import { test, expect, db } from "./test";
import { AKTIONEN } from "./fixtures";
import { karte } from "./helpers";

test.describe("Admin: Navigation", () => {
  test("Menü zeigt auch die Verwaltung", async ({ page }) => {
    await page.goto("/manage/actions");
    const menu = page.getByRole("complementary");
    for (const name of ["Aktionen", "Statistik", "Teams", "Benutzer*innen"]) {
      await expect(menu.getByRole("link", { name })).toBeVisible();
    }
    await expect(menu.locator('a[href="/manage/districts"]')).toBeVisible();
  });

  test("Statistik lädt und lässt sich exportieren", async ({ page }) => {
    await page.goto("/manage/statistics");
    await expect(page.getByRole("heading", { name: "Gesamtübersicht" })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Auswertung exportieren" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  });
});

test.describe("Admin: Verwaltung", () => {
  test("Benutzer*in anlegen", async ({ page }) => {
    await page.goto("/manage/users");
    await page.getByRole("link", { name: /Neue/ }).click();
    await expect(page).toHaveURL("/manage/users/new");

    await page.getByLabel("Name").fill("Erik E2E");
    await page.getByLabel("E-Mail").fill("erik@e2e.test");
    await page.getByLabel("Initiales Passwort").fill("E2e-Passwort-1234");
    await page.getByLabel("Rolle").selectOption("EXPERT");
    await page.getByRole("checkbox", { name: "Team Mitte" }).check();
    await page.getByRole("button", { name: "Erstellen" }).click();

    await expect(page).toHaveURL("/manage/users");
    await expect(page.getByRole("cell", { name: "Erik E2E" })).toBeVisible();
    expect((await db.user.findUnique({ where: { email: "erik@e2e.test" } }))?.role).toBe("EXPERT");
  });

  test("Team anlegen und wieder löschen", async ({ page }) => {
    const name = "E2E Team";
    await page.goto("/manage/teams");
    await page.getByRole("button", { name: "Neues Team" }).click();
    await expect(page).toHaveURL("/manage/teams/new");

    await page.getByLabel("Teamname").fill(name);
    await page.getByRole("button", { name: "Erstellen" }).click();
    await expect(page).toHaveURL("/manage/teams");

    await karte(page, name, "Löschen").getByRole("button", { name: "Löschen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Team löschen" }).click();
    await expect(page.getByText(`„${name}“ wurde gelöscht.`)).toBeVisible();
    expect(await db.team.count({ where: { name } })).toBe(0);
  });

  test("Wahlkreis umbenennen", async ({ page }) => {
    await page.goto("/manage/districts");
    await page.locator('a[href^="/manage/districts/"]').first().click();
    await expect(page).toHaveURL(/\/manage\/districts\/[^/]+$/);
    const id = page.url().split("/").pop()!;

    await page.getByLabel("Name").fill("E2E Bezirk");
    await page.getByRole("button", { name: "Speichern" }).click();

    await expect(page).toHaveURL("/manage/districts");
    expect((await db.wahlkreis.findUnique({ where: { id } }))?.name).toBe("E2E Bezirk");
  });

  test("Aktion endgültig löschen", async ({ page }) => {
    const { id, titel } = AKTIONEN.loeschen;
    await page.goto("/manage/actions");
    await karte(page, titel).getByRole("button", { name: "Löschen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Endgültig löschen" }).click();

    await expect(page.getByText(`„${titel}“ wurde gelöscht.`)).toBeVisible();
    expect(await db.aktion.findUnique({ where: { id } })).toBeNull();
  });
});

test.describe("Admin: schmale Bildschirme", () => {
  // Kein interner Inhalt darf breiter sein als sein Platz: sonst scrollt die
  // Seite seitlich, oder Spalten und Knoepfe liegen ausserhalb einer Box.
  // 320px = schmalstes uebliches Handy, 900px = Tablet mit Seitenleiste (dort ist
  // der Inhalt am schmalsten), 1280px = Desktop. 320 statt 375 laesst Luft, weil Schriften in echten
  // Browsern oft etwas breiter laufen als im Test-Chromium.
  test("keine interne Seite ist zu breit", async ({ page }) => {
    const [aktion, team, user, wahlkreis] = await Promise.all([
      db.aktion.findFirstOrThrow(),
      db.team.findFirstOrThrow(),
      db.user.findFirstOrThrow({ where: { role: "EXPERT" } }),
      db.wahlkreis.findFirstOrThrow(),
    ]);
    const pfade = [
      "/manage/actions",
      "/manage/actions/new",
      `/manage/actions/${aktion.id}`,
      `/manage/actions/${aktion.id}/signups`,
      "/manage/statistics",
      "/manage/users",
      "/manage/users/new",
      `/manage/users/${user.id}`,
      "/manage/teams",
      "/manage/teams/new",
      `/manage/teams/${team.id}`,
      "/manage/districts",
      `/manage/districts/${wahlkreis.id}`,
      "/manage/account",
    ];

    for (const breite of [320, 900, 1280]) {
      await page.setViewportSize({ width: breite, height: 800 });
      for (const pfad of pfade) {
        await page.goto(pfad);
        await expect(page.getByRole("heading", { level: 1 }), pfad).toBeVisible();
        const ergebnis = await page.evaluate(() => {
          const main = document.querySelector("main")!;
          // Sichtbare Boxen mit eigenem Scrollbereich, deren Inhalt nicht passt.
          // Eingabefelder scrollen langen Text immer, das ist gewollt.
          const zuBreit = [...main.querySelectorAll<HTMLElement>("*")]
            .filter((e) => !["INPUT", "TEXTAREA", "SELECT"].includes(e.tagName))
            .filter((e) => e.offsetParent !== null && getComputedStyle(e).overflowX !== "visible")
            .filter((e) => e.scrollWidth > e.clientWidth + 1)
            .map((e) => `${e.tagName.toLowerCase()}.${e.className}`);
          // Nennt bei einem Fehler die Elemente, die rechts aus dem Inhalt ragen
          const rand = main.getBoundingClientRect().left + main.clientWidth;
          const ragtHeraus = [...main.querySelectorAll<HTMLElement>("*")]
            .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().right > rand + 0.5)
            .map((e) => `${e.tagName.toLowerCase()} "${(e.textContent ?? "").trim().slice(0, 40)}"`)
            .slice(0, 5);
          return {
            seite: document.documentElement.scrollWidth - window.innerWidth,
            inhalt: main.scrollWidth - main.clientWidth,
            zuBreit,
            ragtHeraus,
          };
        });
        expect(ergebnis, `${pfad} bei ${breite}px`).toEqual({ seite: 0, inhalt: 0, zuBreit: [], ragtHeraus: [] });
      }
    }
  });
});
