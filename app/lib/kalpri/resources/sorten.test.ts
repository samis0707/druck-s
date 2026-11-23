import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  aktuellePreise,
  hauspapierUmbenennen,
  hauspapiere,
  istSortenPreis,
  preisHinzufuegen,
  preisHistorie,
  preisVergleichswerte,
  sorteHinzufuegen,
  sortenAnpassen,
  sortenAnpassungVorschau,
  sortenPreisHinzufuegen,
  type Lager,
} from './index';

// T169: Hauspapier + Lieferantensorten mit Preis je 100 kg, Anpassung je Lieferant

const ok = (r: { ok: boolean; wert?: Lager; fehler?: unknown }): Lager => {
  if (!r.ok || !r.wert) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
};

// L1 und L2 im Beispiel: „Bilderdruck matt“ 135 g und 300 g, 70 × 100
const mitSorten = () => {
  let l = ok(
    sorteHinzufuegen(
      BEISPIEL_LAGER,
      { papier: 'Bilderdruck matt', name: 'GardaMatt Art', lieferant: 'Berberich' },
      { je100kgZehntelcent: 185_000, gueltigAb: '2026-01-01' },
    ),
  );
  l = ok(
    sorteHinzufuegen(
      l,
      { papier: 'bilderdruck MATT', name: 'Magno Matt', lieferant: 'Ovol' },
      { je100kgZehntelcent: 179_000, gueltigAb: '2026-01-01' },
    ),
  );
  return l;
};

describe('Hauspapiere und Sorten (T169)', () => {
  it('Hauspapiere = Sorten-Namen von Bogen/Rolle mit Grammatur', () => {
    const h = hauspapiere(BEISPIEL_LAGER).find((x) => x.name === 'Bilderdruck matt');
    expect(h?.materialIds).toEqual(['L1', 'L2']);
  });

  it('jede Grammatur bekommt den Sortenpreis je 100 kg, je Lieferant', () => {
    const l = mitSorten();
    const preise = aktuellePreise(l, 'L1', '2026-11-17');
    expect(preise.map((p) => [p.lieferant, p.basis, istSortenPreis(p)])).toEqual([
      ['Berberich', 'je100kg', true],
      ['Ovol', 'je100kg', true],
    ]);
    // 70 × 100 cm, 135 g = 94,5 g je Bogen → 1.000 Bogen = 94,5 kg × 1,85 €/kg = 174,83 €
    const m = l.materialien.find((x) => x.id === 'L1')!;
    expect(preisVergleichswerte(m, preise[0]!).je1000?.zehntelcent).toBe(174_825);
    expect(aktuellePreise(l, 'L2', '2026-11-17')).toHaveLength(2);
  });

  it('eigener Preis am Material mit gleichem oder neuerem Datum geht vor', () => {
    const l = ok(
      preisHinzufuegen(mitSorten(), {
        materialId: 'L1',
        lieferant: 'Berberich',
        gueltigAb: '2026-06-01',
        basis: 'je100kg',
        betragZehntelcent: 200_000,
      }),
    );
    const b = aktuellePreise(l, 'L1', '2026-11-17').find((p) => p.lieferant === 'Berberich')!;
    expect([istSortenPreis(b), (b as { betragZehntelcent: number }).betragZehntelcent]).toEqual([
      false,
      200_000,
    ]);
  });

  it('Anpassung je Lieferant: Vorschau, neue Preise angehängt, Historie bleibt', () => {
    const l = mitSorten();
    const a = { lieferanten: ['berberich'], prozent: 4, gueltigAb: '2027-01-01' };
    expect(sortenAnpassungVorschau(l, a)).toEqual([
      {
        sorteId: 'LS-0001',
        sorte: 'GardaMatt Art',
        lieferant: 'Berberich',
        papier: 'Bilderdruck matt',
        alt: 185_000,
        neu: 192_400,
      },
    ]);
    const n = ok(sortenAnpassen(l, a));
    expect(n.sortenPreise?.at(-1)).toMatchObject({
      sorteId: 'LS-0001',
      je100kgZehntelcent: 192_400,
      gueltigAb: '2027-01-01',
      anlass: 'Anpassung +4 %',
    });
    expect(preisHistorie(n, 'L1').filter(istSortenPreis)).toHaveLength(3);
    const preis2027 = (tag: string) =>
      (
        aktuellePreise(n, 'L1', tag).find((p) => p.lieferant === 'Berberich') as {
          betragZehntelcent: number;
        }
      ).betragZehntelcent;
    expect([preis2027('2026-12-31'), preis2027('2027-01-01')]).toEqual([185_000, 192_400]);
    // alle Lieferanten
    expect(sortenAnpassungVorschau(l, { prozent: 2, gueltigAb: '2027-01-01' })).toHaveLength(2);
  });

  it('Grammaturbereich: Sorte gilt nur von … bis', () => {
    const l = ok(
      sorteHinzufuegen(
        BEISPIEL_LAGER,
        { papier: 'Bilderdruck matt', name: 'Nur dick', lieferant: 'X', grammaturVon: 200 },
        { je100kgZehntelcent: 150_000, gueltigAb: '2026-01-01' },
      ),
    );
    expect(aktuellePreise(l, 'L1', '2026-11-17')).toHaveLength(0);
    expect(aktuellePreise(l, 'L2', '2026-11-17')).toHaveLength(1);
  });

  it('Hauspapier umbenennen: Materialien und Sorten bekommen den neuen Namen', () => {
    const r = hauspapierUmbenennen(mitSorten(), 'Bilderdruck matt', 'Bilderdruck halbmatt');
    if (!r.ok) throw new Error();
    expect(r.anzahl).toBe(2);
    expect(r.wert.sorten?.map((s) => s.papier)).toEqual([
      'Bilderdruck halbmatt',
      'Bilderdruck halbmatt',
    ]);
    expect(aktuellePreise(r.wert, 'L1', '2026-11-17')).toHaveLength(2);
  });

  it('Preis zu unbekannter Sorte wird abgelehnt', () => {
    expect(sortenPreisHinzufuegen(BEISPIEL_LAGER, 'LS-0009', 1000, '2026-01-01').ok).toBe(false);
  });
});
