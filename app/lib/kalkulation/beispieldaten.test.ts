import { describe, expect, it } from "vitest";
import { beispielSicherung } from "./beispieldaten";
import { STANDARD_PREIS_EINSTELLUNGEN } from "./richtpreis";
import { berechneIntern, oeffentlicheFragen } from "./richtpreisService";
import { datenAusSicherung, shopFreigegeben } from "./schnittstelle";
import { pruefeSicherung } from "./store";

const sicherung = beispielSicherung("2026-11-23");

describe("Beispieldaten", () => {
  it("sind eine gültige werkbank-sicherung", () => {
    const p = pruefeSicherung(sicherung);
    expect(p.ok, JSON.stringify(p)).toBe(true);
    const d = datenAusSicherung(sicherung);
    expect(d.ok, JSON.stringify(d)).toBe(true);
  });

  it("geben mindestens einen Artikel für den Shop frei, einen nicht", () => {
    const d = datenAusSicherung(sicherung);
    if (!d.ok) throw new Error("ungültig");
    expect(d.daten.artikel.filter(shopFreigegeben).length).toBeGreaterThanOrEqual(2);
    expect(d.daten.artikel.some((a) => !shopFreigegeben(a))).toBe(true);
  });

  it("liefern für den Flyer einen vollständigen Richtpreis", () => {
    const d = datenAusSicherung(sicherung);
    if (!d.ok) throw new Error("ungültig");
    const flyer = d.daten.artikel.find((a) => a.id === "A-FLYER")!;
    const fragen = oeffentlicheFragen(flyer, d.daten);
    const antworten = Object.fromEntries(fragen.map((f) => [f.schluessel, f.optionen[0]!.wert]));
    const r = berechneIntern(d.daten, flyer, [100, 1000], antworten, STANDARD_PREIS_EINSTELLUNGEN, { nurOeffentlicheFragen: true, heute: "2026-11-23" });
    if (!r.ok) throw new Error(r.meldung);
    expect(r.auflagen.every((a) => a.richtpreis.status === "preis")).toBe(true);
    const [klein, gross] = r.auflagen.map((a) => (a.richtpreis.status === "preis" ? a.richtpreis.preis.nettoCent : 0)) as [number, number];
    expect(gross).toBeGreaterThan(klein);
    expect(gross).toBeLessThan(klein * 10); // Mengenvorteil: 10-fache Auflage kostet weniger als das 10-fache
  });
});
