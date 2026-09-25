import { describe, expect, it } from "vitest";
import { productLabel } from "@/lib/ui-text";

describe("productLabel", () => {
  it("übersetzt bekannte Slugs ins Deutsche", () => {
    expect(productLabel("business-card")).toBe("Visitenkarte");
    expect(productLabel("flyer")).toBe("Flyer");
    expect(productLabel("campaign")).toBe("Kampagne (gemischt)");
  });

  it("fällt bei Unbekanntem auf den Rohwert zurück", () => {
    expect(productLabel("sonderformat-x")).toBe("sonderformat-x");
  });

  it("behandelt leere Werte", () => {
    expect(productLabel(null)).toBe("—");
    expect(productLabel(undefined)).toBe("—");
    expect(productLabel("")).toBe("—");
  });
});
