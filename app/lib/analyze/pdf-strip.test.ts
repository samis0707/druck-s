import { describe, expect, it } from "vitest";
import { placementMap, stripLiterals } from "@/lib/analyze/pdf";

describe("stripLiterals", () => {
  it("entfernt String-Inhalte, behält Operatoren", () => {
    expect(stripLiterals("q (Hallo q Q) Q /Im1 Do")).toBe("q () Q /Im1 Do");
  });

  it("behandelt verschachtelte Klammern und Escapes", () => {
    expect(stripLiterals("(a (b) c) q")).toBe("() q");
    expect(stripLiterals("(a \\) b) Q")).toBe("() Q");
  });

  it("ersetzt Hex-Literale, lässt Dictionaries stehen", () => {
    expect(stripLiterals("<4142> Tj << /X /Y >>")).toBe("<> Tj << /X /Y >>");
  });

  it("übersteht megabyte-große Operator-Blöcke ohne Stack-Overflow", () => {
    const block = `(Text mit q und Q und Klammern (verschachtelt (tief)) und Escapes \\) \\)\\\\) <414243> Do `;
    const code = `q 1 0 0 1 0 0 cm\n${block.repeat(4000)}\nQ`;
    const gestrippt = stripLiterals(code);
    expect(gestrippt).toContain("()");
    expect(gestrippt.length).toBeLessThan(code.length);
    expect(() => placementMap(gestrippt)).not.toThrow();
  });
});
