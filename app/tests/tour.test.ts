import { describe, expect, it } from "vitest";
import { karteFuer, kartenBreite, kartenRahmen, lochFuer, POLSTER, RAND, ABSTAND } from "@/components/tour/position";
import {
  alsAngebotenMerken,
  alsErledigtMerken,
  einladungZeigen,
  erledigtSchluessel,
  istErledigt,
  tourModusAusUrl,
  type KleinerSpeicher,
} from "@/components/tour/storage";
import { TOUREN } from "@/components/tour/touren";

function speicher(): KleinerSpeicher & { daten: Map<string, string> } {
  const daten = new Map<string, string>();
  return { daten, getItem: (k) => daten.get(k) ?? null, setItem: (k, v) => void daten.set(k, v) };
}

const kaputt: KleinerSpeicher = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceeded");
  },
};

describe("Tour-Merker", () => {
  it("merkt „erledigt“ unter tour:<id>:v1", () => {
    const lokal = speicher();
    expect(istErledigt("upload", () => lokal)).toBe(false);
    alsErledigtMerken("upload", () => lokal);
    expect(lokal.daten.get(erledigtSchluessel("upload"))).toBe("done");
    expect(istErledigt("upload", () => lokal)).toBe(true);
  });

  it("zeigt die Einladung nur, wenn weder erledigt noch in dieser Sitzung angeboten", () => {
    const lokal = speicher();
    const sitzung = speicher();
    const q = { lokal: () => lokal, sitzung: () => sitzung };
    expect(einladungZeigen("staff", q)).toBe(true);
    alsAngebotenMerken("staff", () => sitzung);
    expect(einladungZeigen("staff", q)).toBe(false);
    expect(einladungZeigen("auftrag", q)).toBe(true);
    alsErledigtMerken("auftrag", () => lokal);
    expect(einladungZeigen("auftrag", q)).toBe(false);
  });

  it("stürzt ohne oder mit gesperrtem Storage nicht ab und lädt dann ein", () => {
    expect(einladungZeigen("upload", { lokal: () => kaputt, sitzung: () => kaputt })).toBe(true);
    expect(einladungZeigen("upload", { lokal: () => null, sitzung: () => undefined })).toBe(true);
    expect(() => alsErledigtMerken("upload", () => kaputt)).not.toThrow();
    expect(() =>
      alsErledigtMerken("upload", () => {
        throw new Error("kein Zugriff");
      }),
    ).not.toThrow();
  });

  it("liest ?tour=aus und ?tour=start", () => {
    expect(tourModusAusUrl("?tour=aus")).toBe("aus");
    expect(tourModusAusUrl("?p=1&tour=start")).toBe("start");
    expect(tourModusAusUrl("?tour=quatsch")).toBeNull();
    expect(tourModusAusUrl("")).toBeNull();
  });
});

describe("Loch und Karte", () => {
  const desktop = { breite: 1280, hoehe: 860 };
  const handy = { breite: 390, hoehe: 664 };
  const karte = { breite: 380, hoehe: 180 };

  it("legt Polster um das Element und begrenzt auf den Bildschirm", () => {
    expect(lochFuer({ top: 100, left: 50, width: 200, height: 40 }, desktop)).toEqual({
      top: 100 - POLSTER,
      left: 50 - POLSTER,
      width: 200 + 2 * POLSTER,
      height: 40 + 2 * POLSTER,
    });
    expect(lochFuer({ top: -500, left: 0, width: 300, height: 2000 }, desktop)).toEqual({ top: 0, left: 0, width: 306, height: 860 });
  });

  it("gibt kein Loch ohne Element, ohne Größe oder außerhalb des Bildschirms", () => {
    expect(lochFuer(null, desktop)).toBeNull();
    expect(lochFuer({ top: 10, left: 10, width: 0, height: 0 }, desktop)).toBeNull();
    expect(lochFuer({ top: 2000, left: 10, width: 100, height: 40 }, desktop)).toBeNull();
  });

  it("zeigt ohne Loch die Karte in der Mitte", () => {
    expect(karteFuer(null, karte, desktop)).toEqual({ art: "mitte" });
  });

  it("setzt die Karte unter das Element, wenn Platz ist, sonst darüber", () => {
    const oben = { top: 100, left: 40, width: 200, height: 40 };
    expect(karteFuer(oben, karte, desktop)).toEqual({ art: "frei", seite: "unter", top: 140 + ABSTAND, left: 40 });
    const unten = { top: 700, left: 40, width: 200, height: 40 };
    expect(karteFuer(unten, karte, desktop)).toEqual({ art: "frei", seite: "ueber", top: 700 - ABSTAND - 180, left: 40 });
  });

  it("hält die Karte seitlich im Bildschirm", () => {
    const rechts = { top: 100, left: 1200, width: 60, height: 30 };
    const lage = karteFuer(rechts, karte, desktop);
    expect(lage).toMatchObject({ art: "frei", left: 1280 - 380 - RAND });
  });

  it("legt die Karte bei sehr großen Elementen in den sichtbaren Bereich", () => {
    const riesig = { top: 0, left: 0, width: 600, height: 860 };
    expect(karteFuer(riesig, karte, desktop)).toMatchObject({ art: "frei", seite: "innen", top: 860 - 180 - RAND });
  });

  it("nutzt auf dem Handy eine Leiste unten – oben, wenn sie das Element verdecken würde", () => {
    expect(karteFuer({ top: 200, left: 10, width: 300, height: 60 }, { breite: 366, hoehe: 200 }, handy)).toEqual({
      art: "leiste",
      kante: "unten",
    });
    expect(karteFuer({ top: 580, left: 10, width: 300, height: 60 }, { breite: 366, hoehe: 200 }, handy)).toEqual({
      art: "leiste",
      kante: "oben",
    });
  });

  it("rechnet die Karte in den sichtbaren Ausschnitt um (Zoom auf dem Handy)", () => {
    const sicht = { x: 100, y: 400, breite: 390, hoehe: 664 };
    const karteH = { breite: 366, hoehe: 200 };
    expect(kartenRahmen({ art: "leiste", kante: "unten" }, karteH, sicht)).toEqual({
      top: 400 + 664 - 200 - RAND,
      left: 100 + RAND,
      width: 366,
    });
    expect(kartenRahmen({ art: "leiste", kante: "oben" }, karteH, sicht)).toEqual({ top: 400 + RAND, left: 100 + RAND, width: 366 });
    expect(kartenRahmen({ art: "mitte" }, karteH, sicht)).toEqual({ top: 400 + 232, left: 100 + 12, width: 366 });
    expect(kartenRahmen({ art: "frei", seite: "unter", top: 50, left: 20 }, karteH, { ...sicht, breite: 1280 })).toEqual({
      top: 450,
      left: 120,
      width: 380,
    });
  });

  it("macht die Karte auf schmalen Bildschirmen schmaler", () => {
    expect(kartenBreite(desktop)).toBe(380);
    expect(kartenBreite({ breite: 360, hoehe: 640 })).toBe(360 - 2 * RAND);
  });
});

describe("Touren", () => {
  it("hat in jedem Schritt ein Ziel oder einen Selektor sowie Titel und Text", () => {
    for (const tour of Object.values(TOUREN)) {
      expect(tour.schritte.length).toBeGreaterThan(2);
      for (const s of tour.schritte) {
        expect(s.ziel || s.selektor).toBeTruthy();
        expect(s.titel.length).toBeGreaterThan(0);
        expect(s.text.length).toBeLessThan(220);
      }
    }
  });
});
