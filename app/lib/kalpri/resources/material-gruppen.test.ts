import { describe, expect, it } from 'vitest';
import {
  STANDARD_GRUPPEN,
  gruppeAendern,
  gruppeEntfernen,
  gruppeHinzufuegen,
  gruppenVon,
  materialAendern,
  materialHinzufuegen,
  pruefeMaterial,
  type Lager,
  type Material,
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

/** Ausschnitt aus dem Lager des Nutzers (30.10.). */
const LAGER: Lager = {
  version: 1,
  bestaende: [],
  materialien: [
    material({ id: 'L1', sorte: 'Bilderdruck matt', oberflaeche: 'gestrichen' }),
    material({ id: 'S1', sorte: 'Magno Silk', grammatur: 170 }),
  ],
};

describe('Einkaufsgruppen (T70, aus den T68-Gruppen umbenannt)', () => {
  it('ohne eigene Liste die vorbelegten', () => {
    expect(gruppenVon(LAGER).map((g) => g.name)).toEqual([
      'Offset / ungestrichen',
      'Preprint',
      'gestrichen matt',
      'gestrichen glänzend',
      'gestrichen silk',
      'strukturiert',
      'Folie / beschichtet',
    ]);
    expect(STANDARD_GRUPPEN.find((g) => g.id === 'matt')?.oberflaeche).toBe('gestrichen');
  });

  it('Gruppe anlegen, umbenennen, entfernen; Material nur mit vorhandener Gruppe', () => {
    const a = gruppeHinzufuegen(LAGER, { name: 'Kundenpapiere Müller' });
    if (!a.ok) throw new Error(JSON.stringify(a.fehler));
    expect(a.wert.gruppen?.map((g) => g.id)).toEqual([
      'offset',
      'preprint',
      'matt',
      'glanz',
      'silk',
      'struktur',
      'folie',
      'G01',
    ]);
    expect(gruppeHinzufuegen(a.wert, { name: 'gestrichen MATT' })).toEqual({
      ok: false,
      fehler: [{ pfad: 'name', meldung: 'Gruppe doppelt: gestrichen MATT' }],
    });
    const b = gruppeAendern(a.wert, { id: 'G01', name: 'Kunde Müller', oberflaeche: 'gestrichen' });
    if (!b.ok) throw new Error(JSON.stringify(b.fehler));
    expect(b.wert.gruppen?.at(-1)).toEqual({
      id: 'G01',
      name: 'Kunde Müller',
      oberflaeche: 'gestrichen',
    });
    expect(gruppeAendern(a.wert, { id: 'G99', name: 'x' })).toEqual({
      ok: false,
      fehler: [{ pfad: 'id', meldung: 'Gruppe G99 nicht gefunden' }],
    });

    const l1 = LAGER.materialien[0];
    if (!l1) throw new Error('L1 fehlt');
    const mitGruppe = materialAendern(LAGER, { ...l1, gruppeId: 'silk' });
    if (!mitGruppe.ok) throw new Error(JSON.stringify(mitGruppe.fehler));
    const c = gruppeEntfernen(mitGruppe.wert, 'silk');
    if (!c.ok) throw new Error(JSON.stringify(c.fehler));
    expect(c.wert.geloest).toBe(1);
    expect(c.wert.lager.materialien.find((m) => m.id === 'L1')?.gruppeId).toBeUndefined();
    expect(gruppeEntfernen(mitGruppe.wert, 'gibt-es-nicht')).toEqual({
      ok: false,
      fehler: [{ pfad: 'id', meldung: 'Gruppe gibt-es-nicht nicht gefunden' }],
    });

    expect(
      materialHinzufuegen(LAGER, {
        form: 'Bogen',
        sorte: 'Neu',
        grammatur: 100,
        breiteUm: 1,
        hoeheUm: 1,
        gruppeId: 'gibt-es-nicht',
      }),
    ).toEqual({
      ok: false,
      fehler: [{ pfad: 'gruppeId', meldung: 'Gruppe gibt-es-nicht nicht gefunden' }],
    });
    const d = materialAendern(LAGER, { ...l1, gruppeId: 'weg' });
    expect(d.ok ? [] : d.fehler).toEqual([
      { pfad: 'materialien.0.gruppeId', meldung: 'Gruppe weg nicht gefunden' },
    ]);
    expect(materialAendern(LAGER, { ...l1, gruppeId: 'silk' }).ok).toBe(true);
  });
});
