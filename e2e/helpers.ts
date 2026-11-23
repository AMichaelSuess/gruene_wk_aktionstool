import type { Locator, Page } from "@playwright/test";

/**
 * The card with the heading `titel` that contains a button `button`
 * (action list, teams, districts). Outer containers also contain heading and
 * button, so the innermost match (the last one in document order) is the card.
 */
export function karte(page: Page, titel: string, button = "Bearbeiten"): Locator {
  return page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: titel, exact: true }) })
    .filter({ has: page.getByRole("button", { name: button, exact: true }) })
    .last();
}

/** Date input value (yyyy-mm-dd) a number of days from today. */
export function datumInTagen(tage: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  return d.toISOString().split("T")[0];
}
