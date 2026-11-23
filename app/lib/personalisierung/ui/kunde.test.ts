import { describe, expect, it } from "vitest";
import type { Meldung } from "../render/typen";
import type { Variable } from "../schema";
import {
  ausDatensaetzen,
  dupliziereEintrag,
  gesamtAuflage,
  istLeer,
  kurzText,
  leseAuflage,
  loescheEintrag,
  meldungsText,
  neuerEintrag,
  setzeAuflageFuerAlle,
  statusVon,
  uebernehmeTabelle,
  wertePruefungAus,
  zaehleStatus,
  zuDatensaetzen,
} from "./kunde";

const VAR: Variable[] = [
  { schluessel: "name", bezeichnung: "Name", pflicht: true, beispiel: "", maxLaenge: 40, hilfe: "" },
  { schluessel: "telefon", bezeichnung: "Telefon", pflicht: false, beispiel: "", maxLaenge: null, hilfe: "" },
];
const m = (datensatz: number | null, schwere: "fehler" | "warnung", variable: string | null, text: string): Meldung => ({ schwere, code: "pflicht_leer", datensatz, feld: null, variable, text });

describe("Einträge", () => {
  it("legt leere Einträge je Variable an und wandelt in Datensätze (ohne UID)", () => {
    const e = neuerEintrag(VAR, 5);
    expect(e.werte).toEqual({ name: "", telefon: "" });
    expect(istLeer(e)).toBe(true);
    const ds = zuDatensaetzen([{ ...e, werte: { name: "Anna", telefon: "" } }]);
    expect(ds).toEqual([{ werte: { name: "Anna", telefon: "" }, auflage: 5 }]);
    expect(JSON.stringify(ds)).not.toContain("uid");
    const zurueck = ausDatensaetzen([{ werte: { name: "Bernd" }, auflage: 2 }], VAR);
    expect(zurueck[0].werte).toEqual({ name: "Bernd", telefon: "" });
    expect(new Set([...zurueck, ...ausDatensaetzen(ds, VAR)].map((x) => x.uid)).size).toBe(2);
  });
  it("dupliziert direkt hinter dem Original und löscht mit sinnvoller Folgeauswahl", () => {
    const a = { ...neuerEintrag(VAR), werte: { name: "A", telefon: "" } };
    const b = { ...neuerEintrag(VAR), werte: { name: "B", telefon: "" } };
    const d = dupliziereEintrag([a, b], a.uid);
    expect(d.eintraege.map((x) => x.werte.name)).toEqual(["A", "A", "B"]);
    expect(d.uid).toBe(d.eintraege[1].uid);
    expect(d.eintraege[1].uid).not.toBe(a.uid);
    const l = loescheEintrag(d.eintraege, d.eintraege[1].uid);
    expect(l.eintraege.map((x) => x.werte.name)).toEqual(["A", "B"]);
    expect(l.auswahl).toBe(l.eintraege[1].uid);
    expect(loescheEintrag([a], a.uid)).toEqual({ eintraege: [], auswahl: null });
  });
  it("Tabelle ersetzen oder anhängen; leere Standardzeile fällt weg", () => {
    const leer = neuerEintrag(VAR);
    const voll = { ...neuerEintrag(VAR), werte: { name: "A", telefon: "" } };
    const neu = ausDatensaetzen([{ werte: { name: "X" }, auflage: 1 }, { werte: { name: "Y" }, auflage: 1 }], VAR);
    expect(uebernehmeTabelle([leer], neu, "anhaengen").map((e) => e.werte.name)).toEqual(["X", "Y"]);
    expect(uebernehmeTabelle([voll], neu, "anhaengen").map((e) => e.werte.name)).toEqual(["A", "X", "Y"]);
    expect(uebernehmeTabelle([voll], neu, "ersetzen")).toBe(neu);
  });
  it("Auflage: für alle setzen, begrenzen, Eingabe lesen", () => {
    const e = [neuerEintrag(VAR, 1), neuerEintrag(VAR, 7)];
    expect(setzeAuflageFuerAlle(e, 250).map((x) => x.auflage)).toEqual([250, 250]);
    expect(setzeAuflageFuerAlle(e, 0).map((x) => x.auflage)).toEqual([1, 1]);
    expect(setzeAuflageFuerAlle(e, 999999).map((x) => x.auflage)).toEqual([100000, 100000]);
    expect(gesamtAuflage(e)).toBe(8);
    expect(leseAuflage("1.000")).toBe(1000);
    expect(leseAuflage("12,5")).toBeNull();
    expect(leseAuflage("0")).toBeNull();
    expect(leseAuflage("abc")).toBeNull();
  });
  it("Kurztext zeigt die ersten ausgefüllten Werte, gekürzt", () => {
    const e = { ...neuerEintrag(VAR), werte: { name: "Anna   Beispiel", telefon: "123" } };
    expect(kurzText(e, VAR)).toBe("Anna Beispiel · 123");
    expect(kurzText({ ...e, werte: { name: "x".repeat(80), telefon: "" } }, VAR, 20)).toHaveLength(20);
  });
});

describe("Auswertung der Prüfung", () => {
  const meldungen = [
    m(1, "fehler", "name", "Datensatz 1, Feld „Name“: Pflichtfeld „Name“ ist leer."),
    m(1, "warnung", null, "Datensatz 1, Feld „Text“: Der Text wird verkleinert gedruckt (8,0 statt 10 pt)."),
    m(3, "warnung", null, "Datensatz 3: Hinweis"),
    m(null, "warnung", null, "Gilt für die Vorlage"),
    m(9, "fehler", "name", "außerhalb"),
  ];
  it("verteilt Meldungen auf Einträge und Zellen", () => {
    const a = wertePruefungAus(meldungen, 3);
    expect(a[0].fehler).toHaveLength(1);
    expect(a[0].hinweise).toHaveLength(1);
    expect(a[0].nachVariable.name).toEqual([meldungen[0].text]);
    expect(a[1]).toEqual({ fehler: [], hinweise: [], nachVariable: {} });
    expect(a[2].hinweise).toHaveLength(1);
    expect(zaehleStatus(a)).toEqual({ ok: 1, hinweis: 1, fehler: 1 });
    const e = neuerEintrag(VAR);
    expect(statusVon(a[0], e)).toBe("fehler");
    expect(statusVon(a[2], e)).toBe("hinweis");
    expect(statusVon(a[1], e)).toBe("ok");
    expect(statusVon(undefined, e)).toBe("leer");
  });
  it("entfernt den Vorspann „Datensatz n,“ aus Meldungstexten", () => {
    expect(meldungsText(meldungen[0])).toBe("Feld „Name“: Pflichtfeld „Name“ ist leer.");
    expect(meldungsText(meldungen[2])).toBe("Hinweis");
    expect(meldungsText(meldungen[3])).toBe("Gilt für die Vorlage");
  });
});
