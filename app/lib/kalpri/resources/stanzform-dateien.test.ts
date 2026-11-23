import { describe, expect, it } from 'vitest';
import { leeresLager } from './lager';
import {
  stanzformAendern,
  stanzformAnhangEntfernen,
  stanzformDateiAnhaengen,
  stanzformDateiIds,
  stanzformHinzufuegen,
} from './stanzformen';
import type { Lager } from './lager-schema';
import type { PruefErgebnis } from './pruefung';

function wert(e: PruefErgebnis<Lager>): Lager {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const fassung = (id: string, name: string) => ({
  dateiId: id,
  name,
  typ: 'image/svg+xml',
  groesse: 1234,
  am: '2026-11-23',
});

describe('T185 Dateien an Stanzformen', () => {
  const lager = wert(
    stanzformHinzufuegen(leeresLager(), {
      name: 'Etikett oval',
      nutzen: 12,
      hersteller: 'Muster · von Claude',
      herstellerId: 'LF-0002',
    }),
  );
  const id = lager.stanzformen?.[0]?.id ?? '';

  it('hängt eine Datei an und eine zweite unter gleichem Titel als neue Fassung', () => {
    const l1 = wert(stanzformDateiAnhaengen(lager, id, 'Stanzkontur', fassung(A, 'oval.svg')));
    const l2 = wert(
      stanzformDateiAnhaengen(l1, id, 'stanzkontur ', {
        ...fassung(B, 'oval-v2.ai'),
        notiz: 'Anschnitt geändert',
      }),
    );
    const a = l2.stanzformen?.[0]?.anhaenge;
    expect(a).toHaveLength(1);
    expect(a?.[0]?.fassungen.map((f) => f.name)).toEqual(['oval.svg', 'oval-v2.ai']);
    expect(stanzformDateiIds(l2)).toEqual([A, B]);
    expect(l2.stanzformen?.[0]?.herstellerId).toBe('LF-0002');
  });

  it('neue Fassung über den Index, Entfernen nimmt nur aus der Liste', () => {
    const l1 = wert(stanzformDateiAnhaengen(lager, id, 'Stanzkontur', fassung(A, 'oval.dxf')));
    const l2 = wert(stanzformDateiAnhaengen(l1, id, 'egal', fassung(B, 'oval2.dxf'), 0));
    expect(l2.stanzformen?.[0]?.anhaenge?.[0]?.fassungen).toHaveLength(2);
    const l3 = wert(stanzformAnhangEntfernen(l2, id, 0));
    expect(l3.stanzformen?.[0]?.anhaenge).toBeUndefined();
  });

  it('prüft Kennung, Datum und Stanzform', () => {
    const e = stanzformDateiAnhaengen(lager, id, 'X', { ...fassung('zz', 'a.svg') });
    expect(e.ok).toBe(false);
    expect(stanzformDateiAnhaengen(lager, 'SF-9999', 'X', fassung(A, 'a.svg')).ok).toBe(false);
    expect(stanzformDateiAnhaengen(lager, id, 'X', fassung(A, 'a.svg'), 3).ok).toBe(false);
  });

  it('normales Ändern behält die Anhänge, wenn sie mitgegeben werden', () => {
    const l1 = wert(stanzformDateiAnhaengen(lager, id, 'Stanzkontur', fassung(A, 'oval.svg')));
    const form = l1.stanzformen?.[0];
    const l2 = wert(stanzformAendern(l1, { ...form, name: 'Etikett oval groß' }));
    expect(l2.stanzformen?.[0]?.anhaenge?.[0]?.titel).toBe('Stanzkontur');
  });
});
