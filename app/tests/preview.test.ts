import { describe, expect, it } from "vitest";
import { indexOfItem, inlineSrc, isPreviewable, stepIndex, type PreviewItem } from "@/components/finder/preview";

describe("Vorschau-Logik", () => {
  it("erkennt anzeigbare Typen (Bild, PDF auch per Endung), alles andere nicht", () => {
    expect(isPreviewable("image/png", "x.png")).toBe(true);
    expect(isPreviewable("application/pdf", "x.pdf")).toBe(true);
    expect(isPreviewable("application/octet-stream", "Rechnung.PDF")).toBe(true);
    expect(isPreviewable("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x.docx")).toBe(false);
    expect(isPreviewable("application/zip", "x.zip")).toBe(false);
  });

  it("hängt inline=1 an, ohne es doppelt zu setzen", () => {
    expect(inlineSrc("/api/x/files/1")).toBe("/api/x/files/1?inline=1");
    expect(inlineSrc("/api/x?v=2")).toBe("/api/x?v=2&inline=1");
    expect(inlineSrc("/api/x?inline=1")).toBe("/api/x?inline=1");
  });

  it("blättert ohne Umbruch", () => {
    expect(stepIndex(0, -1, 3)).toBe(0);
    expect(stepIndex(1, 1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });

  it("findet Items per id", () => {
    const items = [{ id: "a" }, { id: "b" }] as PreviewItem[];
    expect(indexOfItem(items, "b")).toBe(1);
    expect(indexOfItem(items, "z")).toBe(-1);
  });
});
