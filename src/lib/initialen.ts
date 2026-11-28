// Public pages show the contact person only as initials ("Michael Schultze" → "M.S.").
// Emails and the internal area keep the full name.
export function initialen(name: string): string {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return "";
  const woerter = teile.length === 1 ? teile : [teile[0], teile[teile.length - 1]];
  return woerter.map((w) => `${Array.from(w)[0].toLocaleUpperCase("de-DE")}.`).join("");
}
