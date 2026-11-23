import { leistung, ms, type Leistung } from '@druck/units';
import type { Auspraegung, Bedingung } from './auspraegung-schema';
import { effektiveDicke, kategorieVon } from './eigenschaften';
import type { Lager } from './lager-schema';
import type { Material } from './material';
import type { Arbeitsplatz, Produktion } from './produktion-schema';

/**
 * Bekannte Merkmale für die Prüfung der Bedingungen. Was fehlt, ist unbekannt: Eine Bedingung
 * auf ein unbekanntes Merkmal trifft nicht zu. Einstellungen fehlen = keine gesetzt.
 */
export type Merkmale = {
  materialId?: string;
  kategorie?: string;
  oberflaeche?: string;
  laufrichtung?: string;
  grammatur?: number;
  dickeUm?: number;
  bogenbreiteUm?: number;
  bogenhoeheUm?: number;
  menge?: number;
  farben?: number;
  nutzen?: number;
  faecher?: number;
  einstellungen?: readonly string[];
};

/** Merkmale eines Materials aus dem Lager (Dicke über effektiveDicke, Format nur bei Bogen/Stück). */
export function merkmaleAusMaterial(m: Material): Merkmale {
  const merkmale: Merkmale = { materialId: m.id, kategorie: kategorieVon(m) };
  if (m.oberflaeche !== undefined) merkmale.oberflaeche = m.oberflaeche;
  if (m.grammatur !== undefined) merkmale.grammatur = m.grammatur;
  const dicke = effektiveDicke(m);
  if (dicke !== undefined) merkmale.dickeUm = dicke.um;
  if (m.form === 'Bogen' && m.laufrichtung !== undefined) merkmale.laufrichtung = m.laufrichtung;
  if (m.form === 'Bogen' || m.form === 'Stueck') {
    merkmale.bogenbreiteUm = m.breiteUm;
    merkmale.bogenhoeheUm = m.hoeheUm;
  }
  return merkmale;
}

function textGleich(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function textWert(b: Bedingung, m: Merkmale): string | undefined {
  switch (b.merkmal) {
    case 'material':
      return m.materialId;
    case 'kategorie':
      return m.kategorie;
    case 'oberflaeche':
      return m.oberflaeche;
    case 'laufrichtung':
      return m.laufrichtung;
    default:
      return undefined;
  }
}

function zahlWert(b: Bedingung, m: Merkmale): number | undefined {
  switch (b.merkmal) {
    case 'grammatur':
    case 'dickeUm':
    case 'bogenbreiteUm':
    case 'bogenhoeheUm':
    case 'menge':
    case 'farben':
    case 'nutzen':
    case 'faecher':
      return m[b.merkmal];
    default:
      return undefined;
  }
}

/** Trifft die Bedingung zu? Unbekanntes Merkmal → nein (außer „nicht gesetzt“ bei Einstellungen). */
export function bedingungTrifftZu(b: Bedingung, m: Merkmale): boolean {
  if (b.merkmal === 'einstellung') {
    const gesetzt = (m.einstellungen ?? []).some((e) => textGleich(e, String(b.wert)));
    return b.vergleich === 'gesetzt' ? gesetzt : !gesetzt;
  }
  if (b.vergleich === 'ist' || b.vergleich === 'istNicht') {
    const wert = textWert(b, m);
    if (wert === undefined) return false;
    const gleich =
      b.merkmal === 'material' ? wert === String(b.wert).trim() : textGleich(wert, String(b.wert));
    return b.vergleich === 'ist' ? gleich : !gleich;
  }
  const wert = zahlWert(b, m);
  if (wert === undefined || typeof b.wert !== 'number') return false;
  switch (b.vergleich) {
    case 'gleich':
      return wert === b.wert;
    case 'groesser':
      return wert > b.wert;
    case 'kleiner':
      return wert < b.wert;
    case 'vonBis':
      return b.bis !== undefined && wert >= b.wert && wert <= b.bis;
    default:
      return false;
  }
}

/** Ausprägungen des Platzes, die für den Schritt gelten (eigene oder ohne Schritt) und deren
 *  Bedingungen alle zutreffen – in der Reihenfolge am Platz. */
export function greifendeAuspraegungen(
  platz: Arbeitsplatz,
  schrittId: string,
  m: Merkmale,
): Auspraegung[] {
  return (platz.auspraegungen ?? []).filter(
    (a) =>
      (a.schrittId === undefined || a.schrittId === schrittId) &&
      a.bedingungen.every((b) => bedingungTrifftZu(b, m)),
  );
}

/** Alle Ausprägungen, die über „Material ist …“ auf das Material zeigen (Ansicht am Material). */
export function auspraegungenZuMaterial(
  produktion: Produktion,
  materialId: string,
): { platzId: string; platzName: string; auspraegung: Auspraegung }[] {
  const treffer: { platzId: string; platzName: string; auspraegung: Auspraegung }[] = [];
  for (const platz of produktion.arbeitsplaetze ?? []) {
    for (const a of platz.auspraegungen ?? []) {
      if (
        a.bedingungen.some((b) => b.merkmal === 'material' && String(b.wert).trim() === materialId)
      ) {
        treffer.push({ platzId: platz.id, platzName: platz.name, auspraegung: a });
      }
    }
  }
  return treffer;
}

/** Hinweise auf Ausprägungen, deren Material im Lager fehlt (z. B. nach dem Löschen). */
export function fehlendeMaterialien(produktion: Produktion, lager: Lager): string[] {
  const vorhanden = new Set(lager.materialien.map((m) => m.id));
  const hinweise: string[] = [];
  for (const platz of produktion.arbeitsplaetze ?? []) {
    for (const a of platz.auspraegungen ?? []) {
      for (const b of a.bedingungen) {
        const id = String(b.wert).trim();
        if (b.merkmal === 'material' && !vorhanden.has(id)) {
          hinweise.push(`${platz.name} – ${a.name}: Material ${id} nicht im Lager`);
        }
      }
    }
  }
  return hinweise;
}

/**
 * Leistung des Schritts am Platz für eine Variante (Name, ohne Groß-/Kleinschreibung).
 * Unbekannte Variante oder Variante ohne eigene Leistung → null; die Leistung des Schritts
 * liefert leistungAmPlatz.
 */
export function profilLeistung(
  produktion: Produktion,
  platzId: string,
  schrittId: string,
  profilName: string,
): Leistung | null {
  const platz = (produktion.arbeitsplaetze ?? []).find((p) => p.id === platzId);
  const amPlatz = platz?.schritte.find((s) => s.schrittId === schrittId);
  const schritt = produktion.arbeitsschritte.find((s) => s.id === schrittId);
  const profil = amPlatz?.profile?.find((p) => textGleich(p.name, profilName));
  if (!profil || !schritt || profil.menge === undefined || profil.dauerMs === undefined) {
    return null;
  }
  return leistung(profil.menge, schritt.einheit, ms(profil.dauerMs));
}
