import { describe, it, expect } from "vitest";
import { htmlToText } from "@/lib/plaintext";
import { anmeldebestaetigungEmail } from "@/lib/email-templates";

describe("htmlToText", () => {
  it("drops head, styles and images", () => {
    const text = htmlToText(
      '<html><head><style>.x { color: red; }</style></head><body><img src="logo.png" alt="Logo"><p>Hallo</p></body></html>'
    );
    expect(text).toBe("Hallo");
  });

  it("separates paragraphs and keeps line breaks", () => {
    expect(htmlToText("<p>Eins</p>\n   <p>Zwei<br>Drei</p>")).toBe("Eins\n\nZwei\nDrei");
  });

  it("writes link targets next to their label", () => {
    expect(htmlToText('<p><a href="https://example.org/x">Zum Dashboard →</a></p>')).toBe(
      "Zum Dashboard: https://example.org/x"
    );
  });

  it("shows mailto links only once", () => {
    expect(htmlToText('<a href="mailto:anna@example.org">anna@example.org</a>')).toBe("anna@example.org");
  });

  it("does not glue adjacent links together", () => {
    expect(htmlToText('<a href="https://a.example">A</a><span>·</span><a href="https://b.example">B</a>')).toBe(
      "A: https://a.example · B: https://b.example"
    );
  });

  it("renders list items and dividers", () => {
    expect(htmlToText("<ul><li>Eins</li><li>Zwei</li></ul><hr /><p>Ende</p>")).toBe(
      "- Eins\n- Zwei\n\n----------\n\nEnde"
    );
  });

  it("decodes escaped characters exactly once", () => {
    expect(htmlToText("<p>&lt;b&gt; &amp; &quot;x&quot; &#39;y&#39; &amp;lt;</p>")).toBe(`<b> & "x" 'y' &lt;`);
  });

  it("turns a real confirmation email into readable text", () => {
    const { html } = anmeldebestaetigungEmail(
      "Erika",
      "erika@example.org",
      [
        {
          titel: "Infostand Leopoldplatz",
          datum: new Date("2026-11-14"),
          startzeit: "10:00",
          endzeit: "13:00",
          adresse: "Leopoldplatz, 13353 Berlin",
          ansprechpersonName: "Anna Beispiel",
          ansprechpersonEmail: "anna@example.org",
          ansprechpersonTelefon: "0170 1234567",
        },
      ],
      ["tok123"]
    );
    const text = htmlToText(html);

    expect(text).toContain("Hallo Erika,");
    expect(text).toContain("Infostand Leopoldplatz");
    expect(text).toContain("Leopoldplatz, 13353 Berlin");
    expect(text).toContain("/api/anmeldungen/abmelden?token=tok123");
    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
    expect(text).not.toContain("{");
  });
});
