import { describe, expect, it } from 'vitest';
import {
  aufschlaegeSetzen,
  aufschlagArtAendern,
  aufschlagArtEntfernen,
  aufschlagArtHinzufuegen,
  aufschlagArtVerwendung,
  aufschlagZuweisen,
  standardAufschlagSetzen,
  verbrauchAufschlag,
  verbrauchsmaterialien,
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationHinzufuegen,
  maschinenVerbrauch,
  leereKalkulationen,
  materialEinheitText,
  mengenEinheitText,
  preisHinzufuegen,
  preisVergleichswerte,
  pruefeLager,
  pruefeMaterial,
  pruefeProduktion,
  quelleText,
  rechneKalkulation,
  type Lager,
  type Material,
  type Produktion,
} from './index';

// T102: Verbrauchsmaterial – Material ohne Maße, mit Einheit (ml, l, g, kg, Stück)

const HEUTE = '2026-11-08';
const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const TINTE = {
  id: 'M-HP831',
  form: 'Menge',
  sorte: 'Tinte HP 831 cyan',
  kategorie: 'sonstiges',
  einheit: 'ml',
  packung: { einheit: 'Kartusche', inhalt: 775 },
};

/** Lager mit Tinte, Preis 120 € je Kartusche (775 ml). */
function lager(): Lager {
  const l: Lager = {
    ...BEISPIEL_LAGER,
    materialien: [...BEISPIEL_LAGER.materialien, TINTE as Material],
  };
  const r = preisHinzufuegen(l, {
    materialId: 'M-HP831',
    lieferant: 'HP',
    basis: 'einheit',
    einheitName: 'Kartusche',
    inhalt: 775,
    staffel: [{ ab: 1, betragZehntelcent: 120_000 }],
    gueltigAb: '2026-01-01',
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

/** Beispiel-Produktion, Latex (S0003) verbraucht 7 ml Tinte je m². */
function produktion(): Produktion {
  const p = kopie(BEISPIEL_PRODUKTION);
  const lfp = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-LFP');
  const s = lfp?.schritte.find((x) => x.schrittId === 'S0003');
  if (!s) throw new Error('S0003');
  s.verbrauch = [{ materialId: 'M-HP831', menge: 7, je: 'm2' }];
  return p;
}

describe('T102 Schema', () => {
  it('Verbrauchsmaterial ohne Maße mit Einheit ml ist gültig', () => {
    const r = pruefeMaterial(TINTE);
    expect(r.ok).toBe(true);
  });

  it('Einheit ist Pflicht und muss ml, l, g, kg, m oder Stueck sein', () => {
    const ohne = pruefeMaterial({ ...TINTE, einheit: undefined });
    expect(ohne.ok).toBe(false);
    const falsch = pruefeMaterial({ ...TINTE, einheit: 'Liter' });
    expect(falsch.ok).toBe(false);
    if (!falsch.ok) {
      expect(falsch.fehler).toContainEqual({
        pfad: 'einheit',
        meldung: 'Einheit muss ml, l, g, kg, m oder Stueck sein',
      });
    }
  });

  it('Preis je 1.000 ist erlaubt, je 100 kg nicht', () => {
    const l = lager();
    const je1000 = preisHinzufuegen(l, {
      materialId: 'M-HP831',
      lieferant: 'Händler',
      basis: 'je1000',
      betragZehntelcent: 150_000,
      gueltigAb: '2026-01-01',
    });
    expect(je1000.ok).toBe(true);
    const kg = pruefeLager({
      ...l,
      preise: [
        ...(l.preise ?? []),
        {
          id: 'P9999',
          materialId: 'M-HP831',
          lieferant: 'x',
          basis: 'je100kg',
          betragZehntelcent: 1000,
          gueltigAb: '2026-01-01',
        },
      ],
    });
    expect(kg.ok).toBe(false);
  });
});

describe('T102 Preis und Anzeige', () => {
  it('Kartusche 775 ml zu 120 €: je 1.000 ml 154,839 €, je Kartusche 120 €', () => {
    const l = lager();
    const preis = (l.preise ?? []).find((p) => p.materialId === 'M-HP831');
    if (!preis) throw new Error('Preis');
    const w = preisVergleichswerte(TINTE as Material, preis);
    expect(w.je1000?.zehntelcent).toBe(154_839);
    expect(w.jeEinheit?.zehntelcent).toBe(120_000);
    expect(w.jeM2).toBeUndefined();
    expect(w.je100kg).toBeUndefined();
  });

  it('Einheiten als Text', () => {
    expect(mengenEinheitText('ml')).toBe('ml');
    expect(mengenEinheitText('Stueck')).toBe('Stück');
    expect(materialEinheitText(TINTE as Material)).toBe('ml');
    const bogen = BEISPIEL_LAGER.materialien.find((m) => m.form === 'Bogen');
    if (!bogen) throw new Error('Bogen');
    expect(materialEinheitText(bogen)).toBe('Bogen');
  });

  it('Quelle im Artikel: „Tinte HP 831 cyan, in ml“', () => {
    expect(quelleText({ art: 'material', materialId: 'M-HP831' }, lager())).toBe(
      'Tinte HP 831 cyan, in ml',
    );
  });
});

describe('T102 Verbrauch in der Kalkulation', () => {
  it('Latex 10 m² × 7 ml = 70 ml Tinte zu 0,155 €/ml = 10,84 €', () => {
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Plakat',
      auflagen: [1],
      einheit: 'Stueck',
      zeilen: [
        {
          id: 'Z1',
          art: 'arbeitsgang',
          platzId: 'AP-LFP',
          schrittId: 'S0003',
          menge: { art: 'hand', mengen: [10] },
        },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('Kalkulation');
    const e = rechneKalkulation(k, produktion(), lager(), HEUTE);
    const z = e.auflagen[0]?.zeilen[0];
    const zeile = z?.rechenweg.find((t) => t.startsWith('Verbrauch Tinte'));
    expect(zeile).toBeDefined();
    expect(zeile).toContain('= 70 ml ×');
    expect(zeile).toContain('= 10,84 €');
    expect(z?.hinweise.some((h) => h.includes('kein Preis'))).toBe(false);
  });

  it('Material-Zeile mit Verbrauchsmaterial: Menge in ml, Preis je ml', () => {
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Tinte extra',
      auflagen: [1],
      einheit: 'Stueck',
      zeilen: [
        { id: 'Z1', art: 'material', materialId: 'M-HP831', menge: { art: 'hand', mengen: [100] } },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('Kalkulation');
    const z = rechneKalkulation(k, produktion(), lager(), HEUTE).auflagen[0]?.zeilen[0];
    expect(z?.einheit).toBe('ml');
    expect(z?.menge).toBe(100);
    expect(z?.kostenVoll?.zehntelcent).toBe(15_484);
  });
});

describe('T179: Menge in Metern (Heftdraht)', () => {
  it('Material in m mit Preis je Rolle rechnet je Meter', () => {
    const r = pruefeMaterial({
      id: 'M0900',
      form: 'Menge',
      sorte: 'Heftdraht Rolle 2 kg',
      einheit: 'm',
      packung: { einheit: 'Rolle', inhalt: 1200 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(materialEinheitText(r.wert)).toBe('m');
    // Rolle 15 € für 1.200 m → 12,50 € je 1.000 m = 1,25 Cent je m; 0,06 m je Exemplar ≈ 0,075 Cent
    const w = preisVergleichswerte(r.wert, {
      id: 'P0900',
      materialId: 'M0900',
      lieferant: 'Sprintis',
      gueltigAb: '2026-11-23',
      basis: 'einheit',
      einheitName: 'Rolle',
      inhalt: 1200,
      staffel: [{ ab: 1, betragZehntelcent: 15000 }],
    });
    expect(w.je1000?.zehntelcent).toBe(12_500);
  });
});

describe('T180: Aufschläge auf Verbrauchsmaterial', () => {
  const plakat = () => {
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Plakat',
      auflagen: [1],
      einheit: 'Stueck',
      zeilen: [
        {
          id: 'Z1',
          art: 'arbeitsgang',
          platzId: 'AP-LFP',
          schrittId: 'S0003',
          menge: { art: 'hand', mengen: [10] },
        },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('Kalkulation');
    return k;
  };
  const tintenZeile = (l: Lager) =>
    rechneKalkulation(plakat(), produktion(), l, HEUTE).auflagen[0]?.zeilen[0]?.rechenweg.find(
      (t) => t.startsWith('Verbrauch Tinte'),
    );

  it('Reihenfolge: Material vor Standard, sonst 0 %', () => {
    expect(verbrauchAufschlag({}, {})).toEqual({ prozent: 0, quelle: 'keiner' });
    expect(verbrauchAufschlag({ verbrauchAufschlagProzent: 15 }, {})).toEqual({
      prozent: 15,
      quelle: 'standard',
    });
    expect(verbrauchAufschlag({ verbrauchAufschlagProzent: 15 }, { aufschlagProzent: 0 })).toEqual({
      prozent: 0,
      quelle: 'material',
    });
  });

  it('Standard 15 % erhöht den Verbrauch und steht im Rechenweg', () => {
    const s = standardAufschlagSetzen(lager(), 15);
    if (!s.ok) throw new Error(JSON.stringify(s.fehler));
    const zeile = tintenZeile(s.wert);
    expect(zeile).toContain('= 10,84 € + 15 % Aufschlag (Standard) = 12,47 €');
    expect(tintenZeile(lager())).toContain('= 10,84 €');
    expect(tintenZeile(lager())).not.toContain('Aufschlag');
  });

  it('Aufschlag am Material geht vor; null nimmt ihn wieder weg', () => {
    const s = standardAufschlagSetzen(lager(), 15);
    if (!s.ok) throw new Error('Standard');
    const m = aufschlaegeSetzen(s.wert, [{ materialId: 'M-HP831', prozent: 30 }]);
    if (!m.ok) throw new Error(JSON.stringify(m.fehler));
    expect(tintenZeile(m.wert)).toContain('+ 30 % Aufschlag = ');
    const weg = aufschlaegeSetzen(m.wert, [{ materialId: 'M-HP831', prozent: null }]);
    if (!weg.ok) throw new Error('weg');
    expect(weg.wert.materialien.find((x) => x.id === 'M-HP831')?.aufschlagProzent).toBeUndefined();
    expect(tintenZeile(weg.wert)).toContain('(Standard)');
  });

  it('Unbekanntes Material oder negativer Wert → Fehler, nichts geändert', () => {
    expect(aufschlaegeSetzen(lager(), [{ materialId: 'GIBTS', prozent: 10 }]).ok).toBe(false);
    expect(aufschlaegeSetzen(lager(), [{ materialId: 'M-HP831', prozent: -1 }]).ok).toBe(false);
    expect(standardAufschlagSetzen(lager(), -5).ok).toBe(false);
    const ohne = standardAufschlagSetzen({ ...lager(), verbrauchAufschlagProzent: 15 }, null);
    expect(ohne.ok && ohne.wert.verbrauchAufschlagProzent).toBe(undefined);
  });

  it('Aufschlag-Arten: anlegen, zuweisen (Auswahl), ändern wirkt auf alle, entfernen → Standard', () => {
    const s = standardAufschlagSetzen(lager(), 15);
    if (!s.ok) throw new Error('Standard');
    const a = aufschlagArtHinzufuegen(s.wert, { name: 'Kleinteile', prozent: 25 });
    if (!a.ok) throw new Error(JSON.stringify(a.fehler));
    expect(a.wert.aufschlagArten).toEqual([{ id: 'AA-0001', name: 'Kleinteile', prozent: 25 }]);
    expect(aufschlagArtHinzufuegen(a.wert, { name: 'kleinteile', prozent: 5 }).ok).toBe(false);
    const z = aufschlagZuweisen(a.wert, ['M-HP831'], { art: 'art', artId: 'AA-0001' });
    if (!z.ok) throw new Error(JSON.stringify(z.fehler));
    expect(tintenZeile(z.wert)).toContain('+ 25 % Aufschlag (Kleinteile) = ');
    expect(aufschlagArtVerwendung(z.wert, 'AA-0001')).toBe(1);
    const g = aufschlagArtAendern(z.wert, 'AA-0001', { prozent: 40 });
    if (!g.ok) throw new Error('ändern');
    expect(tintenZeile(g.wert)).toContain('+ 40 % Aufschlag (Kleinteile) = ');
    const eigen = aufschlagZuweisen(g.wert, ['M-HP831'], { art: 'eigen', prozent: 5 });
    if (!eigen.ok) throw new Error('eigen');
    expect(eigen.wert.materialien.find((m) => m.id === 'M-HP831')?.aufschlagArtId).toBeUndefined();
    expect(tintenZeile(eigen.wert)).toContain('+ 5 % Aufschlag = ');
    const zurueck = aufschlagZuweisen(g.wert, ['M-HP831'], { art: 'standard' });
    if (!zurueck.ok) throw new Error('standard');
    expect(tintenZeile(zurueck.wert)).toContain('(Standard)');
    const weg = aufschlagArtEntfernen(z.wert, 'AA-0001');
    if (!weg.ok) throw new Error('entfernen');
    expect(weg.wert.aufschlagArten).toEqual([]);
    expect(tintenZeile(weg.wert)).toContain('(Standard)');
    expect(aufschlagZuweisen(a.wert, ['M-HP831'], { art: 'art', artId: 'AA-0099' }).ok).toBe(false);
  });

  it('Liste der Verbrauchsmaterialien: Menge-Formen, alphabetisch', () => {
    const v = verbrauchsmaterialien(lager());
    expect(v.some((m) => m.id === 'M-HP831')).toBe(true);
    expect(v.every((m) => m.form === 'Menge' || m.kategorie === 'sonstiges')).toBe(true);
  });
});

describe('T181: Verbrauch im Stundensatz enthalten', () => {
  it('Verbrauchsmaterial der Maschine gibt die Kennzeichnung weiter', () => {
    const v = maschinenVerbrauch(
      {
        verbrauchsmaterial: [
          {
            id: 'V1',
            materialId: 'M-HP831',
            gruppe: 'Tinte',
            menge: 7,
            je: 'm2',
            imStundensatz: true,
          },
        ],
      },
      'S0003',
    );
    expect(v).toEqual([{ materialId: 'M-HP831', menge: 7, je: 'm2', imStundensatz: true }]);
  });

  it('wird nicht gerechnet, steht aber im Rechenweg', () => {
    const p = produktion();
    const s = (p.arbeitsplaetze ?? [])
      .find((a) => a.id === 'AP-LFP')
      ?.schritte.find((x) => x.schrittId === 'S0003');
    if (!s) throw new Error('S0003');
    s.verbrauch = [{ materialId: 'M-HP831', menge: 7, je: 'm2', imStundensatz: true }];
    expect(pruefeProduktion(p).ok).toBe(true);
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Plakat',
      auflagen: [1],
      einheit: 'Stueck',
      zeilen: [
        {
          id: 'Z1',
          art: 'arbeitsgang',
          platzId: 'AP-LFP',
          schrittId: 'S0003',
          menge: { art: 'hand', mengen: [10] },
        },
      ],
    });
    if (!r.ok) throw new Error('Kalkulation');
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('Kalkulation');
    const z = rechneKalkulation(k, p, lager(), HEUTE).auflagen[0]?.zeilen[0];
    expect(z?.rechenweg).toContain(
      'Verbrauch Tinte HP 831 cyan (M-HP831): im Stundensatz enthalten',
    );
    expect(z?.rechenweg.some((t) => t.includes('70 ml'))).toBe(false);
    expect(z?.hinweise.some((h) => h.includes('kein Preis'))).toBe(false);
  });
});
