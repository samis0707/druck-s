import { describe, expect, it } from 'vitest';
import {
  BILD_MAX_ZEICHEN,
  leeresLager,
  stanzformHinzufuegen,
  type Lager,
  type PruefErgebnis,
} from './index';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

function fehler(e: PruefErgebnis<Lager>) {
  return e.ok ? [] : e.fehler;
}

describe('Bild und Art Prägen an der Stanzform', () => {
  it('nimmt PNG und JPEG als Daten-URL an, Prägen ist eine Art', () => {
    const e = stanzformHinzufuegen(leeresLager(), {
      name: 'Prägung Logo',
      nutzen: 1,
      art: 'praegen',
      bild: PNG,
    });
    expect(e.ok && e.wert.stanzformen?.[0]).toMatchObject({ art: 'praegen', bild: PNG });
    expect(stanzformHinzufuegen(leeresLager(), { name: 'X', nutzen: 1, bild: JPG }).ok).toBe(true);
  });

  it('lehnt andere Formate, kaputte Daten und zu große Bilder ab', () => {
    const x = { name: 'X', nutzen: 1 };
    const meldung = (bild: string) => fehler(stanzformHinzufuegen(leeresLager(), { ...x, bild }));
    expect(meldung('data:image/svg+xml;base64,PHN2Zz4=')).toEqual([
      { pfad: 'bild', meldung: 'Bild muss PNG oder JPEG sein' },
    ]);
    expect(meldung('https://example.com/form.png')).toEqual([
      { pfad: 'bild', meldung: 'Bild muss PNG oder JPEG sein' },
    ]);
    expect(meldung(`data:image/jpeg;base64,${'A'.repeat(BILD_MAX_ZEICHEN)}`)).toEqual([
      { pfad: 'bild', meldung: 'Bild ist zu groß' },
    ]);
    expect(fehler(stanzformHinzufuegen(leeresLager(), { ...x, art: 'falzen' }))).toEqual([
      {
        pfad: 'art',
        meldung: 'Art muss stanzen, rillen, perforieren, praegen oder kombiniert sein',
      },
    ]);
  });
});
