import { describe, it, expect } from "vitest";
import { phoneLink } from "@/lib/email-templates";

describe("phoneLink", () => {
  it.each([
    ["0170 1234567", "tel:01701234567"],
    ["030/123 456-78", "tel:03012345678"],
    ["+49 170 1234567", "tel:+491701234567"],
    ["+49 (0)30 123456", "tel:+4930123456"],
    ["(030) 123456", "tel:030123456"],
  ])("links %s to %s and keeps the readable number", (input, href) => {
    expect(phoneLink(input)).toBe(`<a href="${href}">${input}</a>`);
  });

  it("does not link text without a dialable number", () => {
    expect(phoneLink("Signal")).toBe("Signal");
  });

  it("escapes the visible number", () => {
    expect(phoneLink("0170 123<b>")).toBe('<a href="tel:0170123">0170 123&lt;b&gt;</a>');
  });
});
