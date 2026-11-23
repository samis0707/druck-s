import { findeMaterialNachArtikelnummer } from './lager';
import type { Lager } from './lager-schema';
import type { Material } from './material';

export type Kategorie = 'papier' | 'kuvert' | 'tuete' | 'verpackung' | 'sonstiges';

/** Reihenfolge und Anzeigenamen für Filterknöpfe. */
export const KATEGORIEN: readonly { id: Kategorie; name: string }[] = [
  { id: 'papier', name: 'Papier/Karton' },
  { id: 'kuvert', name: 'Briefhüllen' },
  { id: 'tuete', name: 'Versandtaschen' },
  { id: 'verpackung', name: 'Verpackung' },
  { id: 'sonstiges', name: 'Verbrauchsmaterial' },
];

export type StandardVolumen = { gestrichen: number; ungestrichen: number; ohne: number };

/** Standardvolumen in cm³/g, wenn weder gemessene Dicke noch Volumen vorliegen. */
export const STANDARD_VOLUMEN: StandardVolumen = { gestrichen: 0.9, ungestrichen: 1.2, ohne: 1.0 };

export type Dicke = {
  um: number;
  herkunft: 'gemessen' | 'volumen' | 'geschaetzt';
  volumen?: number;
};

/** Volumen deutsch: mindestens 1, höchstens 2 Nachkommastellen (1 → "1,0"). */
const VOLUMEN_FORMAT = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function volumenText(volumen: number): string {
  return VOLUMEN_FORMAT.format(volumen);
}

/** Reihenfolge:
 *  1. dickeUm vorhanden                → { um: dickeUm, herkunft: 'gemessen' } (ohne volumen)
 *  2. keine Grammatur                  → undefined
 *  3. volumen vorhanden                → { um: round(grammatur × volumen), herkunft: 'volumen', volumen }
 *  4. oberflaeche 'beschichtet'        → undefined (keine Annahme bei Folien)
 *  5. sonst Standardvolumen nach Oberfläche (fehlt sie: 'ohne')
 *                                      → { um: round(grammatur × v), herkunft: 'geschaetzt', volumen: v }
 *  round = Math.round auf ganze µm. */
export function effektiveDicke(
  m: Material,
  standard: StandardVolumen = STANDARD_VOLUMEN,
): Dicke | undefined {
  if (m.dickeUm !== undefined) {
    return { um: m.dickeUm, herkunft: 'gemessen' };
  }
  if (m.grammatur === undefined) {
    return undefined;
  }
  if (m.volumen !== undefined) {
    return { um: Math.round(m.grammatur * m.volumen), herkunft: 'volumen', volumen: m.volumen };
  }
  if (m.oberflaeche === 'beschichtet') {
    return undefined;
  }
  const v =
    m.oberflaeche === 'gestrichen'
      ? standard.gestrichen
      : m.oberflaeche === 'ungestrichen'
        ? standard.ungestrichen
        : standard.ohne;
  return { um: Math.round(m.grammatur * v), herkunft: 'geschaetzt', volumen: v };
}

/** "130 µm (gemessen)" · "≈ 115 µm aus Volumen 1,15" · "≈ 90 µm (geschätzt, Standardvolumen 0,9)" · "Dicke unbekannt".
 *  Volumen deutsch mit mindestens 1 und höchstens 2 Nachkommastellen (1 → "1,0"). */
export function dickeText(d: Dicke | undefined): string {
  if (d === undefined) {
    return 'Dicke unbekannt';
  }
  if (d.herkunft === 'gemessen') {
    return `${d.um} µm (gemessen)`;
  }
  if (d.herkunft === 'volumen') {
    return d.volumen === undefined
      ? `≈ ${d.um} µm`
      : `≈ ${d.um} µm aus Volumen ${volumenText(d.volumen)}`;
  }
  return d.volumen === undefined
    ? `≈ ${d.um} µm (geschätzt)`
    : `≈ ${d.um} µm (geschätzt, Standardvolumen ${volumenText(d.volumen)})`;
}

/** Nur wenn dickeUm, volumen und grammatur vorhanden sind: erwartet = round(grammatur × volumen).
 *  Abweichung > 10 % von erwartet → "Dicke <dickeUm> µm passt nicht zu Volumen <v> (erwartet <erwartet> µm)", sonst null.
 *  Genau 10 % ist noch in Ordnung. */
export function dickeHinweis(m: Material): string | null {
  if (m.dickeUm === undefined || m.volumen === undefined || m.grammatur === undefined) {
    return null;
  }
  const erwartet = Math.round(m.grammatur * m.volumen);
  if (Math.abs(m.dickeUm - erwartet) * 10 <= erwartet) {
    return null;
  }
  return `Dicke ${m.dickeUm} µm passt nicht zu Volumen ${volumenText(m.volumen)} (erwartet ${erwartet} µm)`;
}

/** Bogen ohne Laufrichtung → "Laufrichtung unbekannt, bitte prüfen", sonst null. */
export function laufrichtungHinweis(m: Material): string | null {
  if (m.form === 'Bogen' && m.laufrichtung === undefined) {
    return 'Laufrichtung unbekannt, bitte prüfen';
  }
  return null;
}

/** kategorie, falls angegeben; sonst Stueck → 'sonstiges', Bogen/Rolle → 'papier'. */
export function kategorieVon(m: Material): Kategorie {
  if (m.kategorie !== undefined) {
    return m.kategorie;
  }
  return m.form === 'Stueck' ? 'sonstiges' : 'papier';
}

export type MaterialFilter = {
  kategorie?: Kategorie | 'alle';
  form?: Material['form'];
  artikelnummer?: string;
};

/** Alle Bedingungen gelten gemeinsam (UND). Reihenfolge der Materialien bleibt wie im Lager.
 *  artikelnummer leer oder nur Leerzeichen → kein Filter; sonst nur Treffer von findeMaterialNachArtikelnummer.
 *  kategorie 'alle' oder fehlend → kein Filter; verglichen wird mit kategorieVon. */
export function filterMaterialien(lager: Lager, filter: MaterialFilter): Material[] {
  const kategorie = filter.kategorie;
  const form = filter.form;
  const nummer = (filter.artikelnummer ?? '').trim();
  const artikelnummernTreffer =
    nummer === ''
      ? undefined
      : new Set(findeMaterialNachArtikelnummer(lager, nummer).map((material) => material.id));

  return lager.materialien.filter((material) => {
    if (kategorie !== undefined && kategorie !== 'alle' && kategorieVon(material) !== kategorie) {
      return false;
    }
    if (form !== undefined && material.form !== form) {
      return false;
    }
    if (artikelnummernTreffer !== undefined && !artikelnummernTreffer.has(material.id)) {
      return false;
    }
    return true;
  });
}
