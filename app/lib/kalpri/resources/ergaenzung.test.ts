import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  ergaenzungEinspielen,
  pruefeLager,
  pruefeProduktion,
  type ErgaenzungsErgebnis,
  type Lager,
  type Produktion,
} from './index';

// T175: Ergänzung einspielen (Format kalpri-ergaenzung v1). Werte erfunden.

const ok = (r: ErgaenzungsErgebnis) => {
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r;
};
const teil = (r: ReturnType<typeof ok>, titel: string) => {
  const a = r.vorschau.abschnitte.find((x) => x.titel === titel);
  if (a === undefined) throw new Error(`Abschnitt ${titel} fehlt`);
  return a;
};

const lager: Lager = {
  ...BEISPIEL_LAGER,
  materialien: [
    ...BEISPIEL_LAGER.materialien,
    { id: 'TINTE-L360', form: 'Menge', sorte: 'Tinte HP 831 (Latex)', einheit: 'ml' },
    {
      id: 'M0004',
      form: 'Bogen',
      sorte: 'GardaMatt Art',
      grammatur: 135,
      breiteUm: 630000,
      hoeheUm: 880000,
      dickeUm: 110,
      artikelnummern: [{ lieferant: 'Berberich', nummer: '526.135.0630.0880.0001' }],
    },
  ],
};
const produktion: Produktion = {
  ...BEISPIEL_PRODUKTION,
  lieferanten: [
    { id: 'LF-0001', name: 'Berberich' },
    { id: 'LF-0002', name: 'J. Schneider', telefon: '0711 111', namenInPreisen: ['Schneider'] },
  ],
  arbeitsplaetze: (BEISPIEL_PRODUKTION.arbeitsplaetze ?? []).map((p) =>
    p.id === 'AP-LFP'
      ? {
          ...p,
          verbrauchsmaterial: [
            {
              id: 'V1',
              materialId: 'TINTE-L360',
              gruppe: 'Tinte',
              menge: 10,
              je: 'm2' as const,
              standard: true,
            },
          ],
        }
      : p,
  ),
};

const datei = () => ({
  art: 'kalpri-ergaenzung',
  version: 1,
  titel: 'Test 18.11.2026',
  erstelltAm: '2026-11-18',
  partner: [
    { name: 'Ovol-Complott', namenInPreisen: ['Ovol'], rollen: ['lieferant'] },
    { name: 'J. Schneider', telefon: '0711 999', webseite: 'https://schneider.example.com' },
  ],
  materialien: [
    {
      schluessel: 'ROLLE1',
      form: 'Rolle',
      sorte: 'PP-Banner matt',
      grammatur: 200,
      breiteUm: 1370000,
      laengeM: 50,
      artikelnummern: [{ lieferant: 'Ovol-Complott', nummer: 'OV-4711' }],
    },
    { schluessel: 'TINTE-C', form: 'Menge', sorte: 'Tinte HP 872 Cyan', einheit: 'ml' },
    {
      schluessel: 'GARDA',
      form: 'Bogen',
      sorte: 'GardaMatt Art',
      grammatur: 135,
      breiteUm: 630000,
      hoeheUm: 880000,
      artikelnummern: [{ lieferant: 'Berberich', nummer: '526.135.0630.0880.0001' }],
    },
  ],
  preise: [
    {
      material: 'ROLLE1',
      lieferant: 'Ovol-Complott',
      gueltigAb: '2026-10-30',
      basis: 'einheit',
      einheitName: 'Rolle',
      inhalt: 1,
      staffel: [{ ab: 1, betragZehntelcent: 120000 }],
    },
    {
      material: 'TINTE-C',
      lieferant: 'Ovol-Complott',
      gueltigAb: '2026-10-30',
      basis: 'einheit',
      einheitName: 'Kartusche',
      inhalt: 775,
      staffel: [{ ab: 1, betragZehntelcent: 150000 }],
    },
  ],
  materialErgaenzungen: [{ material: 'M0004', dickeUm: 115, volumen: 0.85 }],
  maschinenVerbrauch: [
    {
      arbeitsplatz: 'AP-LFP',
      material: 'TINTE-C',
      gruppe: 'Tinte C',
      menge: 2.59,
      je: 'm2',
      schritte: ['S0003'],
      standard: true,
      ersetzt: ['TINTE-L360'],
    },
  ],
  hinweise: ['Lieferschein 30.10.'],
});

describe('T175 Ergänzung einspielen', () => {
  it('1. ungültige Datei (falsche art) → ok: false', () => {
    expect(ergaenzungEinspielen(lager, produktion, { ...datei(), art: 'x' }).ok).toBe(false);
    expect(ergaenzungEinspielen(lager, produktion, { ...datei(), version: 2 }).ok).toBe(false);
  });

  it('2. neuer Partner → LF-0003; vorhandener: nur leere Felder, Abweichung als Hinweis', () => {
    const r = ok(ergaenzungEinspielen(lager, produktion, datei()));
    const ovol = r.produktion.lieferanten?.find((l) => l.name === 'Ovol-Complott');
    expect(ovol?.id).toBe('LF-0003');
    const schneider = r.produktion.lieferanten?.find((l) => l.id === 'LF-0002');
    expect(schneider?.telefon).toBe('0711 111');
    expect(schneider?.webseite).toBe('https://schneider.example.com');
    expect(teil(r, 'Partner').hinweise.some((h) => h.includes('telefon'))).toBe(true);
  });

  it('3. neue Rolle und Menge → nächste freie IDs, Preise zeigen darauf', () => {
    const r = ok(ergaenzungEinspielen(lager, produktion, datei()));
    const rolle = r.lager.materialien.find((m) => m.sorte === 'PP-Banner matt');
    const tinte = r.lager.materialien.find((m) => m.sorte === 'Tinte HP 872 Cyan');
    expect(rolle?.form).toBe('Rolle');
    expect(tinte?.form).toBe('Menge');
    expect(rolle?.id).not.toBe(tinte?.id);
    const neuePreise = (r.lager.preise ?? []).filter((p) => p.lieferant === 'Ovol-Complott');
    expect(neuePreise.map((p) => p.materialId).sort()).toEqual([rolle?.id, tinte?.id].sort());
  });

  it('4. vorhandenes Material über Artikelnummer → keine Dublette', () => {
    const r = ok(ergaenzungEinspielen(lager, produktion, datei()));
    const garda = r.lager.materialien.filter((m) => m.sorte === 'GardaMatt Art');
    expect(garda).toHaveLength(1);
    expect(garda[0]?.artikelnummern).toHaveLength(1);
  });

  it('5. gleicher Preis → übersprungen; anderer Betrag am selben Tag → Hinweis, alter bleibt', () => {
    const erst = ok(ergaenzungEinspielen(lager, produktion, datei()));
    const d = datei();
    d.preise[1] = {
      material: 'TINTE-C',
      lieferant: 'Ovol-Complott',
      gueltigAb: '2026-10-30',
      basis: 'einheit',
      einheitName: 'Kartusche',
      inhalt: 775,
      staffel: [{ ab: 1, betragZehntelcent: 160000 }],
    };
    const zwei = ok(ergaenzungEinspielen(erst.lager, erst.produktion, d));
    expect(teil(zwei, 'Preise').uebersprungen).toHaveLength(1);
    expect(teil(zwei, 'Preise').hinweise[0]).toContain('nicht geändert');
    expect(zwei.lager.preise).toEqual(erst.lager.preise);
  });

  it('6. materialErgaenzungen füllen nur leere Felder', () => {
    const r = ok(ergaenzungEinspielen(lager, produktion, datei()));
    const m = r.lager.materialien.find((x) => x.id === 'M0004');
    expect(m?.dickeUm).toBe(110);
    expect(m?.volumen).toBe(0.85);
    expect(teil(r, 'Ergänzte Felder').hinweise[0]).toContain('dickeUm');
  });

  it('7./8. Verbrauch neu mit eigener Gruppe; ersetzt entfernt den alten, Material bleibt', () => {
    const r = ok(ergaenzungEinspielen(lager, produktion, datei()));
    const lfp = r.produktion.arbeitsplaetze?.find((p) => p.id === 'AP-LFP');
    const tinte = r.lager.materialien.find((m) => m.sorte === 'Tinte HP 872 Cyan');
    expect(lfp?.verbrauchsmaterial).toHaveLength(1);
    expect(lfp?.verbrauchsmaterial?.[0]).toMatchObject({
      materialId: tinte?.id,
      gruppe: 'Tinte C',
      menge: 2.59,
      je: 'm2',
      standard: true,
    });
    expect(teil(r, 'Verbrauch an Maschinen').entfernt[0]).toContain('Tinte HP 831 (Latex)');
    expect(r.lager.materialien.some((m) => m.id === 'TINTE-L360')).toBe(true);
    // nochmals → übersprungen, nichts entfernt
    const zwei = ok(ergaenzungEinspielen(r.lager, r.produktion, datei()));
    expect(teil(zwei, 'Verbrauch an Maschinen').uebersprungen).toHaveLength(1);
    expect(teil(zwei, 'Verbrauch an Maschinen').entfernt).toHaveLength(0);
  });

  it('9. unbekannter Arbeitsplatz/Schritt → Zeile ausgelassen, Rest eingespielt', () => {
    const d = datei();
    d.maschinenVerbrauch.push(
      { ...d.maschinenVerbrauch[0]!, arbeitsplatz: 'AP-GIBTSNICHT', ersetzt: [] },
      { ...d.maschinenVerbrauch[0]!, arbeitsplatz: 'AP-SCHN', schritte: ['S0003'], ersetzt: [] },
    );
    const r = ok(ergaenzungEinspielen(lager, produktion, d));
    expect(teil(r, 'Verbrauch an Maschinen').fehler).toHaveLength(2);
    expect(teil(r, 'Verbrauch an Maschinen').neu).toHaveLength(1);
    expect(teil(r, 'Partner').neu).toHaveLength(1);
  });

  it('9b. Preis, der nicht zum Material passt → nur diese Zeile ausgelassen', () => {
    const d = datei();
    d.preise.push({
      material: 'ROLLE1',
      lieferant: 'Ovol-Complott',
      gueltigAb: '2026-11-01',
      basis: 'je1000',
      betragZehntelcent: 5000,
    } as unknown as (typeof d.preise)[0]);
    const r = ok(ergaenzungEinspielen(lager, produktion, d));
    expect(teil(r, 'Preise').fehler).toHaveLength(1);
    expect(teil(r, 'Preise').neu).toHaveLength(2);
  });

  it('10. zweimal dieselbe Datei → geaendert: false', () => {
    const erst = ok(ergaenzungEinspielen(lager, produktion, datei()));
    expect(erst.geaendert).toBe(true);
    const zwei = ok(ergaenzungEinspielen(erst.lager, erst.produktion, datei()));
    expect(zwei.geaendert).toBe(false);
    expect(zwei.lager).toBe(erst.lager);
    expect(zwei.produktion).toBe(erst.produktion);
  });

  it('11. Ergebnis besteht pruefeLager und pruefeProduktion; Datei-Hinweise in der Vorschau', () => {
    const r = ok(ergaenzungEinspielen(lager, produktion, datei()));
    expect(pruefeLager(r.lager).ok).toBe(true);
    expect(pruefeProduktion(r.produktion).ok).toBe(true);
    expect(r.vorschau.dateiHinweise).toEqual(['Lieferschein 30.10.']);
  });
});
