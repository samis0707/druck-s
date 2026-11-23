import { describe, expect, it } from 'vitest';
import {
  ArtikelSchema,
  BEISPIEL_PRODUKTION,
  PRODUKTARTEN,
  produktDerArt,
  produktFehlt,
} from './index';

// T136: Produktarten füllen die Beschreibung vor

const KOPF = { titel: 'Test', einheit: 'Stueck' as const };

describe('Produktarten (T136)', () => {
  it('1 jede Art ergibt ein gültiges Produkt, „gelieferte Ware“ keins', () => {
    for (const a of PRODUKTARTEN) {
      const p = produktDerArt(a.art, KOPF, BEISPIEL_PRODUKTION);
      if (a.art === 'ware') expect(p).toBeNull();
      else expect(ArtikelSchema.safeParse(p).success).toBe(true);
    }
  });

  it('2 Broschüre: Umschlag liegt um Inhalt, Seiten vorbelegt', () => {
    const p = produktDerArt('broschuere', KOPF, BEISPIEL_PRODUKTION);
    expect(p?.teile.map((t) => [t.name, t.liegtUm, t.seiten])).toEqual([
      ['Umschlag', 'T2', { zustand: 'fest', wert: 4 }],
      ['Inhalt', undefined, { zustand: 'fest', wert: 8 }],
    ]);
  });

  it('3 Visitenkarte: Format fest, es fehlt nur das Material', () => {
    const p = produktDerArt('visitenkarte', KOPF, BEISPIEL_PRODUKTION);
    if (!p) throw new Error('p');
    expect(produktFehlt(p)).toEqual(['Karte: Material']);
  });

  it('4 Block: 25 Blatt einseitig und unbedruckte Rückenpappe', () => {
    const p = produktDerArt('block', KOPF, BEISPIEL_PRODUKTION);
    expect(p?.teile.map((t) => [t.name, t.jeProdukt])).toEqual([
      ['Blatt', 25],
      ['Rückenpappe', 1],
    ]);
    expect(p?.teile[1]?.druck).toEqual({ zustand: 'fest', wert: 'ohne' });
  });
});

describe('Loseblatt (T138)', () => {
  it('Blätter je Satz mit Bohren, Zusammentragen am ganzen Produkt (aus dem Katalog)', () => {
    const p = {
      ...BEISPIEL_PRODUKTION,
      arbeitsschritte: [
        ...BEISPIEL_PRODUKTION.arbeitsschritte,
        // im Beispiel zählt „Zusammentragen“ je Lage (Teil); wie beim Nutzer je Satz:
        { id: 'S0990', name: 'Satzweise zusammentragen', einheit: 'Satz' as const },
      ],
      arbeitsplaetze: (BEISPIEL_PRODUKTION.arbeitsplaetze ?? []).map((x, i) =>
        i === 0 ? { ...x, schritte: [...x.schritte, { schrittId: 'S0990' }] } : x,
      ),
    };
    const a = produktDerArt('loseblatt', KOPF, p);
    expect(ArtikelSchema.safeParse(a).success).toBe(true);
    expect(a?.teile.map((t) => [t.name, t.jeProdukt])).toEqual([['Blatt', 10]]);
    expect(a?.teile[0]?.merkmale?.[0]?.name).toBe('Bohren');
    expect(a?.merkmale).toEqual([
      { name: 'Satzweise zusammentragen', wert: { zustand: 'fest', wert: 'ja' } },
    ]);
  });
});
