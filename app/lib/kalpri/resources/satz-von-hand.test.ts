import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  KalkulationSchema,
  rechneKalkulation,
  rechneProbe,
  type Kalkulation,
  type Produktion,
} from './index';

const zeile = {
  id: 'Z1',
  art: 'arbeitsgang' as const,
  platzId: 'AP-FALZ-A',
  schrittId: 'S0011',
  menge: { art: 'hand' as const, mengen: [1000] },
};

function kalk(handwerte?: {
  stundensatzZehntelcent?: number;
  leistungJeStunde?: number;
}): Kalkulation {
  return {
    id: 'K-0001',
    titel: 'Falzen',
    einheit: 'Stueck',
    auflagen: [1000],
    zeilen: [handwerte === undefined ? zeile : { ...zeile, handwerte }],
  };
}

type Platz = NonNullable<Produktion['arbeitsplaetze']>[number];

function mitFalzPlatz(aendern: (p: Platz) => Platz): Produktion {
  return {
    ...BEISPIEL_PRODUKTION,
    arbeitsplaetze: (BEISPIEL_PRODUKTION.arbeitsplaetze ?? []).map((p) =>
      p.id === 'AP-FALZ-A' ? aendern(p) : p,
    ),
  };
}

function ersteZeile(k: Kalkulation, p: Produktion = BEISPIEL_PRODUKTION) {
  const z = rechneKalkulation(k, p, BEISPIEL_LAGER, '2026-11-07').auflagen[0]?.zeilen[0];
  if (!z) throw new Error('keine Zeile');
  return z;
}

describe('Stundensatz von Hand je Zeile (T97)', () => {
  it('ohne Handwert: Satz des Platzes (52 €/h, vorläufig)', () => {
    const z = ersteZeile(kalk());
    expect(z.kostenVoll?.zehntelcent).toBe(16_807);
    expect(z.rechenweg).toContain('Vollkosten: 0,32 h × 52,00 €/h = 16,81 €');
    expect(z.hinweise).toContain('Stundensatz vorläufig');
  });

  it('mit Handwert: gleiche Zeit × eigener Satz, im Rechenweg „von Hand“, kein „vorläufig“', () => {
    const z = ersteZeile(kalk({ stundensatzZehntelcent: 60_000 }));
    expect(z.zeitMs).toBe(ersteZeile(kalk()).zeitMs);
    expect(z.kostenVoll?.zehntelcent).toBe(19_393);
    expect(z.rechenweg).toContain('Vollkosten: 0,32 h × 60,00 €/h (von Hand) = 19,39 €');
    expect(z.hinweise).not.toContain('Stundensatz vorläufig');
    expect(z.hinweise).toContain('Teilkosten nicht hinterlegt');
  });

  it('0 €/h ist erlaubt und kostet nichts', () => {
    expect(ersteZeile(kalk({ stundensatzZehntelcent: 0 })).kostenVoll?.zehntelcent).toBe(0);
  });

  it('rechnet auch, wenn der Platz keinen Satz hat', () => {
    const ohneSatz = mitFalzPlatz((p) => {
      const rest = { ...p };
      delete rest.stundensatzVollZehntelcent;
      delete rest.stundensatzVorlaeufig;
      return rest;
    });
    const ohne = ersteZeile(kalk(), ohneSatz);
    expect(ohne.kostenVoll).toBeNull();
    expect(ohne.hinweise).toContain('Stundensatz fehlt – keine Kosten');
    const mit = ersteZeile(kalk({ stundensatzZehntelcent: 60_000 }), ohneSatz);
    expect(mit.kostenVoll?.zehntelcent).toBe(19_393);
    expect(mit.hinweise).not.toContain('Stundensatz fehlt – keine Kosten');
  });

  it('Teilkosten bleiben vom Platz', () => {
    const mitTeil = mitFalzPlatz((p) => ({ ...p, stundensatzTeilZehntelcent: 30_000 }));
    const ohne = ersteZeile(kalk(), mitTeil);
    const mit = ersteZeile(kalk({ stundensatzZehntelcent: 60_000 }), mitTeil);
    expect(ohne.kostenTeil?.zehntelcent).toBe(9_696);
    expect(mit.kostenTeil).toEqual(ohne.kostenTeil);
    expect(mit.kostenVoll?.zehntelcent).toBe(19_393);
  });

  it('Probe: satzVollVonHand nur gesetzt, wenn von Hand', () => {
    const eingabe = { platzId: 'AP-FALZ-A', schrittId: 'S0011', menge: 1000 };
    const ohne = rechneProbe(BEISPIEL_PRODUKTION, eingabe);
    const mit = rechneProbe(BEISPIEL_PRODUKTION, {
      ...eingabe,
      handwerte: { stundensatzZehntelcent: 60_000 },
    });
    if (!ohne.ok || !mit.ok) throw new Error('Probe rechnet nicht');
    expect('satzVollVonHand' in ohne.wert).toBe(false);
    expect(mit.wert.satzVollVonHand).toBe(true);
    expect(mit.wert.stundensatzVoll?.zehntelcent).toBe(60_000);
  });

  it('Schema: ganze Zehntelcent, nicht negativ, freiwillig', () => {
    expect(KalkulationSchema.safeParse(kalk({ stundensatzZehntelcent: 60_000 })).success).toBe(
      true,
    );
    expect(KalkulationSchema.safeParse(kalk({ stundensatzZehntelcent: -1 })).success).toBe(false);
    expect(KalkulationSchema.safeParse(kalk({ stundensatzZehntelcent: 1.5 })).success).toBe(false);
  });
});
