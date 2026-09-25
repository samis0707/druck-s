import { describe, expect, it } from "vitest";
import { assetRank, rollupOf } from "@/components/finder/rollup";

describe("finder rollup (worst-of)", () => {
  it("meldet INFECTED vor red", () => {
    const r = rollupOf([
      { printability: "red", securityVerdict: "CLEAN" },
      { printability: "green", securityVerdict: "INFECTED" },
    ]);
    expect(r.level).toBe("withheld");
    expect(r.label).toBe("Zurückgehalten");
  });

  it("meldet red vor SUSPICIOUS/yellow", () => {
    const r = rollupOf([
      { printability: "yellow", securityVerdict: "SUSPICIOUS" },
      { printability: "red", securityVerdict: "CLEAN" },
    ]);
    expect(r.level).toBe("problem");
  });

  it("meldet SUSPICIOUS auch ohne gelbe Druckbarkeit", () => {
    const r = rollupOf([{ printability: "green", securityVerdict: "SUSPICIOUS" }]);
    expect(r.level).toBe("review");
    expect(r.label).toBe("Bitte prüfen");
  });

  it("meldet OK nur wenn alles sauber ist", () => {
    const r = rollupOf([
      { printability: "green", securityVerdict: "CLEAN" },
      { printability: "green", securityVerdict: "CLEAN" },
    ]);
    expect(r.level).toBe("ok");
  });

  it("meldet Ausstehend ohne Befund", () => {
    expect(rollupOf([]).level).toBe("pending");
    expect(rollupOf([{}]).level).toBe("pending");
  });

  it("sortiert Dateien Auffälligste zuerst", () => {
    const files = [
      { printability: "green", securityVerdict: "CLEAN" },
      { printability: "red", securityVerdict: "CLEAN" },
      { printability: "yellow", securityVerdict: "CLEAN" },
    ];
    const sorted = [...files].sort((a, b) => assetRank(b) - assetRank(a));
    expect(sorted.map((f) => f.printability)).toEqual(["red", "yellow", "green"]);
  });
});

describe("rollupRail", () => {
  it("färbt die Schiene nach Schweregrad", async () => {
    const { rollupRail } = await import("@/components/finder/rollup");
    expect(rollupRail("withheld")).toBe("var(--color-danger)");
    expect(rollupRail("problem")).toBe("var(--color-danger)");
    expect(rollupRail("review")).toBe("var(--color-warn)");
    expect(rollupRail("ok")).toBe("var(--color-brand-500)");
    expect(rollupRail("pending")).toBe("var(--color-rule-strong)");
  });
});
