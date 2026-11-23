import { describe, expect, it } from "vitest";
import { parseVorlage, VorlageSchema } from "../schema";
import { testVorlage } from "../test-support";
import {
  besterRastversatz,
  dupliziereFeld,
  entferneFeld,
  feldWarnungen,
  festhalten,
  fuegeFeldHinzu,
  fuegePlatzhalterEin,
  groesseAendern,
  laengeZuMm,
  laengeZuPx,
  mmZuPx,
  neuerVerlauf,
  pfeilSchritt,
  pxZuMm,
  rasteGroesse,
  rasteVerschieben,
  rueckgaengig,
  rundeMm,
  schluesselAusBezeichnung,
  setze,
  setzeBezeichnung,
  setzeLive,
  setzeRechteck,
  veroeffentlichungsProbleme,
  verschiebe,
  wiederholen,
} from "./editor";

const leer = () => {
  const r = parseVorlage({ name: "Test", endformat: { breite: 85, hoehe: 55 }, beschnitt: 3, design: { dateiId: null } });
  if (!r.ok) throw new Error("x");
  return r.vorlage;
};
const FORMAT = { breite: 85, hoehe: 55, beschnitt: 3 };

describe("Verlauf", () => {
  it("rückgängig und wiederholen", () => {
    let v = neuerVerlauf(1);
    v = setze(v, 2);
    v = setze(v, 3);
    expect(v.aktuell).toBe(3);
    v = rueckgaengig(v);
    expect(v.aktuell).toBe(2);
    v = rueckgaengig(v);
    expect(v.aktuell).toBe(1);
    expect(rueckgaengig(v)).toBe(v);
    v = wiederholen(v);
    expect(v.aktuell).toBe(2);
    v = wiederholen(v);
    expect(v.aktuell).toBe(3);
    expect(wiederholen(v)).toBe(v);
  });
  it("eine neue Änderung verwirft die Wiederholen-Liste", () => {
    let v = setze(setze(neuerVerlauf(1), 2), 3);
    v = rueckgaengig(v);
    v = setze(v, 9);
    expect(v.zukunft).toEqual([]);
    expect(rueckgaengig(v).aktuell).toBe(2);
  });
  it("fasst Tippen mit gleichem Schlüssel zusammen, aber nicht nach Pause oder anderem Schlüssel", () => {
    let v = neuerVerlauf("");
    v = setze(v, "a", { schluessel: "name", jetzt: 1000 });
    v = setze(v, "ab", { schluessel: "name", jetzt: 1300 });
    v = setze(v, "abc", { schluessel: "name", jetzt: 1600 });
    expect(v.vergangen).toEqual([""]);
    v = setze(v, "abcd", { schluessel: "name", jetzt: 5000 });
    expect(v.vergangen).toEqual(["", "abc"]);
    v = setze(v, "x", { schluessel: "anderes", jetzt: 5100 });
    expect(v.vergangen).toEqual(["", "abc", "abcd"]);
  });
  it("Ziehen: Live-Stand ohne Schritt, festhalten macht genau einen Schritt", () => {
    const start = neuerVerlauf(0);
    let v = setzeLive(start, 1);
    v = setzeLive(v, 2);
    v = setzeLive(v, 3);
    expect(v.vergangen).toEqual([]);
    v = festhalten(v, start.aktuell);
    expect(v.vergangen).toEqual([0]);
    expect(rueckgaengig(v).aktuell).toBe(0);
  });
  it("begrenzt die Länge", () => {
    let v = neuerVerlauf(0);
    for (let i = 1; i <= 150; i++) v = setze(v, i);
    expect(v.vergangen.length).toBe(100);
  });
});

describe("mm ↔ px", () => {
  const m = { pxProMm: 4, beschnitt: 3 };
  it("rechnet mit Beschnittversatz hin und zurück", () => {
    expect(mmZuPx(0, m)).toBe(12);
    expect(mmZuPx(10, m)).toBe(52);
    expect(pxZuMm(52, m)).toBe(10);
    expect(pxZuMm(mmZuPx(12.3, m), m)).toBeCloseTo(12.3, 9);
    expect(laengeZuPx(5, m)).toBe(20);
    expect(laengeZuMm(20, m)).toBe(5);
  });
  it("rundet auf 0,1 mm ohne -0", () => {
    expect(rundeMm(12.34)).toBe(12.3);
    expect(rundeMm(12.36)).toBe(12.4);
    expect(Object.is(rundeMm(-0.04), 0)).toBe(true);
    expect(rundeMm(0.30000000000000004)).toBe(0.3);
  });
});

describe("Einrasten", () => {
  it("rastet an Seitenmitte und Rand ein und liefert Hilfslinien", () => {
    // Feld 20 breit, Mitte bei 42.5 − 0.5 → soll auf die Seitenmitte 42.5 rasten
    const r = rasteVerschieben({ x: 31.9, y: 10, breite: 20, hoehe: 10 }, FORMAT, [], 1);
    expect(r.rechteck.x).toBeCloseTo(32.5, 9);
    expect(r.linien).toContainEqual({ achse: "x", pos: 42.5 });
    const rand = rasteVerschieben({ x: 0.6, y: 0.4, breite: 20, hoehe: 10 }, FORMAT, [], 1);
    expect(rand.rechteck.x).toBe(0);
    expect(rand.rechteck.y).toBe(0);
  });
  it("rastet an Kanten und Mitten anderer Felder ein", () => {
    const andere = [{ x: 10, y: 30, breite: 30, hoehe: 10 }];
    const r = rasteVerschieben({ x: 10.7, y: 12, breite: 20, hoehe: 10 }, FORMAT, andere, 1);
    expect(r.rechteck.x).toBe(10);
    const m = rasteVerschieben({ x: 20.4, y: 12, breite: 10, hoehe: 10 }, FORMAT, andere, 1); // Mitte 25.4 → Mitte des anderen 25
    expect(m.rechteck.x).toBeCloseTo(20, 9);
  });
  it("rastet nicht außerhalb der Schwelle und nimmt die nächste Linie", () => {
    const r = rasteVerschieben({ x: 5, y: 20, breite: 20, hoehe: 10 }, FORMAT, [], 1);
    expect(r.rechteck.x).toBe(5);
    expect(r.linien).toEqual([]);
    expect(besterRastversatz([10], [8, 10.5, 12], 1)).toEqual({ versatz: 0.5, ziel: 10.5 });
    expect(besterRastversatz([10], [20], 1)).toBeNull();
  });
  it("rastet beim Größenändern die bewegte Kante ein", () => {
    const start = { x: 10, y: 10, breite: 30, hoehe: 10 };
    const r = rasteGroesse(start, "e", 32.8, 0, FORMAT, [], 1); // rechte Kante 72.8 → Seitenrand 85? nein; Mitte 42.5/85: 72.8 nicht in der Nähe
    expect(r.rechteck.breite).toBeCloseTo(62.8, 9);
    const r2 = rasteGroesse(start, "e", 44.7, 0, FORMAT, [], 1); // 84.7 → 85
    expect(r2.rechteck.x + r2.rechteck.breite).toBeCloseTo(85, 9);
    expect(r2.linien).toContainEqual({ achse: "x", pos: 85 });
  });
});

describe("Größe ändern", () => {
  const start = { x: 10, y: 10, breite: 20, hoehe: 10 };
  it("zieht an Griffen, die Gegenkante bleibt stehen", () => {
    expect(groesseAendern(start, "e", 5, 0)).toEqual({ x: 10, y: 10, breite: 25, hoehe: 10 });
    expect(groesseAendern(start, "w", -5, 0)).toEqual({ x: 5, y: 10, breite: 25, hoehe: 10 });
    expect(groesseAendern(start, "se", 2, 3)).toEqual({ x: 10, y: 10, breite: 22, hoehe: 13 });
    expect(groesseAendern(start, "nw", -2, -3)).toEqual({ x: 8, y: 7, breite: 22, hoehe: 13 });
  });
  it("unterschreitet die Mindestgröße nie", () => {
    const r = groesseAendern(start, "e", -100, 0);
    expect(r.breite).toBe(2);
    expect(r.x).toBe(10);
    const l = groesseAendern(start, "w", 100, 0);
    expect(l.breite).toBe(2);
    expect(l.x + l.breite).toBe(30);
  });
  it("hält QR-Codes quadratisch", () => {
    const q = { x: 10, y: 10, breite: 20, hoehe: 20 };
    const r = groesseAendern(q, "se", 5, 2, { quadrat: true });
    expect(r.breite).toBe(r.hoehe);
    expect(r.x).toBe(10);
    expect(r.y).toBe(10);
    const nw = groesseAendern(q, "nw", -4, -1, { quadrat: true });
    expect(nw.breite).toBe(nw.hoehe);
    expect(nw.x + nw.breite).toBe(30);
    expect(nw.y + nw.hoehe).toBe(30);
  });
  it("Pfeiltasten: 0,1 mm, mit Umschalt 1 mm", () => {
    expect(pfeilSchritt(false)).toBe(0.1);
    expect(pfeilSchritt(true)).toBe(1);
    const r = verschiebe({ x: 10, y: 10, breite: 5, hoehe: 5 }, 0.1, -1);
    expect(r.x).toBe(10.1);
    expect(r.y).toBe(9);
  });
});

describe("Eingaben und Platzhalter", () => {
  it("bildet Platzhalter-Namen aus der Bezeichnung", () => {
    expect(schluesselAusBezeichnung("Telefon (mobil)")).toBe("telefon_mobil");
    expect(schluesselAusBezeichnung("Straße & Hausnr.")).toBe("strasse_hausnr");
    expect(schluesselAusBezeichnung("Größe")).toBe("groesse");
    expect(schluesselAusBezeichnung("123")).toBe("f_123");
    expect(schluesselAusBezeichnung("")).toBe("feld");
    expect(schluesselAusBezeichnung("Auflage")).toBe("auflage_1");
    expect(schluesselAusBezeichnung("Name", ["name", "name_2"])).toBe("name_3");
  });
  it("Umbenennen zieht die Verweise in allen Feldern mit", () => {
    const v = testVorlage();
    const w = setzeBezeichnung(v, "telefon", "Telefon geschäftlich");
    expect(w.variablen.some((x) => x.schluessel === "telefon_geschaeftlich")).toBe(true);
    expect(JSON.stringify(w.felder)).not.toContain("{{telefon}}");
    expect(JSON.stringify(w.felder)).toContain("{{telefon_geschaeftlich}}");
    // die Vorlage bleibt gültig (keine hängenden Verweise)
    expect(VorlageSchema.safeParse(w).success).toBe(true);
  });
  it("fügt Platzhalter an der Cursorposition ein", () => {
    expect(fuegePlatzhalterEin("Tel. ", 5, 5, "telefon")).toEqual({ text: "Tel. {{telefon}}", cursor: 16 });
    expect(fuegePlatzhalterEin("abcdef", 2, 4, "x")).toEqual({ text: "ab{{x}}ef", cursor: 7 });
    expect(fuegePlatzhalterEin("ab", 99, 99, "x").text).toBe("ab{{x}}");
  });
});

describe("Felder", () => {
  it("legt Felder mittig an und erzeugt die passende Eingabe; Ergebnis ist gültig", () => {
    let v = leer();
    for (const art of ["text", "mehrzeilig", "qr", "barcode", "vcard"] as const) {
      const r = fuegeFeldHinzu(v, art, "vorne");
      v = r.vorlage;
      const f = v.felder.find((x) => x.id === r.id)!;
      expect(f.x + f.breite / 2).toBeCloseTo(42.5, 1);
      expect(f.y + f.hoehe / 2).toBeCloseTo(27.5, 1);
    }
    expect(v.felder).toHaveLength(5);
    expect(new Set(v.felder.map((f) => f.id)).size).toBe(5);
    expect(v.variablen.length).toBeGreaterThanOrEqual(4);
    const p = VorlageSchema.safeParse({ ...v, design: { ...v.design, dateiId: "11111111-1111-4111-8111-111111111111" } });
    expect(p.success).toBe(true);
    const text = v.felder.find((f) => f.typ === "text" && f.umbruch === "einzeilig");
    const mehr = v.felder.find((f) => f.typ === "text" && f.umbruch === "mehrzeilig");
    expect(text && mehr).toBeTruthy();
  });
  it("ordnet vCard-Eigenschaften vorhandenen Eingaben automatisch zu", () => {
    const v = testVorlage();
    const r = fuegeFeldHinzu(v, "vcard", "vorne");
    const f = r.vorlage.felder.find((x) => x.id === r.id);
    expect(f?.typ === "vcard" && f.zuordnung.telefon).toBe("{{telefon}}");
    expect(f?.typ === "vcard" && f.zuordnung.email).toBe("{{email}}");
  });
  it("Löschen entfernt nur Eingaben, die kein anderes Feld nutzt", () => {
    let v = leer();
    const a = fuegeFeldHinzu(v, "text", "vorne");
    v = a.vorlage;
    const keyA = v.variablen[0].schluessel;
    const d = dupliziereFeld(v, a.id)!; // zweites Feld nutzt dieselbe Eingabe
    v = d.vorlage;
    expect(entferneFeld(v, a.id).variablen.map((x) => x.schluessel)).toContain(keyA);
    const ohneBeide = entferneFeld(entferneFeld(v, a.id), d.id);
    expect(ohneBeide.variablen).toHaveLength(0);
  });
  it("setzeRechteck rundet auf 0,1 mm", () => {
    const v = fuegeFeldHinzu(leer(), "text", "vorne");
    const w = setzeRechteck(v.vorlage, v.id, { x: 5.04, y: 6.66, breite: 20.04, hoehe: 7.01 });
    expect(w.felder[0]).toMatchObject({ x: 5, y: 6.7, breite: 20, hoehe: 7 });
  });
});

describe("Warnungen", () => {
  it("meldet Beschnitt, Außenbereich, Randnähe, kleine QR und leere vCard verständlich", () => {
    let v = leer();
    v = { ...v, design: { ...v.design, dateiId: "11111111-1111-4111-8111-111111111111" } };
    const a = fuegeFeldHinzu(v, "text", "vorne");
    v = a.vorlage;
    v = setzeRechteck(v, a.id, { x: -1, y: 10, breite: 20, hoehe: 7 });
    expect(feldWarnungen(v).some((w) => /ragt in den Beschnitt/.test(w.text))).toBe(true);
    v = setzeRechteck(v, a.id, { x: -10, y: 10, breite: 20, hoehe: 7 });
    expect(feldWarnungen(v).some((w) => w.schwere === "fehler" && /außerhalb/.test(w.text))).toBe(true);
    v = setzeRechteck(v, a.id, { x: 1, y: 10, breite: 20, hoehe: 7 });
    expect(feldWarnungen(v).some((w) => /3 mm am Rand/.test(w.text))).toBe(true);
    v = setzeRechteck(v, a.id, { x: 10, y: 10, breite: 20, hoehe: 7 });
    expect(feldWarnungen(v).filter((w) => w.feldId === a.id)).toEqual([]);
    const q = fuegeFeldHinzu(v, "qr", "vorne");
    const klein = setzeRechteck(q.vorlage, q.id, { x: 40, y: 20, breite: 10, hoehe: 10 });
    expect(feldWarnungen(klein).some((w) => /scannen/.test(w.text))).toBe(true);
    const vc = fuegeFeldHinzu(leer(), "vcard", "vorne");
    expect(feldWarnungen(vc.vorlage).some((w) => w.schwere === "fehler" && /Kontaktdaten/.test(w.text))).toBe(true);
  });
  it("Veröffentlichen ist erst mit Design, Feld und fehlerfreier Lage möglich", () => {
    const v = leer();
    expect(veroeffentlichungsProbleme(v).length).toBeGreaterThanOrEqual(2);
    const ok = { ...fuegeFeldHinzu({ ...v, design: { ...v.design, dateiId: "11111111-1111-4111-8111-111111111111" } }, "text", "vorne").vorlage };
    expect(veroeffentlichungsProbleme(ok)).toEqual([]);
  });
});
