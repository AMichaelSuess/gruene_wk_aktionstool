import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  anmeldebestaetigungEmail,
  aenderungsEmail,
  absageEmail,
  meineAktionenEmail,
  erinnerungsEmail,
  tagesUebersichtEmail,
} from "@/lib/email-templates";

const EVIL = '<a href="https://evil.example">Hier klicken</a>';
const ESCAPED = "&lt;a href=&quot;https://evil.example&quot;&gt;Hier klicken&lt;/a&gt;";

const aktion = {
  titel: EVIL,
  datum: new Date("2026-11-14"),
  startzeit: "10:00",
  endzeit: "13:00",
  adresse: EVIL,
  ansprechpersonName: EVIL,
  ansprechpersonEmail: "anna@example.org",
  ansprechpersonTelefon: EVIL,
};

const anmeldung = {
  vorname: EVIL,
  nachname: EVIL,
  email: "erika@example.org",
  telefon: EVIL,
  signalName: null,
};

function expectNoInjection(html: string) {
  expect(html).not.toContain("evil.example\"");
  expect(html).not.toContain("<a href=\"https://evil");
  expect(html).toContain(ESCAPED);
}

describe("escapeHtml", () => {
  it("masks all HTML-significant characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("leaves normal text untouched", () => {
    expect(escapeHtml("Müllerstraße 1, 13353 Berlin")).toBe("Müllerstraße 1, 13353 Berlin");
  });
});

describe("email templates escape user input", () => {
  it("anmeldebestaetigungEmail", () => {
    expectNoInjection(anmeldebestaetigungEmail(EVIL, "erika@example.org", [aktion], ["tok"]).html);
  });

  it("aenderungsEmail", () => {
    const { html } = aenderungsEmail(aktion, [{ field: "Adresse", oldValue: EVIL, newValue: EVIL }], "tok");
    expectNoInjection(html);
  });

  it("absageEmail", () => {
    expectNoInjection(absageEmail(aktion).html);
  });

  it("meineAktionenEmail", () => {
    expectNoInjection(meineAktionenEmail([{ ...aktion, cancelToken: "tok" }]).html);
  });

  it("erinnerungsEmail", () => {
    expectNoInjection(erinnerungsEmail(EVIL, [{ ...aktion, cancelToken: "tok" }]).html);
  });

  it("tagesUebersichtEmail", () => {
    const { html } = tagesUebersichtEmail(
      EVIL,
      new Date("2026-11-13"),
      [{ ...aktion, anmeldungen: [anmeldung, { ...anmeldung, signalName: EVIL }] }],
      [{ ...aktion, anmeldungen: [anmeldung] }],
      [{ vorname: EVIL, nachname: EVIL, aktionTitel: EVIL, aktionDatum: new Date("2026-11-14") }]
    );
    expectNoInjection(html);
  });

  it("encodes the cancel token in the unsubscribe URL", () => {
    const { html } = absageEmail(aktion);
    expect(html).not.toContain("token=");
    const mail = erinnerungsEmail("Erika", [{ ...aktion, cancelToken: 'a"b&c' }]);
    expect(mail.html).toContain("token=a%22b%26c");
  });
});
