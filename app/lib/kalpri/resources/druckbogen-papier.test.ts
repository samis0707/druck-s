import { describe, expect, it } from 'vitest';
import { druckbogenVorschlag } from './index';

// T110: großer Druckbogen nur, solange er nicht deutlich mehr Papier kostet

const ROH_63_88 = { breiteUm: 630_000, hoeheUm: 880_000 };
const LANG = { breiteUm: 330_000, hoeheUm: 700_000 };
const REGISTER_A5 = { endformat: { breiteUm: 160_000, hoeheUm: 210_000 } };

describe('T110 Druckbogen-Vorschlag: Papierausnutzung', () => {
  it('Register A5 + 12 aus 63 × 88, Maschine bis 33 × 70: Drittel 63 × 29,33 mit je 3 statt 1 × 33 × 70 mit 4', () => {
    const v = druckbogenVorschlag(REGISTER_A5, ROH_63_88, LANG, 4000);
    expect(v?.format).toEqual({ breiteUm: 630_000, hoeheUm: 293_333 });
    expect(v?.jeRohbogen).toBe(3);
    expect(v?.nutzenJeBogen).toBe(3);
    // 9 Nutzen je Rohbogen statt 4
    expect((v?.jeRohbogen ?? 0) * (v?.nutzenJeBogen ?? 0)).toBe(9);
  });

  it('kaum mehr Papier (unter 1,5-fach): großer Bogen bleibt (A5 aus 70 × 100 in SRA3, 16 statt 18)', () => {
    const v = druckbogenVorschlag(
      { endformat: { breiteUm: 148_000, hoeheUm: 210_000 } },
      { breiteUm: 700_000, hoeheUm: 1_000_000 },
      { breiteUm: 330_000, hoeheUm: 487_000 },
      4000,
    );
    expect(v?.jeRohbogen).toBe(4);
    expect(v?.nutzenJeBogen).toBe(4);
  });
});
