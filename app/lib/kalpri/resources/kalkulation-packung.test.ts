import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationHinzufuegen,
  leereKalkulationen,
  pruefeMaterial,
  preisHinzufuegen,
  rechneKalkulation,
  type Lager,
  type Material,
  type ZeilenErgebnis,
} from './index';

/** Bilderdruck 135 g 70 × 100 im Ries à 250, Preis je 1.000 Bogen (180 €). */
function lager(packung: Material['packung']): Lager {
  const materialien = BEISPIEL_LAGER.materialien.map((m) =>
    m.id === 'L1' ? { ...m, ...(packung === undefined ? {} : { packung }) } : m,
  );
  const r = preisHinzufuegen(
    { ...BEISPIEL_LAGER, materialien },
    {
      materialId: 'L1',
      lieferant: 'Papier Union',
      gueltigAb: '2026-01-01',
      basis: 'je1000',
      betragZehntelcent: 180_000,
    },
  );
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

function papierZeile(l: Lager, zeile: Record<string, unknown> = {}): ZeilenErgebnis {
  const r = kalkulationHinzufuegen(leereKalkulationen(), {
    titel: 'Papier',
    auflagen: [100],
    einheit: 'Stueck',
    zeilen: [
      {
        id: 'Z1',
        art: 'material',
        materialId: 'L1',
        menge: { art: 'hand', mengen: [35] },
        ...zeile,
      },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k = r.wert.kalkulationen[0];
  if (!k) throw new Error('keine Kalkulation');
  const z = rechneKalkulation(k, BEISPIEL_PRODUKTION, l, '2026-10-27').auflagen[0]?.zeilen[0];
  if (!z) throw new Error('Zeile fehlt');
  return z;
}

describe('Packung am Material', () => {
  it('Schema: Einheit und Inhalt Pflicht, Anbruch freiwillig', () => {
    const l1 = BEISPIEL_LAGER.materialien.find((m) => m.id === 'L1');
    expect(pruefeMaterial({ ...l1, packung: { einheit: 'Ries', inhalt: 250 } }).ok).toBe(true);
    const falsch = pruefeMaterial({ ...l1, packung: { einheit: ' ', inhalt: 0 } });
    expect(falsch.ok ? [] : falsch.fehler).toEqual([
      { pfad: 'packung.einheit', meldung: 'Pflichtfeld' },
      { pfad: 'packung.inhalt', meldung: 'muss größer als 0 sein' },
    ]);
  });

  it('auf ganze Packungen: der Inhalt kommt vom Material, auch bei Preis je 1.000', () => {
    const z = papierZeile(lager({ einheit: 'Ries', inhalt: 250 }), { rundung: { art: 'packung' } });
    expect(z).toMatchObject({ menge: 35, mengeAbgerechnet: 250 });
    expect(z.rechenweg[0]).toBe('Benötigt 35 Bogen → einkalkuliert 250 (1 Ries à 250)');
    expect(z.kostenVoll?.zehntelcent).toBe(45_000);
  });

  it('kein Anbruch am Material: rundet ohne Angabe in der Zeile; Zeile mit Vielfachem geht vor', () => {
    const l = lager({ einheit: 'Ries', inhalt: 250, anbruch: false });
    expect(papierZeile(l).rechenweg[0]).toBe(
      'Benötigt 35 Bogen → einkalkuliert 250 (1 Ries à 250, kein Anbruch)',
    );
    expect(papierZeile(l, { rundung: { art: 'vielfaches', auf: 50 } }).mengeAbgerechnet).toBe(50);
  });

  it('ohne Packung am Material und ohne Preis je Packung: genaue Menge mit Hinweis', () => {
    const z = papierZeile(lager(undefined), { rundung: { art: 'packung' } });
    expect(z.mengeAbgerechnet).toBe(35);
    expect(z.hinweise).toEqual([
      'Rundung auf Packung: keine Packung am Material und kein Preis je Packung – genaue Menge gerechnet',
    ]);
  });
});
