import { describe, expect, it } from "vitest";
import {
  STANDARD_PREIS_EINSTELLUNGEN,
  euroText,
  euroTextZehntelcent,
  pruefeEinstellungen,
  richtpreis,
  runde,
  teileGerundet,
  type KostenEingabe,
  type PreisEinstellungen,
} from "./richtpreis";

const roh: PreisEinstellungen = {
  gemeinkostenProzent: 0,
  gewinnProzent: 0,
  mindestpreisCent: 0,
  rundungSchrittCent: 1,
  rundungRichtung: "kaufmaennisch",
  spanneUntenProzent: 0,
  spanneObenProzent: 0,
  mwstProzent: 0,
};
const mit = (p: Partial<PreisEinstellungen>): PreisEinstellungen => ({ ...roh, ...p });
const ein = (kostenZehntelcent: number, p: Partial<KostenEingabe> = {}): KostenEingabe => ({
  auflage: 100,
  kostenZehntelcent,
  vollstaendig: true,
  ohneKosten: [],
  ...p,
});
function preis(e: KostenEingabe, s: PreisEinstellungen) {
  const r = richtpreis(e, s);
  if (r.status !== "preis") throw new Error("kein Preis: " + r.gruende.join("; "));
  return r;
}

describe("Ganzzahl-Hilfen", () => {
  it("rundet kaufmännisch, Mitte weg von null", () => {
    expect(teileGerundet(5, 10)).toBe(1);
    expect(teileGerundet(4, 10)).toBe(0);
    expect(teileGerundet(-5, 10)).toBe(-1);
    expect(teileGerundet(15, 10)).toBe(2);
  });
  it("rundet auf Schritte", () => {
    expect(runde(1201, 100, "auf")).toBe(1300);
    expect(runde(1200, 100, "auf")).toBe(1200);
    expect(runde(1249, 100, "kaufmaennisch")).toBe(1200);
    expect(runde(1250, 100, "kaufmaennisch")).toBe(1300);
    expect(runde(1201, 500, "auf")).toBe(1500);
    expect(runde(5001, 1000, "auf")).toBe(6000);
    expect(runde(1234, 1, "auf")).toBe(1234);
  });
  it("formatiert Euro ohne Gleitkomma", () => {
    expect(euroText(123456)).toBe("1.234,56 €");
    expect(euroText(5)).toBe("0,05 €");
    expect(euroTextZehntelcent(125)).toBe("0,125 €");
    expect(euroTextZehntelcent(120)).toBe("0,12 €");
  });
});

describe("Richtpreis", () => {
  it("rechnet Kosten + Gemeinkosten + Gewinn, brutto mit 19 % MwSt", () => {
    // 100,00 € Kosten = 100000 Zehntelcent; +15 % = 115000; +10 % auf die Summe = 126500 = 126,50 €
    const r = preis(ein(100_000), mit({ gemeinkostenProzent: 15, gewinnProzent: 10, mwstProzent: 19 }));
    expect(r.rechenweg.gemeinkostenZehntelcent).toBe(15_000);
    expect(r.rechenweg.gewinnZehntelcent).toBe(11_500);
    expect(r.preis.nettoCent).toBe(12_650);
    // 126,50 * 1,19 = 150,535 -> 150,54 (kaufmännisch)
    expect(r.preis.bruttoCent).toBe(15_054);
    expect(r.kennzeichnung).toBe("unverbindlicher Richtpreis");
  });

  it("rechnet krumme Prozentsätze exakt (Hundertstel-Prozent)", () => {
    const r = preis(ein(33_333), mit({ gemeinkostenProzent: 12.34, gewinnProzent: 7.5 }));
    // 33333 * 1234 / 10000 = 4113,28 -> 4113; Zwischensumme 37446; Gewinn 37446*750/10000 = 2808,45 -> 2808
    expect(r.rechenweg.gemeinkostenZehntelcent).toBe(4113);
    expect(r.rechenweg.gewinnZehntelcent).toBe(2808);
    expect(r.preis.nettoCent).toBe(Math.round((37446 + 2808) / 10));
  });

  it("hebt auf den Mindestpreis je Auftrag an und meldet es", () => {
    const klein = preis(ein(10_000), mit({ mindestpreisCent: 2500 }));
    expect(klein.preis.nettoCent).toBe(2500);
    expect(klein.mindestpreisAngewendet).toBe(true);
    const gross = preis(ein(100_000), mit({ mindestpreisCent: 2500 }));
    expect(gross.preis.nettoCent).toBe(10_000);
    expect(gross.mindestpreisAngewendet).toBe(false);
  });

  it("rundet auf volle 1/5/10 Euro (auf) bzw. kaufmännisch", () => {
    const e = ein(123_450); // 123,45 €
    expect(preis(e, mit({ rundungSchrittCent: 100, rundungRichtung: "auf" })).preis.nettoCent).toBe(12_400);
    expect(preis(e, mit({ rundungSchrittCent: 500, rundungRichtung: "auf" })).preis.nettoCent).toBe(12_500);
    expect(preis(e, mit({ rundungSchrittCent: 1000, rundungRichtung: "auf" })).preis.nettoCent).toBe(13_000);
    expect(preis(e, mit({ rundungSchrittCent: 1000, rundungRichtung: "kaufmaennisch" })).preis.nettoCent).toBe(12_000);
    expect(preis(e, mit({ rundungSchrittCent: 1, rundungRichtung: "auf" })).preis.nettoCent).toBe(12_345);
  });

  it("bildet die Spanne um den Richtpreis, geordnet und nicht unter dem Mindestpreis", () => {
    const r = preis(ein(100_000), mit({ spanneUntenProzent: 10, spanneObenProzent: 20, rundungSchrittCent: 100, rundungRichtung: "auf" }));
    expect(r.von.nettoCent).toBe(9_000);
    expect(r.preis.nettoCent).toBe(10_000);
    expect(r.bis.nettoCent).toBe(12_000);
    const m = preis(ein(100_000), mit({ spanneUntenProzent: 50, mindestpreisCent: 8_000 }));
    expect(m.von.nettoCent).toBe(8_000);
    // Rundung darf die Reihenfolge nicht verletzen
    const k = preis(ein(10_200), mit({ spanneUntenProzent: 1, spanneObenProzent: 1, rundungSchrittCent: 1000, rundungRichtung: "auf" }));
    expect(k.von.nettoCent).toBeLessThanOrEqual(k.preis.nettoCent);
    expect(k.bis.nettoCent).toBeGreaterThanOrEqual(k.preis.nettoCent);
  });

  it("rechnet MwSt für jede Grenze und je Stück/je 1.000", () => {
    const r = preis(ein(100_000, { auflage: 250 }), mit({ mwstProzent: 7, spanneObenProzent: 10, spanneUntenProzent: 10 }));
    expect(r.von.bruttoCent).toBe(Math.round(9_000 * 1.07));
    expect(r.preis.bruttoCent).toBe(10_700);
    expect(r.jeStueckZehntelcent).toBe(400); // 10000 ct / 250 = 40 ct = 400 zc
    expect(r.je1000Cent).toBe(40_000);
  });

  it("liefert mit den Standard-Einstellungen plausible Werte", () => {
    const r = preis(ein(50_000), STANDARD_PREIS_EINSTELLUNGEN); // 50 € Kosten
    expect(r.preis.nettoCent % 100).toBe(0);
    expect(r.preis.nettoCent).toBeGreaterThanOrEqual(2500);
    expect(r.von.nettoCent).toBeLessThanOrEqual(r.preis.nettoCent);
    expect(r.bis.nettoCent).toBeGreaterThanOrEqual(r.preis.nettoCent);
  });

  it("gibt bei unvollständiger Kalkulation keinen Preis, sondern Preis auf Anfrage mit Grund", () => {
    for (const e of [
      ein(100_000, { vollstaendig: false }),
      ein(100_000, { ohneKosten: ["Material: Graupappe"] }),
      ein(100_000, { offen: ["Endformat"] }),
      ein(0),
    ]) {
      const r = richtpreis(e, STANDARD_PREIS_EINSTELLUNGEN);
      expect(r.status).toBe("auf_anfrage");
      if (r.status === "auf_anfrage") {
        expect(r.gruende.length).toBeGreaterThan(0);
        expect(JSON.stringify(r)).not.toMatch(/nettoCent/);
      }
    }
    const r = richtpreis(ein(1, { ohneKosten: ["Material: X"], offen: ["Format"] }), STANDARD_PREIS_EINSTELLUNGEN);
    expect(r.status === "auf_anfrage" && r.gruende).toEqual([
      "Angaben fehlen: Format",
      "Kosten fehlen: Material: X",
    ]);
  });
});

describe("Einstellungen prüfen", () => {
  it("nimmt Standardwerte für Fehlendes und lehnt Ungültiges mit deutschem Text ab", () => {
    expect(pruefeEinstellungen({})).toEqual({ ok: true, wert: STANDARD_PREIS_EINSTELLUNGEN });
    const f = pruefeEinstellungen({ gewinnProzent: -1, mwstProzent: 12.345, rundungSchrittCent: 7, rundungRichtung: "ab" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.fehler.length).toBe(4);
      expect(f.fehler.join(" ")).toMatch(/Gewinn/);
    }
    const g = pruefeEinstellungen({ gewinnProzent: 12.5, rundungSchrittCent: 500 });
    expect(g.ok && g.wert.gewinnProzent).toBe(12.5);
  });
});
