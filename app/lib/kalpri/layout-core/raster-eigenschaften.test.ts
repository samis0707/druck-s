import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { berechneRaster, liegtIn, ueberlappen, type Slot } from './index';

/** Prüft ohne expect in der Schleife (schnell); gibt die erste Verletzung als Text zurück. */
function ersteUeberlappung(slots: readonly Slot[], mitBeschnitt: boolean): string | null {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const c = slots[j];
      if (!a || !c) return 'Slot fehlt';
      if (ueberlappen(a.endformat, c.endformat)) return `Endformat ${a.id}/${c.id}`;
      if (mitBeschnitt && ueberlappen(a.beschnitt, c.beschnitt)) return `Beschnitt ${a.id}/${c.id}`;
    }
  }
  return null;
}

describe('berechneRaster – Eigenschaften', () => {
  it('alles im druckbaren Bereich, keine Überlappung, Raster maximal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100000, max: 1000000 }),
        fc.integer({ min: 100000, max: 1000000 }),
        fc.integer({ min: 0, max: 20000 }),
        fc.integer({ min: 0, max: 20000 }),
        fc.integer({ min: 40000, max: 400000 }),
        fc.integer({ min: 40000, max: 400000 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 12000 }),
        fc.integer({ min: 0, max: 12000 }),
        fc.boolean(),
        (bb, bh, rand, greifer, eb, eh, b, sx, sy, drehung) => {
          const r = berechneRaster({
            bogen: { breiteUm: bb, hoeheUm: bh },
            raender: { greiferUm: greifer, hintenUm: rand, linksUm: rand, rechtsUm: rand },
            endformat: { breiteUm: eb, hoeheUm: eh },
            beschnittUm: b,
            steg: { xUm: sx, yUm: sy },
            drehungErlaubt: drehung,
          });
          if (!r.ok) return;
          const { slots, druckbereich, spalten, zeilen, block } = r.wert;
          expect(slots).toHaveLength(spalten * zeilen);
          expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length);
          expect(liegtIn(block, druckbereich)).toBe(true);
          expect(slots.every((s) => liegtIn(s.beschnitt, druckbereich))).toBe(true);
          expect(
            slots.every((s) => Object.values(s.endformat).every((v) => Number.isInteger(v))),
          ).toBe(true);
          expect(ersteUeberlappung(slots, sx >= 2 * b && sy >= 2 * b)).toBeNull();
          const w = slots[0]?.endformat.breiteUm ?? 0;
          const h = slots[0]?.endformat.hoeheUm ?? 0;
          expect(block.breiteUm + w + sx > druckbereich.breiteUm).toBe(true);
          expect(block.hoeheUm + h + sy > druckbereich.hoeheUm).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});
