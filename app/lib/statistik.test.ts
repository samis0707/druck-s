import { describe, expect, it } from "vitest";
import { datenschutzSignal, GUELTIG_MS, istIntern, nutzlastBereinigen, pfadBereinigen, wahlLesen, wahlText } from "./statistik";

const JETZT = Date.UTC(2026, 10, 10);
const HERKUNFT = "https://druck-s.de";

describe("Einwilligung", () => {
  it("liest eine gültige Wahl", () => {
    expect(wahlLesen(wahlText("ja", JETZT), JETZT + 1000)).toEqual({ wert: "ja", zeit: JETZT });
    expect(wahlLesen(wahlText("nein", JETZT), JETZT)).toEqual({ wert: "nein", zeit: JETZT });
  });
  it("fragt nach 12 Monaten und bei Unsinn erneut", () => {
    expect(wahlLesen(wahlText("ja", JETZT), JETZT + GUELTIG_MS + 1)).toBeNull();
    expect(wahlLesen("{kaputt", JETZT)).toBeNull();
    expect(wahlLesen(JSON.stringify({ wert: "vielleicht", zeit: JETZT }), JETZT)).toBeNull();
    expect(wahlLesen(JSON.stringify({ wert: "ja", zeit: JETZT + 86_400_000 }), JETZT)).toBeNull();
    expect(wahlLesen(null, JETZT)).toBeNull();
  });
  it("erkennt Do not track und Global Privacy Control", () => {
    expect(datenschutzSignal({ doNotTrack: "1" })).toBe(true);
    expect(datenschutzSignal({ globalPrivacyControl: true })).toBe(true);
    expect(datenschutzSignal({ doNotTrack: null })).toBe(false);
    expect(datenschutzSignal(undefined)).toBe(false);
  });
});

describe("Pfade", () => {
  it("lässt interne Bereiche weg", () => {
    for (const p of ["/staff", "/staff/requests/1", "/konto", "/login", "/api/health"]) {
      expect(istIntern(p)).toBe(true);
      expect(pfadBereinigen(p)).toBeNull();
    }
    expect(istIntern("/staffel")).toBe(false);
  });
  it("ersetzt Tokens und Auftragsnummern, entfernt Parameter", () => {
    expect(pfadBereinigen("/u/geheimesToken123/schritt")).toBe("/u/[token]/schritt");
    expect(pfadBereinigen("/requests/42?code=123456")).toBe("/requests/[id]");
    expect(pfadBereinigen("/upload?email=a@b.de#x")).toBe("/upload");
    expect(pfadBereinigen("/")).toBe("/");
  });
});

describe("nutzlastBereinigen", () => {
  it("bereinigt Adresse und Herkunft", () => {
    expect(nutzlastBereinigen({ url: "/u/tok?x=1", referrer: "https://druck-s.de/requests/7?a=b", website: "w" }, HERKUNFT)).toEqual({
      url: "/u/[token]",
      referrer: "https://druck-s.de/requests/[id]",
      website: "w",
    });
    expect(nutzlastBereinigen({ url: "/hilfe", referrer: "https://www.google.de/search?q=druck" }, HERKUNFT)).toEqual({
      url: "/hilfe",
      referrer: "https://www.google.de/",
    });
  });
  it("sendet aus internen Bereichen nichts und lässt interne Herkunft weg", () => {
    expect(nutzlastBereinigen({ url: "/staff/requests" }, HERKUNFT)).toBe(false);
    expect(nutzlastBereinigen({ url: "/", referrer: "https://druck-s.de/login" }, HERKUNFT)).toEqual({ url: "/", referrer: "" });
  });
});
