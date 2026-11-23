import { describe, expect, it } from 'vitest';
import {
  preisanpassungAusfuehren,
  preisanpassungenVon,
  preisanpassungVorschau,
  pruefeMaterial,
  type Lager,
  type Material,
  type Preis,
} from './index';

function material(eingabe: Record<string, unknown>): Material {
  const r = pruefeMaterial({
    form: 'Bogen',
    grammatur: 135,
    breiteUm: 700_000,
    hoeheUm: 1_000_000,
    ...eingabe,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

const EINGABE = { lieferant: 'Berberich', gruppeId: 'offset', gueltigAb: '2026-12-01', prozent: 5 };
const BEFEHL = { ...EINGABE, wann: '2026-10-30T12:00:00.000Z' };

function lagerMitPreisen(): Lager {
  return {
    version: 1,
    materialien: [
      material({ id: 'L1', sorte: 'Bilderdruck matt', gruppeId: 'offset' }),
      material({ id: 'L2', sorte: 'GardaMatt Art', gruppeId: 'offset' }),
      material({ id: 'L9', sorte: 'Ohne Gruppe', gruppeId: 'offset' }),
    ],
    bestaende: [],
    preise: [
      {
        id: 'P0001',
        materialId: 'L1',
        lieferant: 'Berberich',
        gueltigAb: '2026-01-01',
        basis: 'je1000',
        betragZehntelcent: 101,
      },
      {
        id: 'P0002',
        materialId: 'L2',
        lieferant: 'Andere',
        gueltigAb: '2026-01-01',
        basis: 'einheit',
        einheitName: 'Ries',
        inhalt: 250,
        staffel: [
          { ab: 1, betragZehntelcent: 1001 },
          { ab: 10, betragZehntelcent: 899 },
        ],
      },
    ],
  };
}

const ALT_L1: Preis = lagerMitPreisen().preise![0]!;

/** Der letzte Preis Eintrag (häufig der frisch angehängte). */
function letzterPreis(lager: Lager): Preis {
  const preis = lager.preise?.at(-1);
  if (preis === undefined) throw new Error('kein letzter Preis');
  return preis;
}

describe('Sammelaktion Vorschau (T70)', () => {
  it('betroffene und übersprungene Materialien; Material anderer Gruppen fehlt', () => {
    const r = preisanpassungVorschau(lagerMitPreisen(), EINGABE);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect(r.wert.betroffen).toHaveLength(1);
    const zeile = r.wert.betroffen[0];
    expect(zeile && [zeile.materialId, zeile.sorte, zeile.lieferant]).toEqual([
      'L1',
      'Bilderdruck matt',
      'Berberich',
    ]);
    expect(zeile && zeile.alt).toEqual(ALT_L1);
    expect(zeile && zeile.neu).toEqual({
      materialId: 'L1',
      lieferant: 'Berberich',
      gueltigAb: '2026-12-01',
      basis: 'je1000',
      betragZehntelcent: 106,
    });
    expect(r.wert.uebersprungen.map((u) => [u.materialId, u.grund])).toEqual([
      ['L2', 'kein gültiger Preis von Berberich'],
      ['L9', 'kein gültiger Preis von Berberich'],
    ]);
  });

  it('Material mit Preis genau ab dem Anpassungsdatum wird übersprungen ("bereits Preis ab diesem Datum")', () => {
    const lager = lagerMitPreisen();
    lager.preise?.push({
      id: 'P0003',
      materialId: 'L2',
      lieferant: 'Berberich',
      gueltigAb: '2026-12-01',
      basis: 'je1000',
      betragZehntelcent: 500,
    });
    const r = preisanpassungVorschau(lager, EINGABE);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect(r.wert.betroffen.map((z) => z.materialId)).toEqual(['L1']);
    expect(r.wert.uebersprungen.map((u) => [u.materialId, u.grund])).toEqual([
      ['L2', 'bereits Preis ab diesem Datum'],
      ['L9', 'kein gültiger Preis von Berberich'],
    ]);
  });

  it('Eingabe wird geprüft: Lieferant, gültig ab, unbekannte Gruppe, Prozent bis -100', () => {
    const lager = lagerMitPreisen();
    expect(preisanpassungVorschau(lager, { ...EINGABE, lieferant: '' })).toEqual({
      ok: false,
      fehler: [{ pfad: 'lieferant', meldung: 'Pflichtfeld' }],
    });
    expect(preisanpassungVorschau(lager, { ...EINGABE, gueltigAb: '2026-13-01' })).toEqual({
      ok: false,
      fehler: [{ pfad: 'gueltigAb', meldung: 'Datum im Format JJJJ-MM-TT' }],
    });
    expect(preisanpassungVorschau(lager, { ...EINGABE, gruppeId: 'gibt-es-nicht' })).toEqual({
      ok: false,
      fehler: [{ pfad: 'gruppeId', meldung: 'Gruppe gibt-es-nicht nicht gefunden' }],
    });
    expect(preisanpassungVorschau(lager, { ...EINGABE, prozent: -100 })).toEqual({
      ok: false,
      fehler: [{ pfad: 'prozent', meldung: 'muss größer als -100 sein' }],
    });
  });
});

describe('Sammelaktion Ausführen (T70)', () => {
  it('neuer Eintrag ab Datum, alter Eintrag unverändert, Anpassung gespeichert', () => {
    const r = preisanpassungAusfuehren(lagerMitPreisen(), BEFEHL);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const lager = r.wert;
    expect(lager.preise).toHaveLength(3);
    expect(lager.preise?.[2]).toMatchObject({
      materialId: 'L1',
      lieferant: 'Berberich',
      gueltigAb: '2026-12-01',
      basis: 'je1000',
      betragZehntelcent: 106,
    });
    expect(lager.preise?.[0]).toEqual(ALT_L1);
    expect(preisanpassungenVon(lager)).toEqual([
      {
        wann: '2026-10-30T12:00:00.000Z',
        lieferant: 'Berberich',
        gruppeId: 'offset',
        gueltigAb: '2026-12-01',
        prozent: 5,
        materialien: 1,
      },
    ]);
  });

  it('alle Staffelpreise mit demselben Faktor', () => {
    const r = preisanpassungAusfuehren(lagerMitPreisen(), { ...BEFEHL, lieferant: 'Andere' });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect(r.wert.preise?.[2]).toMatchObject({
      materialId: 'L2',
      basis: 'einheit',
      einheitName: 'Ries',
      inhalt: 250,
      staffel: [
        { ab: 1, betragZehntelcent: 1051 },
        { ab: 10, betragZehntelcent: 944 },
      ],
    });
  });

  it('je 100 kg passt sich mit demselben Faktor an', () => {
    const lager = lagerMitPreisen();
    const erstes = lager.materialien[0];
    if (erstes === undefined) throw new Error('L1 fehlt');
    erstes.grammatur = 135;
    lager.preise = [
      {
        id: 'P0001',
        materialId: 'L1',
        lieferant: 'Berberich',
        gueltigAb: '2026-01-01',
        basis: 'je100kg',
        betragZehntelcent: 12345,
      },
    ];
    const r = preisanpassungAusfuehren(lager, BEFEHL);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect(r.wert.preise?.[1]).toMatchObject({ basis: 'je100kg', betragZehntelcent: 12962 });
  });

  it('negativer Prozentsatz senkt den Preis', () => {
    const r = preisanpassungAusfuehren(lagerMitPreisen(), { ...BEFEHL, prozent: -3 });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect(r.wert.preise?.[2]).toMatchObject({ basis: 'je1000', betragZehntelcent: 98 });
  });

  it('zwei Anpassungen nacheinander: Rundung nach der Regel, Abweichung zum exakten Wert < 1 Zehntelcent', () => {
    // x = 101 (Freigabe-Beispiel): 101 × 1,05 = 106,05 → 106; 106 × 1,03 = 109,18 → 109
    const erste = preisanpassungAusfuehren(lagerMitPreisen(), BEFEHL);
    if (!erste.ok) throw new Error(JSON.stringify(erste.fehler));
    const zweite = preisanpassungAusfuehren(erste.wert, {
      ...BEFEHL,
      gueltigAb: '2027-03-01',
      prozent: 3,
    });
    if (!zweite.ok) throw new Error(JSON.stringify(zweite.fehler));
    const letzter = letzterPreis(zweite.wert);
    expect(letzter.basis).toBe('je1000');
    if (letzter.basis !== 'je1000') throw new Error('Basis je1000 erwartet');
    expect(letzter.betragZehntelcent).toBe(109);
    expect(Math.abs(letzter.betragZehntelcent - 101 * 1.05 * 1.03)).toBeLessThan(1);
    // x = 111: erstes Stellenrunden sichtbar (116,55 → 117), dann 117 × 1,03 = 120,51 → 121
    const basis: Lager = {
      version: 1,
      materialien: [material({ id: 'L4', sorte: 'Kette', gruppeId: 'offset' })],
      bestaende: [],
      preise: [
        {
          id: 'P0001',
          materialId: 'L4',
          lieferant: 'Berberich',
          gueltigAb: '2026-01-01',
          basis: 'je1000',
          betragZehntelcent: 111,
        },
      ],
    };
    const schritt1 = preisanpassungAusfuehren(basis, BEFEHL);
    if (!schritt1.ok) throw new Error(JSON.stringify(schritt1.fehler));
    const schritt2 = preisanpassungAusfuehren(schritt1.wert, {
      ...BEFEHL,
      gueltigAb: '2027-03-01',
      prozent: 3,
    });
    if (!schritt2.ok) throw new Error(JSON.stringify(schritt2.fehler));
    const letzter2 = letzterPreis(schritt2.wert);
    expect(letzter2.basis).toBe('je1000');
    if (letzter2.basis !== 'je1000') throw new Error('Basis je1000 erwartet');
    expect(letzter2.betragZehntelcent).toBe(121);
    expect(Math.abs(letzter2.betragZehntelcent - 111 * 1.05 * 1.03)).toBeLessThan(1);
  });

  it('Material mit Preis genau ab dem Datum bekommt keinen zweiten Eintrag am selben Tag', () => {
    const lager = lagerMitPreisen();
    lager.preise?.push({
      id: 'P0003',
      materialId: 'L2',
      lieferant: 'Berberich',
      gueltigAb: '2026-12-01',
      basis: 'je1000',
      betragZehntelcent: 500,
    });
    const r = preisanpassungAusfuehren(lager, BEFEHL);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect(r.wert.preise).toHaveLength(4);
    expect(
      r.wert.preise?.filter((p) => p.materialId === 'L2' && p.lieferant === 'Berberich'),
    ).toHaveLength(1);
    expect(preisanpassungenVon(r.wert)).toEqual([
      {
        wann: '2026-10-30T12:00:00.000Z',
        lieferant: 'Berberich',
        gruppeId: 'offset',
        gueltigAb: '2026-12-01',
        prozent: 5,
        materialien: 1,
      },
    ]);
  });

  it('ohne betroffenes Material abgelehnt: kein Eintrag, keine Preise angehängt', () => {
    const lager = lagerMitPreisen();
    lager.preise = []; // kein Material der Gruppe hat einen Preis von Berberich
    const r = preisanpassungAusfuehren(lager, BEFEHL);
    expect(r).toEqual({
      ok: false,
      fehler: [{ pfad: '', meldung: 'Keine Materialien betroffen' }],
    });
    expect(preisanpassungenVon(lager)).toEqual([]);
    expect(lager.preise).toEqual([]);
  });

  it('Ausführung prüft die Eingabe: wann, prozent, unbekannte Gruppe', () => {
    const lager = lagerMitPreisen();
    expect(preisanpassungAusfuehren(lager, { ...EINGABE, wann: '  ' })).toEqual({
      ok: false,
      fehler: [
        { pfad: 'wann', meldung: 'Pflichtfeld' },
        { pfad: 'wann', meldung: 'Zeitpunkt im Format ISO, z. B. 2026-10-30T12:00:00.000Z' },
      ],
    });
    expect(preisanpassungAusfuehren(lager, { ...BEFEHL, prozent: -100 })).toEqual({
      ok: false,
      fehler: [{ pfad: 'prozent', meldung: 'muss größer als -100 sein' }],
    });
    expect(preisanpassungAusfuehren(lager, { ...BEFEHL, gruppeId: 'gib-es-nicht' })).toEqual({
      ok: false,
      fehler: [{ pfad: 'gruppeId', meldung: 'Gruppe gib-es-nicht nicht gefunden' }],
    });
  });
});
