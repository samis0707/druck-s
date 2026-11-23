import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  STANDARD_TIEGEL,
  lagerAlsJson,
  lagerAusJson,
  leeresLager,
  naechsteStanzformId,
  pruefeLager,
  stanzformAendern,
  stanzformEntfernen,
  stanzformHinweise,
  stanzformHinzufuegen,
  teilbogenAusHerkunft,
  type Lager,
  type LagerStanzform,
  type PruefErgebnis,
} from './index';

const mm = (x: number) => Math.round(x * 1000);

function wert(e: PruefErgebnis<Lager>): Lager {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

function fehler(e: PruefErgebnis<Lager>) {
  return e.ok ? [] : e.fehler;
}

/** Nur Pflichtfelder: Name und Nutzen je Form. */
const minimal = { name: 'Etikett oval', nutzen: 12 };

function beispiel(): LagerStanzform {
  const f = BEISPIEL_LAGER.stanzformen?.[0];
  if (!f) throw new Error('Beispiel-Stanzform fehlt');
  return f;
}

describe('Stanzformen im Lager', () => {
  it('Beispiel-Lager: F0001 SRA3 geviertelt ist gültig und ohne Hinweis', () => {
    expect(pruefeLager(BEISPIEL_LAGER).ok).toBe(true);
    expect(beispiel()).toMatchObject({ id: 'F0001', nutzen: 4 });
    expect(stanzformHinweise(beispiel())).toEqual([]);
    expect(STANDARD_TIEGEL).toEqual({ breiteUm: 260000, hoeheUm: 380000, greiferUm: 9000 });
  });

  it('ältere Lager ohne Stanzformen bleiben gültig, JSON bleibt verlustfrei', () => {
    expect(pruefeLager(leeresLager()).ok).toBe(true);
    expect(lagerAlsJson(leeresLager())).not.toContain('stanzformen');
    const text = lagerAlsJson(BEISPIEL_LAGER);
    expect(lagerAlsJson(wert(lagerAusJson(text)))).toBe(text);
  });

  it('hinzufügen: nur Pflichtfelder genügen, ID wird vergeben (F0001, dann F0002)', () => {
    expect(naechsteStanzformId(leeresLager())).toBe('F0001');
    const l1 = wert(stanzformHinzufuegen(leeresLager(), minimal));
    expect(l1.stanzformen).toEqual([{ id: 'F0001', name: 'Etikett oval', nutzen: 12 }]);
    const l2 = wert(stanzformHinzufuegen(l1, { ...minimal, id: '  ' }));
    expect(l2.stanzformen?.map((f) => f.id)).toEqual(['F0001', 'F0002']);
    expect(naechsteStanzformId(BEISPIEL_LAGER)).toBe('F0002');
    expect(leeresLager().stanzformen).toBeUndefined();
  });

  it('Fehler ohne Präfix am Feld: Pflicht, Nutzen, Datum, Formate, doppelte ID', () => {
    expect(fehler(stanzformHinzufuegen(leeresLager(), { nutzen: 0 }))).toEqual([
      { pfad: 'name', meldung: 'Pflichtfeld' },
      { pfad: 'nutzen', meldung: 'muss größer als 0 sein' },
    ]);
    expect(
      fehler(
        stanzformHinzufuegen(leeresLager(), {
          ...minimal,
          nutzen: 2.5,
          angeschafftAm: '2026-02-30',
        }),
      ),
    ).toEqual([
      { pfad: 'nutzen', meldung: 'muss eine ganze Zahl sein' },
      { pfad: 'angeschafftAm', meldung: 'Datum im Format JJJJ-MM-TT' },
    ]);
    expect(
      fehler(
        stanzformHinzufuegen(leeresLager(), {
          ...minimal,
          tiegelbogen: { breiteUm: mm(330), hoeheUm: mm(460) },
          herkunft: { druckbogen: { breiteUm: mm(320), hoeheUm: mm(450) } },
          endformat: { breiteUm: mm(500), hoeheUm: mm(10) },
        }),
      ),
    ).toEqual([
      { pfad: 'tiegelbogen', meldung: 'Tiegelbogen ist größer als der Druckbogen' },
      { pfad: 'endformat', meldung: 'Endformat ist größer als der Tiegelbogen' },
    ]);
    expect(fehler(stanzformHinzufuegen(BEISPIEL_LAGER, { ...minimal, id: 'F0001' }))).toEqual([
      { pfad: 'id', meldung: 'ID doppelt: F0001' },
    ]);
    expect(
      fehler(stanzformHinzufuegen(leeresLager(), { ...minimal, art: 'falzen', kunde: ' ' })),
    ).toEqual([
      {
        pfad: 'art',
        meldung: 'Art muss stanzen, rillen, perforieren, praegen oder kombiniert sein',
      },
      { pfad: 'kunde', meldung: 'darf nicht leer sein' },
    ]);
  });

  it('ändern und entfernen, die Eingabe bleibt unverändert', () => {
    const vorher = JSON.stringify(BEISPIEL_LAGER);
    const geaendert = wert(stanzformAendern(BEISPIEL_LAGER, { ...beispiel(), nutzen: 6 }));
    expect(geaendert.stanzformen?.[0]?.nutzen).toBe(6);
    expect(fehler(stanzformAendern(BEISPIEL_LAGER, { ...beispiel(), nutzen: -1 }))).toEqual([
      { pfad: 'nutzen', meldung: 'muss größer als 0 sein' },
    ]);
    expect(fehler(stanzformAendern(BEISPIEL_LAGER, { ...minimal, id: 'F0099' }))).toEqual([
      { pfad: 'id', meldung: 'Stanzform F0099 nicht gefunden' },
    ]);
    expect(wert(stanzformEntfernen(BEISPIEL_LAGER, 'F0001')).stanzformen).toEqual([]);
    expect(fehler(stanzformEntfernen(BEISPIEL_LAGER, 'F0099'))).toEqual([
      { pfad: 'id', meldung: 'Stanzform F0099 nicht gefunden' },
    ]);
    expect(JSON.stringify(BEISPIEL_LAGER)).toBe(vorher);
  });

  it('Teilbogen aus der Herkunft: gleich große Teile, Abfall dazwischen, abgerundet', () => {
    const sra3 = { breiteUm: mm(320), hoeheUm: mm(450) };
    expect(teilbogenAusHerkunft({ druckbogen: sra3 })).toEqual(sra3);
    expect(
      teilbogenAusHerkunft({ druckbogen: sra3, teilung: { spalten: 2, zeilen: 2, abfallUm: 0 } }),
    ).toEqual({ breiteUm: 160000, hoeheUm: 225000 });
    expect(
      teilbogenAusHerkunft({
        druckbogen: sra3,
        teilung: { spalten: 3, zeilen: 2, abfallUm: mm(10) },
      }),
    ).toEqual({ breiteUm: 100000, hoeheUm: 220000 });
    expect(
      teilbogenAusHerkunft({ druckbogen: sra3, teilung: { spalten: 3, zeilen: 1, abfallUm: 0 } }),
    ).toEqual({ breiteUm: 106666, hoeheUm: 450000 });
    expect(
      teilbogenAusHerkunft({
        druckbogen: sra3,
        teilung: { spalten: 2, zeilen: 1, abfallUm: mm(320) },
      }),
    ).toBeNull();
  });

  it('Hinweise: Tiegel (auch gedreht), Teilung, nichts hinterlegt', () => {
    const halb = { ...beispiel(), tiegelbogen: { breiteUm: mm(320), hoeheUm: mm(225) } };
    expect(stanzformHinweise(halb)).toEqual([
      'Tiegelbogen passt nur gedreht in den Tiegel (260 × 380 mm)',
      'Tiegelbogen passt nicht zur Teilung (berechnet 160 × 225 mm)',
    ]);
    const ganz = {
      ...minimal,
      id: 'F0009',
      tiegelbogen: { breiteUm: mm(320), hoeheUm: mm(450) },
    };
    expect(stanzformHinweise(ganz)).toEqual([
      'Tiegelbogen passt nicht in den Tiegel (260 × 380 mm)',
    ]);
    const gedreht = { ...beispiel(), tiegelbogen: { breiteUm: mm(225), hoeheUm: mm(160) } };
    expect(stanzformHinweise(gedreht)).toEqual([]);
    expect(stanzformHinweise({ ...minimal, id: 'F0009' })).toEqual([
      'Tiegelbogen nicht hinterlegt',
    ]);
    expect(stanzformHinweise(ganz, { breiteUm: mm(330), hoeheUm: mm(480) })).toEqual([]);
  });
});
