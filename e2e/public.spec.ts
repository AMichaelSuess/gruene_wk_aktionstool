/** Public pages: what volunteers see without an account. */
import { test, expect, db } from "./test";
import { AKTIONEN } from "./fixtures";

test.describe("Öffentliche Seiten", () => {
  test("Startseite, Datenschutz, Impressum und Login laden", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Aktionen", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: AKTIONEN.oeffentlich.titel })).toBeVisible();

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Datenschutz");

    await page.goto("/imprint");
    await expect(page.getByRole("heading", { name: "Impressum", level: 1 })).toBeVisible();

    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
  });

  test("Interner Bereich leitet ohne Login zum Login", async ({ page }) => {
    for (const pfad of ["/manage", "/manage/actions", "/manage/teams", "/manage/account"]) {
      await page.goto(pfad);
      await expect(page).toHaveURL("/login");
    }
  });

  test("Login mit falschem Passwort zeigt einen Fehler", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill("admin@gruene-mitte.de");
    await page.getByLabel("Passwort").fill("falsches-passwort");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByText("E-Mail oder Passwort ist falsch.")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });
});

test.describe("Anmeldung zu einer Aktion", () => {
  test("Aktion auswählen, Formular ausfüllen, Anmeldung gespeichert", async ({ page }) => {
    const { id, titel } = AKTIONEN.oeffentlich;
    await page.goto("/");
    await page.getByRole("heading", { name: titel }).click();
    await page.getByRole("button", { name: "Jetzt anmelden →" }).click();

    await expect(page).toHaveURL(`/signup?actions=${id}`);
    await expect(page.getByText(titel)).toBeVisible();

    await page.getByLabel("Vorname").fill("Anna");
    await page.getByLabel("Nachname").fill("Anmeldung");
    await page.getByLabel("E-Mail").fill("anna@e2e.test");
    // The Signal field's hint also says "Telefonnummer"
    await page.getByRole("textbox", { name: /^Telefonnummer/ }).fill("0170 3333333");
    // Styled checkbox: the input is visually hidden, the visible box is a label
    await page.locator('label[for="datenschutz-page"]').first().click();
    await expect(page.locator("#datenschutz-page")).toBeChecked();
    await page.getByRole("button", { name: "Jetzt anmelden" }).click();

    await expect(page.getByText("Anmeldung erfolgreich!")).toBeVisible();
    const anmeldung = await db.anmeldung.findFirst({ where: { aktionId: id, email: "anna@e2e.test" } });
    expect(anmeldung?.vorname).toBe("Anna");
  });

  test("Einbettung zeigt das Formular der Aktion", async ({ page }) => {
    const { id, titel } = AKTIONEN.oeffentlich;
    await page.goto(`/embed/actions/${id}`);
    await expect(page.getByText(titel)).toBeVisible();
    await expect(page.getByLabel("Vorname")).toBeVisible();
  });
});

test.describe("Abmeldung und Übersicht", () => {
  test("Link aus der E-Mail führt zur Bestätigung, Abmelden löscht die Anmeldung", async ({ page }) => {
    const { titel, anmeldung } = AKTIONEN.abmelden;
    // Same URL as in the confirmation email
    await page.goto(`/api/anmeldungen/abmelden?token=${anmeldung.cancelToken}`);

    await expect(page).toHaveURL(/^[^?]*\/unsubscribe(\?|$)/);
    await expect(page.getByText("Von der Aktion abmelden?")).toBeVisible();
    await expect(page.getByText(titel)).toBeVisible();

    await page.getByRole("button", { name: "Jetzt von der Aktion abmelden" }).click();
    await expect(page.getByText("Erfolgreich abgemeldet")).toBeVisible();
    expect(await db.anmeldung.findUnique({ where: { cancelToken: anmeldung.cancelToken } })).toBeNull();
  });

  test.describe(() => {
    // The page asks the API about the token, which answers 404
    test.use({ erlaubteFehler: [/status of 404/] });

    test("Unbekannter Abmelde-Link zeigt einen Hinweis", async ({ page }) => {
      await page.goto(`/api/anmeldungen/abmelden?token=${"f".repeat(64)}`);
      await expect(page.getByText("Abmeldung nicht möglich")).toBeVisible();
    });
  });

  test("Abmelde-Link ohne Token zeigt einen Hinweis", async ({ page }) => {
    await page.goto("/api/anmeldungen/abmelden");
    await expect(page).toHaveURL("/unsubscribe/done?error=1");
    await expect(page.getByText("Abmeldung nicht möglich")).toBeVisible();
  });

  test("Übersicht der eigenen Anmeldungen anfordern", async ({ page }) => {
    await page.goto("/my-signups?email=uebersicht%40e2e.test");
    await expect(page.getByText("Übersicht anfordern")).toBeVisible();
    await page.getByRole("button", { name: "E-Mail senden" }).click();
    await expect(page.getByText("E-Mail wird gesendet")).toBeVisible();
    // The mail was attempted (and, by design of the E2E setup, not delivered)
    const log = await db.emailLog.findFirst({ where: { empfaengerEmail: "uebersicht@e2e.test" } });
    expect(log?.status).toMatch(/^FEHLER/);
  });
});
