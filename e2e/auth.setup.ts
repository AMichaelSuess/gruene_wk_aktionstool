/** Logs in once per role and stores the session for the expert and admin specs. */
import { test, expect } from "./test";
import { ADMIN, EXPERT } from "./fixtures";

for (const [rolle, konto] of [["expert", EXPERT], ["admin", ADMIN]] as const) {
  test(`Login als ${rolle}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill(konto.email);
    await page.getByLabel("Passwort").fill(konto.password);
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page).toHaveURL("/manage/actions");
    await expect(page.getByRole("heading", { name: "Aktionen", level: 1 })).toBeVisible();
    await page.context().storageState({ path: `e2e/.auth/${rolle}.json` });
  });
}
