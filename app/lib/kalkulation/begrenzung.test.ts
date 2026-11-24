import { beforeEach, describe, expect, it } from "vitest";
import { abrufZaehlerLeeren, speicherGroesse, zaehleImSpeicher } from "./begrenzung";

beforeEach(() => abrufZaehlerLeeren());

describe("Zähler im Speicher", () => {
  it("lässt bis zur Grenze zu und danach nicht mehr; 0 = unbegrenzt", () => {
    const t = 1_000_000;
    expect([1, 2, 3, 4].map(() => zaehleImSpeicher("a", 3, t))).toEqual([true, true, true, false]);
    expect(zaehleImSpeicher("a", 0, t)).toBe(true);
    // neues Fenster nach einer Stunde
    expect(zaehleImSpeicher("a", 3, t + 3_600_001)).toBe(true);
  });

  it("bereinigt abgelaufene Einträge regelmäßig", () => {
    const t = 5_000_000;
    for (let i = 0; i < 50; i++) zaehleImSpeicher(`k${i}`, 5, t);
    expect(speicherGroesse()).toBe(50);
    zaehleImSpeicher("neu", 5, t + 3_700_000); // > 1 Min seit letzter Bereinigung, alle alten Fenster abgelaufen
    expect(speicherGroesse()).toBe(1);
  });

  it("begrenzt die Zahl der Einträge bei vielen frischen Schlüsseln", () => {
    const t = 9_000_000;
    for (let i = 0; i < 12_000; i++) zaehleImSpeicher(`ip${i}`, 5, t + i);
    expect(speicherGroesse()).toBeLessThanOrEqual(10_001);
  });
});
