import { describe, expect, it } from "vitest";
import { initialen } from "@/lib/initialen";

describe("initialen", () => {
  it("kürzt Vor- und Nachname", () => {
    expect(initialen("Michael Schultze")).toBe("M.S.");
  });

  it("nimmt bei mehreren Namen den ersten und letzten", () => {
    expect(initialen("Anna Maria von Berg")).toBe("A.B.");
  });

  it("kommt mit einem einzelnen Namen, Leerraum und Umlauten zurecht", () => {
    expect(initialen("  Özlem  ")).toBe("Ö.");
    expect(initialen("ernst   über")).toBe("E.Ü.");
    expect(initialen("Hans-Peter Müller")).toBe("H.M.");
  });

  it("liefert für einen leeren Namen nichts", () => {
    expect(initialen("   ")).toBe("");
  });
});
