/**
 * Whether an Aktion has already started, compared in Berlin local time.
 *
 * `datum` holds the calendar day of the Aktion; `startzeit` is "HH:MM" local
 * time. Used to hide started actions from the public list and to refuse
 * signups for them.
 */
export function hatBegonnen(
  aktion: { datum: Date | string; startzeit: string },
  now: Date = new Date()
): boolean {
  // Berlin time zone, so the server running in UTC does not shift the day
  const currentDate = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }); // YYYY-MM-DD
  const currentTime = now.toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  }); // HH:MM
  const aktionDate = new Date(aktion.datum).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Berlin",
  });

  if (aktionDate > currentDate) return false;
  if (aktionDate === currentDate) return aktion.startzeit <= currentTime;
  return true;
}
