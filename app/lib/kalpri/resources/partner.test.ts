import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_PRODUKTION,
  lieferantHinzufuegen,
  materialienVonPartner,
  partnerRollen,
  partnerZumPreisnamen,
  preisIstAlt,
  preisLieferanten,
  type Lager,
  type Lieferant,
  type Produktion,
} from './index';

// T165: Partner – Lieferant, Kunde oder beides, mit Shop, Kontakten und Adressen

function neu(eingabe: Record<string, unknown>) {
  return lieferantHinzufuegen(BEISPIEL_PRODUKTION, eingabe);
}

function fehler(eingabe: Record<string, unknown>) {
  const r = neu(eingabe);
  return r.ok ? [] : r.fehler.map((f) => `${f.pfad}: ${f.meldung}`);
}

describe('Partner-Schema (T165)', () => {
  it('Lieferant mit Shop, Kundennummer, Versand, Kontakten und Adressen', () => {
    const r = neu({
      name: 'Papierhandel Beispiel',
      rollen: ['lieferant'],
      shop: 'https://shop.example.de',
      unsereKundennummer: '12345',
      mindestbestellwertZehntelcent: 50_000,
      versandkostenZehntelcent: 9_900,
      versandfreiAbZehntelcent: 250_000,
      kontakte: [{ name: 'Erika Muster', funktion: 'Innendienst', email: 'e@example.de' }],
      adressen: [
        { art: 'firma', strasse: 'Musterweg 1', plz: '12345', ort: 'Musterstadt', standard: true },
      ],
      namenInPreisen: ['Beispiel'],
    });
    expect(r.ok).toBe(true);
    const p = (r as { wert: Produktion }).wert.lieferanten!.at(-1)!;
    expect(p.id).toMatch(/^LF-\d{4}$/);
    expect(partnerRollen(p)).toEqual(['lieferant']);
  });

  it('Kunde mit Paginanet-Kundennummer; alte Lieferanten ohne Rolle gelten als Lieferant', () => {
    expect(neu({ name: 'Kunde GmbH', rollen: ['kunde'], kundennummer: 'K-4711' }).ok).toBe(true);
    expect(partnerRollen({} as Lieferant)).toEqual(['lieferant']);
  });

  it('meldet Shop ohne https, Zugangsdaten in der Adresse, zwei Standardadressen gleicher Art', () => {
    expect(fehler({ name: 'X', shop: 'shop.example.de' })).toEqual([
      'shop: Adresse mit https:// angeben, z. B. https://shop.example.de',
    ]);
    expect(fehler({ name: 'X', shop: 'https://ich:geheim@shop.example.de' })).toHaveLength(1);
    expect(
      fehler({
        name: 'X',
        adressen: [
          { art: 'lieferung', ort: 'A', standard: true },
          { art: 'lieferung', ort: 'B', standard: true },
        ],
      }),
    ).toEqual(['adressen.1.standard: nur eine Standardadresse je Art (lieferung)']);
    expect(fehler({ name: 'X', rollen: [] })).toEqual(['rollen: mindestens eine Rolle']);
  });
});

describe('partnerZumPreisnamen (T166)', () => {
  const liste = [
    { id: 'LF-0001', name: 'Berberich Papier', namenInPreisen: ['Berberich'] },
    { id: 'LF-0002', name: 'Ovol' },
  ] as Lieferant[];
  it('findet über Name oder „Namen in Preisen“, ohne Groß-/Kleinschreibung', () => {
    expect(partnerZumPreisnamen(liste, 'berberich')?.id).toBe('LF-0001');
    expect(partnerZumPreisnamen(liste, ' OVOL ')?.id).toBe('LF-0002');
    expect(partnerZumPreisnamen(liste, 'HP')).toBeUndefined();
  });
});

describe('Lieferanten in Materialpreisen (T166)', () => {
  const lager = {
    preise: [
      { materialId: 'M1', lieferant: 'Berberich', gueltigAb: '2025-01-01' },
      { materialId: 'M2', lieferant: 'berberich ', gueltigAb: '2026-03-01' },
      { materialId: 'M1', lieferant: 'HP', gueltigAb: '2026-01-01' },
    ],
  } as unknown as Pick<Lager, 'preise'>;
  const partner = [
    { id: 'LF-0003', name: 'Berberich Papier', namenInPreisen: ['Berberich'] },
  ] as Lieferant[];

  it('gruppiert Schreibweisen, zählt Preise und Materialien, ordnet zu', () => {
    expect(preisLieferanten(lager, partner)).toEqual([
      {
        name: 'Berberich',
        anzahlPreise: 2,
        materialIds: ['M1', 'M2'],
        neuesterPreis: '2026-03-01',
        partnerId: 'LF-0003',
      },
      {
        name: 'HP',
        anzahlPreise: 1,
        materialIds: ['M1'],
        neuesterPreis: '2026-01-01',
        partnerId: null,
      },
    ]);
    expect(materialienVonPartner(lager, partner[0]!)).toEqual(['M1', 'M2']);
  });

  it('Preis älter als 12 Monate', () => {
    expect(preisIstAlt('2025-11-01', '2026-11-17')).toBe(true);
    expect(preisIstAlt('2026-01-01', '2026-11-17')).toBe(false);
    expect(preisIstAlt('2026-01-01', '2026-11-17', 6)).toBe(true);
  });
});
