/** Internal area as an expert (member of "Team Mitte"). */
import { test, expect, db } from "./test";
import { AKTIONEN } from "./fixtures";
import { karte, datumInTagen } from "./helpers";

test.describe("Expert*in: Navigation und Rechte", () => {
  test("Menü zeigt nur die Bereiche für Expert*innen", async ({ page }) => {
    await page.goto("/manage");
    await expect(page).toHaveURL("/manage/actions");

    const menu = page.getByRole("complementary");
    await expect(menu.getByRole("link", { name: "Aktionen" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Statistik" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Benutzer*innen" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Teams" })).toHaveCount(0);
  });

  test("Admin-Seiten leiten zur Aktionsliste", async ({ page }) => {
    for (const pfad of ["/manage/teams", "/manage/teams/new", "/manage/districts", "/manage/users/new"]) {
      await page.goto(pfad);
      await expect(page).toHaveURL("/manage/actions");
    }
  });

  test("Statistik, Benutzer*innen und Konto laden", async ({ page }) => {
    await page.goto("/manage/statistics");
    await expect(page.getByRole("heading", { name: "Statistik deiner Teams" })).toBeVisible();

    await page.goto("/manage/users");
    await expect(page.getByRole("heading", { name: "Benutzer*innen", level: 1 })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Expert Testperson" })).toBeVisible();

    await page.goto("/manage/account");
    await expect(page.getByRole("heading", { name: "Mein Konto" })).toBeVisible();
  });
});

test.describe("Expert*in: Aktionen", () => {
  test("Aktion anlegen", async ({ page }) => {
    const titel = "E2E Neue Aktion von Expert";
    await page.goto("/manage/actions");
    await page.getByRole("button", { name: "Neue Aktion" }).click();
    await expect(page).toHaveURL("/manage/actions/new");

    await page.getByLabel("Titel").fill(titel);
    await page.getByLabel("Datum").fill(datumInTagen(20));
    await page.getByLabel("Startzeit").fill("14:00");
    await page.getByLabel("Endzeit").fill("16:00");
    await page.getByLabel("Adresse").fill("Alexanderplatz 1");
    // Wahlkreis (label depends on NEXT_PUBLIC_WAHLKREIS_LABEL) and Art der Aktion
    await page.getByRole("combobox").nth(0).selectOption({ index: 1 });
    await page.getByLabel("Art der Aktion").selectOption({ index: 1 });
    await page.getByLabel("Name", { exact: true }).fill("Erna Kontakt");
    await page.getByLabel("E-Mail", { exact: true }).fill("kontakt@e2e.test");
    await page.getByLabel("Telefon", { exact: true }).fill("030 1234567");
    await page.getByRole("button", { name: "Aktion erstellen" }).click();

    await expect(page).toHaveURL("/manage/actions");
    await expect(karte(page, titel)).toBeVisible();
    expect(await db.aktion.count({ where: { titel } })).toBe(1);
  });

  test("Aktion bearbeiten", async ({ page }) => {
    const { id, titel } = AKTIONEN.bearbeiten;
    const neuerTitel = `${titel} (geändert)`;
    await page.goto("/manage/actions");
    await karte(page, titel).getByRole("button", { name: "Bearbeiten" }).click();
    await expect(page).toHaveURL(`/manage/actions/${id}`);

    await page.getByLabel("Titel").fill(neuerTitel);
    await page.getByRole("button", { name: "Änderungen speichern" }).click();

    await expect(page).toHaveURL("/manage/actions");
    await expect(karte(page, neuerTitel)).toBeVisible();
  });

  test("Anmeldungen ansehen und eine löschen", async ({ page }) => {
    const { id, titel, anmeldung } = AKTIONEN.anmeldungLoeschen;
    await page.goto("/manage/actions");
    await karte(page, titel).getByRole("button", { name: "Anmeldungen" }).click();
    await expect(page).toHaveURL(`/manage/actions/${id}/signups`);

    const zeile = page.getByRole("row").filter({ hasText: anmeldung.nachname });
    await expect(zeile).toBeVisible();
    await zeile.getByRole("button", { name: "Löschen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Anmeldung löschen" }).click();

    await expect(page.getByText("Die Anmeldung wurde gelöscht.")).toBeVisible();
    expect(await db.anmeldung.count({ where: { aktionId: id } })).toBe(0);
  });

  test("Aktion absagen", async ({ page }) => {
    const { id, titel } = AKTIONEN.absagen;
    await page.goto("/manage/actions");
    await karte(page, titel).getByRole("button", { name: "Absagen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Absagen" }).click();

    await expect(page.getByText("Die Aktion wurde abgesagt.")).toBeVisible();
    expect((await db.aktion.findUnique({ where: { id } }))?.status).toBe("ABGESAGT");
  });

  test("Excel-Vorlage für den Import herunterladen", async ({ page }) => {
    await page.goto("/manage/actions/new");
    await page.getByRole("button", { name: "Excel-Import" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: /Vorlage herunterladen/ }).click();
    expect((await download).suggestedFilename()).toBe("aktionen-vorlage.xlsx");
  });

  test("Aktionen als Excel exportieren", async ({ page }) => {
    await page.goto("/manage/actions");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Excel exportieren" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  });
});
