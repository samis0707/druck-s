import { describe, expect, it } from "vitest";
import { loescheWerkbankSpeicher } from "./werkbankSpeicher";

function speicher(start: Record<string, string>) {
  const m = new Map(Object.entries(start));
  return {
    m,
    s: {
      get length() {
        return m.size;
      },
      key: (i: number) => [...m.keys()][i] ?? null,
      removeItem: (k: string) => void m.delete(k),
    },
  };
}

describe("Werkbank-Speicher beim Abmelden", () => {
  it("löscht nur die Werkbank-Schlüssel", () => {
    const { m, s } = speicher({ "werkbank.material.v1": "{}", "werkbank.lager.v1": "{}", "hilfe.fortschritt": "1", theme: "dark" });
    expect(loescheWerkbankSpeicher(s)).toBe(2);
    expect([...m.keys()].sort()).toEqual(["hilfe.fortschritt", "theme"]);
  });

  it("wirft nicht, wenn der Speicher gesperrt ist", () => {
    const kaputt = {
      get length(): number {
        throw new Error("gesperrt");
      },
      key: () => null,
      removeItem: () => undefined,
    };
    expect(loescheWerkbankSpeicher(kaputt)).toBe(0);
    expect(loescheWerkbankSpeicher(null)).toBe(0);
  });
});
