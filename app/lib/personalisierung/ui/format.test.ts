import { describe, expect, it } from "vitest";
import { erkenneFormat, formatHinweis } from "./format";

describe("Format erkennen", () => {
  it("nimmt die TrimBox, wenn das PDF sie mitbringt", () => {
    const r = erkenneFormat({ breiteMm: 91, hoeheMm: 61, trim: { breiteMm: 85, hoeheMm: 55, beschnittMm: 3 } });
    expect(r).toMatchObject({ endformat: { breite: 85, hoehe: 55 }, beschnitt: 3, mitBeschnitt: true, sicher: true });
  });
  it("erkennt Visitenkarte mit 3 mm Beschnitt, auch gedreht", () => {
    expect(erkenneFormat({ breiteMm: 91, hoeheMm: 61 })).toMatchObject({ endformat: { breite: 85, hoehe: 55 }, beschnitt: 3, mitBeschnitt: true });
    expect(erkenneFormat({ breiteMm: 61, hoeheMm: 91 })).toMatchObject({ endformat: { breite: 55, hoehe: 85 }, mitBeschnitt: true });
  });
  it("erkennt DIN lang mit 2 mm Beschnitt und Formate ohne Beschnitt", () => {
    expect(erkenneFormat({ breiteMm: 103, hoeheMm: 214 })).toMatchObject({ endformat: { breite: 99, hoehe: 210 }, beschnitt: 2, mitBeschnitt: true });
    expect(erkenneFormat({ breiteMm: 148, hoeheMm: 210 })).toMatchObject({ endformat: { breite: 148, hoehe: 210 }, mitBeschnitt: false });
  });
  it("rät bei unbekannten Maßen und sagt das deutlich", () => {
    const r = erkenneFormat({ breiteMm: 123.4, hoeheMm: 77.7 });
    expect(r).toMatchObject({ endformat: { breite: 123.4, hoehe: 77.7 }, mitBeschnitt: false, sicher: false });
    expect(r.text).toMatch(/prüfen/);
  });
  it("warnt, wenn Seitengröße und Angaben nicht zusammenpassen", () => {
    expect(formatHinweis({ breiteMm: 91, hoeheMm: 61 }, { breite: 85, hoehe: 55 }, 3, true)).toBe("");
    expect(formatHinweis({ breiteMm: 100, hoeheMm: 70 }, { breite: 85, hoehe: 55 }, 3, true)).toMatch(/erwartet/);
  });
});
