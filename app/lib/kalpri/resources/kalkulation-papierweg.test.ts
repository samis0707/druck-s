import { describe, expect, it } from 'vitest';
import { formatEuro, type Geld } from '@druck/units';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationHinzufuegen,
  leereKalkulationen,
  mengeAusQuelle,
  preisHinzufuegen,
  rechneKalkulation,
  type AuflagenErgebnis,
  type Kalkulation,
  type Lager,
  type Material,
  type Produktion,
  type ZeilenErgebnis,
} from './index';

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

function fehler(e: { ok: true } | { ok: false; fehler: { pfad: string; meldung: string }[] }) {
  return e.ok ? [] : e.fehler;
}

const euro = (g: Geld | null) => (g === null ? '–' : formatEuro(g));

const JUWEL: Material = {
  id: 'JUWEL',
  sorte: 'Juwel Premium Card glatt',
  grammatur: 320,
  dickeUm: 380,
  form: 'Bogen',
  breiteUm: 650_000,
  hoeheUm: 920_000,
};

const GARDA: Material = {
  id: 'GARDA135',
  sorte: 'GardaMatt Art',
  grammatur: 135,
  oberflaeche: 'gestrichen',
  form: 'Bogen',
  breiteUm: 630_000,
  hoeheUm: 880_000,
};

/** Lager mit Juwel (Ries 100 = 84,84 €) und GardaMatt 135 g (Ries 250 = 25,33 €). */
function lager(): Lager {
  const mit = { ...BEISPIEL_LAGER, materialien: [...BEISPIEL_LAGER.materialien, JUWEL, GARDA] };
  const eins = wert(
    preisHinzufuegen(mit, {
      materialId: 'JUWEL',
      lieferant: 'Berberich',
      gueltigAb: '2026-01-01',
      basis: 'einheit',
      einheitName: 'Ries',
      inhalt: 100,
      staffel: [{ ab: 1, betragZehntelcent: 84_840 }],
    }),
  );
  return wert(
    preisHinzufuegen(eins, {
      materialId: 'GARDA135',
      lieferant: 'Berberich',
      gueltigAb: '2026-01-01',
      basis: 'einheit',
      einheitName: 'Ries',
      inhalt: 250,
      staffel: [{ ab: 1, betragZehntelcent: 25_330 }],
    }),
  );
}

/** Beispiel-Produktion, Digitaldruck mit 4 mm nicht bedruckbarem Rand. */
function produktion(): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C');
  if (!ton) throw new Error('AP-TON5C fehlt');
  ton.grenzen = { ...ton.grenzen, randUm: 4000 };
  return p;
}

function kalkulation(eingabe: Record<string, unknown>): Kalkulation {
  const daten = wert(kalkulationHinzufuegen(leereKalkulationen(), eingabe));
  const k = daten.kalkulationen[0];
  if (!k) throw new Error('keine Kalkulation');
  return k;
}

function auflage(k: Kalkulation, nr = 0, l: Lager = lager()): AuflagenErgebnis {
  const a = rechneKalkulation(k, produktion(), l, '2026-10-26').auflagen[nr];
  if (!a) throw new Error('Auflage fehlt');
  return a;
}

function zeile(a: AuflagenErgebnis, id: string): ZeilenErgebnis {
  const z = a.zeilen.find((x) => x.zeileId === id);
  if (!z) throw new Error(`Zeile ${id} fehlt`);
  return z;
}

const KARTE = {
  id: 'T1',
  name: 'Karte',
  materialId: 'JUWEL',
  endformat: { breiteUm: 85_000, hoeheUm: 55_000 },
  jeProdukt: 1,
  druckbogen: { breiteUm: 325_000, hoeheUm: 460_000 },
};

/** Visitenkarten 500 Stück: Papier auf 50 gerundet, Vorschneiden, Druck, Endschnitt, Ecken, Paket. */
const VISITENKARTEN = {
  titel: 'Visitenkarten 85 × 55',
  auflagen: [500],
  einheit: 'Stueck',
  teile: [KARTE],
  zeilen: [
    {
      id: 'Z1',
      art: 'material',
      materialId: 'JUWEL',
      menge: { art: 'papierweg', teilId: 'T1', wert: 'rohbogen' },
      rundung: { art: 'vielfaches', auf: 50 },
    },
    {
      id: 'Z2',
      art: 'arbeitsgang',
      platzId: 'AP-SCHN',
      schrittId: 'S0006',
      menge: { art: 'papierweg', teilId: 'T1', wert: 'vorschneiden' },
    },
    {
      id: 'Z3',
      art: 'arbeitsgang',
      platzId: 'AP-TON5C',
      schrittId: 'S0001',
      menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
    },
    {
      id: 'Z4',
      art: 'arbeitsgang',
      platzId: 'AP-SCHN',
      schrittId: 'S0006',
      menge: { art: 'papierweg', teilId: 'T1', wert: 'endschnitt', gestapelt: true },
    },
    {
      id: 'Z5',
      art: 'arbeitsgang',
      platzId: 'AP-KLEIN',
      schrittId: 'S0016',
      menge: { art: 'papierweg', teilId: 'T1', wert: 'stapel', faktor: 4 },
    },
    {
      id: 'Z6',
      art: 'arbeitsgang',
      platzId: 'AP-PACK',
      schrittId: 'S0020',
      menge: { art: 'produkt', teiler: 250 },
    },
  ],
};

describe('Rückwärtskalkulation über den Papierweg', () => {
  it('Visitenkarten: Zuschuss des Drucks erhöht Druckbogen und Rohbogen', () => {
    const a = auflage(kalkulation(VISITENKARTEN));
    expect(a.papierwege).toHaveLength(1);
    const pw = a.papierwege[0];
    expect(pw?.zuschuesse).toEqual([{ zeileId: 'Z3', druckbogen: 11 }]);
    expect(pw?.papierweg).toMatchObject({
      nutzenJeBogen: 21,
      druckbogenNetto: 24,
      zuschuss: 11,
      druckbogen: 35,
      rohbogen: 9,
    });
    // Druck verarbeitet 24 gute Bogen + 11 Zuschuss
    expect(zeile(a, 'Z3')).toMatchObject({ menge: 24, mengeGesamt: 35 });
    expect(zeile(a, 'Z3').hinweise).toEqual([
      'Teilkosten nicht hinterlegt',
      'Stundensatz vorläufig',
    ]);
    // Vorschneiden 9 Rohbogen: 3 Schnitte, 1 Stapel
    expect(zeile(a, 'Z2').menge).toBe(3);
    expect(zeile(a, 'Z2').rechenweg[0]).toBe(
      'Menge aus dem Papierweg: 3 Schnitte je Stapel × 1 Stapel (9 Rohbogen) = 3',
    );
    // Endschnitt Streifen aufeinander: 20 Schnitte
    expect(zeile(a, 'Z4').menge).toBe(20);
    // Ecken: 500 Karten × 0,38 mm ÷ 25 mm = 8 Stapel × 4 Ecken
    expect(zeile(a, 'Z5').menge).toBe(32);
    // Verpacken: 500 ÷ 250 = 2 Pakete
    expect(zeile(a, 'Z6').menge).toBe(2);
  });

  it('Material: benötigt 9 Rohbogen, einkalkuliert 50 (auf 50 gerundet)', () => {
    const z = zeile(auflage(kalkulation(VISITENKARTEN)), 'Z1');
    expect(z).toMatchObject({ menge: 9, mengeAbgerechnet: 50 });
    expect(euro(z.kostenVoll)).toBe('42,42 €');
    expect(z.rechenweg).toEqual([
      'Menge aus dem Papierweg: 9 Rohbogen (brutto, Zuschuss 11 Druckbogen) = 9',
      'Benötigt 9 Bogen → einkalkuliert 50 (auf 50 aufgerundet)',
      'Material: 50 Bogen × 848,40 € je 1.000 (Berberich) = 42,42 €',
    ]);
  });

  it('Material: genau, ganze Packung, Preis von Hand je 1.000 und je 100 kg', () => {
    const mit = (z1: Record<string, unknown>) =>
      zeile(
        auflage(kalkulation({ ...VISITENKARTEN, zeilen: [z1, ...VISITENKARTEN.zeilen.slice(1)] })),
        'Z1',
      );
    const basis = VISITENKARTEN.zeilen[0] as Record<string, unknown>;
    const { rundung: _weg, ...ohneRundung } = basis;
    void _weg;
    expect(euro(mit(ohneRundung).kostenVoll)).toBe('7,64 €');
    const packung = mit({ ...basis, rundung: { art: 'packung' } });
    expect(packung.mengeAbgerechnet).toBe(100);
    expect(euro(packung.kostenVoll)).toBe('84,84 €');
    const hand = mit({ ...ohneRundung, preisVonHand: { zehntelcent: 900_000, je: 'tausend' } });
    expect(euro(hand.kostenVoll)).toBe('8,10 €');
    expect(hand.rechenweg[1]).toBe(
      'Material: 9 Bogen × 900,00 € je 1.000 (Preis von Hand) = 8,10 €',
    );
    // 250 € je 100 kg; 65 × 92 cm, 320 g → 191,36 g je Bogen → 0,4784 € je Bogen
    const kg = mit({ ...ohneRundung, preisVonHand: { zehntelcent: 250_000, je: 'hundertKg' } });
    expect(euro(kg.kostenVoll)).toBe('4,31 €');
  });

  it('Druck prüft Grenzen am Druckbogen, nicht am Rohbogen 65 × 92', () => {
    // breiter Bogen > 330 mm nur bis 220 g: 32,5 cm Druckbogen bleibt geeignet
    const a = auflage(kalkulation(VISITENKARTEN));
    expect(zeile(a, 'Z3').hinweise.some((h) => h.includes('330 mm'))).toBe(false);
  });

  it('Weiterverarbeitung nach dem Zusammenführen erhöht jedes Teil (Broschüre)', () => {
    const k = kalkulation({
      titel: 'Broschüre A4, 4 + 16 Seiten',
      auflagen: [100],
      einheit: 'Stueck',
      teile: [
        {
          id: 'U',
          name: 'Umschlag',
          endformat: { breiteUm: 210_000, hoeheUm: 297_000 },
          offenesFormat: { breiteUm: 420_000, hoeheUm: 297_000 },
          jeProdukt: 1,
        },
        {
          id: 'I',
          name: 'Inhalt',
          materialId: 'GARDA135',
          endformat: { breiteUm: 210_000, hoeheUm: 297_000 },
          offenesFormat: { breiteUm: 420_000, hoeheUm: 297_000 },
          jeProdukt: 4,
          druckbogen: { breiteUm: 440_000, hoeheUm: 315_000 },
        },
      ],
      zeilen: [
        { id: 'Z1', art: 'zukauf', teilId: 'U', lieferant: 'Druckerei Nord', preise: [90_000] },
        {
          id: 'Z2',
          art: 'material',
          materialId: 'GARDA135',
          menge: { art: 'papierweg', teilId: 'I', wert: 'rohbogen' },
        },
        {
          id: 'Z3',
          art: 'arbeitsgang',
          platzId: 'AP-TON5C',
          schrittId: 'S0001',
          menge: { art: 'papierweg', teilId: 'I', wert: 'druckbogen' },
        },
        {
          id: 'Z4',
          art: 'arbeitsgang',
          platzId: 'AP-ZUS',
          schrittId: 'S0013',
          menge: { art: 'produkt' },
        },
      ],
    });
    const a = auflage(k);
    // Bookletmaker: 100 Hefte + 0,5 % (1) + 10 = 11 Zuschuss → 111 Exemplare vor dem Zusammentragen
    expect(zeile(a, 'Z4')).toMatchObject({ menge: 100, mengeGesamt: 111 });
    // Umschlag extern: Bestellmenge 111
    expect(zeile(a, 'Z1').menge).toBe(111);
    expect(zeile(a, 'Z1').rechenweg[0]).toBe(
      'Bestellmenge für Umschlag: 111 Stück (inkl. Zuschuss beim Zusammenführen)',
    );
    // Inhalt: 111 × 4 = 444 Druckbogen + Druckzuschuss 9 + 10 = 463; 4 je Rohbogen → 116
    const inhalt = a.papierwege.find((p) => p.teilId === 'I');
    expect(inhalt?.nutzenNetto).toBe(444);
    expect(inhalt?.papierweg).toMatchObject({
      druckbogenNetto: 444,
      druckbogen: 463,
      rohbogen: 116,
    });
    expect(inhalt?.papierweg.rechenweg[0]).toBe(
      'Exemplare: 100 + 11 Zuschuss beim Zusammenführen = 111',
    );
    expect(zeile(a, 'Z2').menge).toBe(116);
  });
});

describe('Prüfung der Bezüge', () => {
  it('Papierweg und Zukauf melden ein unbekanntes Teil', () => {
    const e = kalkulationHinzufuegen(leereKalkulationen(), {
      ...VISITENKARTEN,
      zeilen: [
        { ...VISITENKARTEN.zeilen[0], menge: { art: 'papierweg', teilId: 'T9', wert: 'rohbogen' } },
        { id: 'Z9', art: 'zukauf', teilId: 'T9', lieferant: 'X', preise: [1000] },
      ],
    });
    expect(fehler(e)).toEqual([
      { pfad: 'zeilen.0.menge.teilId', meldung: 'Teil T9 nicht vorhanden' },
      { pfad: 'zeilen.1.teilId', meldung: 'Teil T9 nicht vorhanden' },
    ]);
  });

  it('mengeAusQuelle kennt Papierweg und Produkt nicht ohne Kalkulation', () => {
    expect(mengeAusQuelle({ art: 'produkt' }, [100], 0, 'Stueck')).toBeNull();
    expect(
      mengeAusQuelle({ art: 'papierweg', teilId: 'T1', wert: 'druckbogen' }, [100], 0, 'Bogen'),
    ).toBeNull();
  });
});
