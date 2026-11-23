import { rundeKaufmaennisch, zehntelcent, type Geld } from '@druck/units';
import type { Material } from './material';
import { pruefeLager, type Lager } from './lager-schema';
import type { Preis } from './preis-schema';
import type { PruefErgebnis } from './pruefung';
import { sortenPreiseFuerMaterial } from './sorten';

/** Vergleicht Texte zeichenweise, unabhängig von der Sprachumgebung. */
function vergleichen(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "P" + mindestens 4 Ziffern, eins höher als die höchste vorhandene "P####"-ID; ohne Preise "P0001". */
export function naechstePreisId(lager: Lager): string {
  let hoechste = 0;
  for (const preis of lager.preise ?? []) {
    const treffer = /^P(\d+)$/.exec(preis.id);
    if (!treffer) {
      continue;
    }
    const zahl = Number.parseInt(treffer[1] ?? '', 10);
    if (Number.isFinite(zahl) && zahl > hoechste) {
      hoechste = zahl;
    }
  }
  return `P${String(hoechste + 1).padStart(4, '0')}`;
}

/** Hängt das neue Objekt mit automatischer ID an die Eingabe, wenn sie ein Objekt ist und
 *  die ID fehlt oder nach dem Trimmen leer ist. Alles andere wird unverändert durchgereicht. */
function mitAutomatischerId(lager: Lager, eingabe: unknown): unknown {
  if (typeof eingabe !== 'object' || eingabe === null || Array.isArray(eingabe)) {
    return eingabe;
  }
  const id = (eingabe as { id?: unknown }).id;
  const passt = id !== undefined && (typeof id !== 'string' || id.trim() !== '');
  if (passt) {
    return eingabe;
  }
  return { ...(eingabe as Record<string, unknown>), id: naechstePreisId(lager) };
}

/** Hängt einen Preis an (nie ersetzen). Fehlt id oder ist sie leer → naechstePreisId.
 *  Prüft das ganze Lager mit pruefeLager. Fehlerpfade des neuen Preises werden ohne das
 *  Präfix "preise.<i>." zurückgegeben (z. B. "gueltigAb" statt "preise.0.gueltigAb"). */
export function preisHinzufuegen(lager: Lager, eingabe: unknown): PruefErgebnis<Lager> {
  const preise = [...(lager.preise ?? []), mitAutomatischerId(lager, eingabe)];
  const pruefung = pruefeLager({ ...lager, preise });
  if (pruefung.ok) {
    return pruefung;
  }
  const neuerIndex = preise.length - 1;
  return {
    ok: false,
    fehler: pruefung.fehler.map((fehler) => {
      const teile = fehler.pfad.split('.');
      if (teile[0] === 'preise' && teile[1] === String(neuerIndex)) {
        return { pfad: teile.slice(2).join('.'), meldung: fehler.meldung };
      }
      return fehler;
    }),
  };
}

/** Alle Preise eines Materials, nach gueltigAb aufsteigend; bei gleichem Datum in Reihenfolge des Anhängens. */
export function preisHistorie(lager: Lager, materialId: string): Preis[] {
  return [
    ...(lager.preise ?? []).filter((preis) => preis.materialId === materialId),
    // T169: Sortenpreise (je 100 kg) des Hauspapiers gehören zur Historie des Materials
    ...sortenPreiseFuerMaterial(lager, materialId),
  ].sort((a, b) => vergleichen(a.gueltigAb, b.gueltigAb));
}

/** Je Lieferant (getrimmt, ohne Groß-/Kleinschreibung) der neueste Preis mit gueltigAb <= stichtag;
 *  bei gleichem Datum gewinnt der zuletzt angehängte. Ergebnis nach Lieferant sortiert (localeCompare 'de'). */
export function aktuellePreise(lager: Lager, materialId: string, stichtag: string): Preis[] {
  const jeLieferant = new Map<string, Preis>();
  // T169: Sortenpreise zuerst – ein eigener Preis am Material mit gleichem oder neuerem Datum
  // geht vor (bei gleichem Datum gewinnt der zuletzt angehängte)
  [...sortenPreiseFuerMaterial(lager, materialId), ...(lager.preise ?? [])].forEach((preis) => {
    if (preis.materialId !== materialId || preis.gueltigAb > stichtag) {
      return;
    }
    const schluessel = preis.lieferant.trim().toLowerCase();
    const vorhanden = jeLieferant.get(schluessel);
    if (vorhanden === undefined || preis.gueltigAb >= vorhanden.gueltigAb) {
      jeLieferant.set(schluessel, preis);
    }
  });
  return [...jeLieferant.values()].sort((a, b) =>
    a.lieferant.trim().localeCompare(b.lieferant.trim(), 'de'),
  );
}

export type Vergleichswerte = {
  jeEinheit?: Geld; // nur bei basis 'einheit': Betrag der gewählten Staffelstufe
  je1000?: Geld; // Bogen und Stück
  je100kg?: Geld; // Bogen und Rolle (braucht Grammatur)
  jeRolle?: Geld; // Rolle
  jeLaufmeter?: Geld; // Rolle
  jeM2?: Geld; // Rolle
};

/** Die Staffelstufe mit dem höchsten "ab" <= anzahlEinheiten. */
function gewaehlteStufe(preis: Extract<Preis, { basis: 'einheit' }>, anzahlEinheiten: number) {
  const treffer = preis.staffel.filter((stufe) => stufe.ab <= anzahlEinheiten);
  const stufe = treffer.length > 0 ? treffer[treffer.length - 1] : preis.staffel[0];
  if (!stufe) {
    throw new RangeError(`Preis ${preis.id} hat keine Staffel`);
  }
  return stufe;
}

/** T182: Faktor der Bezugseinheit je Bestellmenge-Einheit (Gebinde 1, je 1.000 Stück 1000, je 100 kg 100). */
const BEZUG_FAKTOR: Record<Preis['basis'], number> = { einheit: 1, je1000: 1000, je100kg: 100 };

/**
 * T182: Einstandsbetrag zu einem Listenbetrag (Zehntelcent je Bezugseinheit, ungerundet):
 * Liste × (1 − Rabatt) × (1 − Skonto) + Zuschlag + Bezugskosten ÷ Bestellmenge × Faktor.
 */
export function einstandBetrag(preis: Preis, listenbetrag: number): number {
  const e = preis.einstand;
  if (e === undefined) return listenbetrag;
  let b = listenbetrag * (1 - (e.rabattProzent ?? 0) / 100) * (1 - (e.skontoProzent ?? 0) / 100);
  b += e.zuschlagZehntelcent ?? 0;
  if (e.bezugskostenZehntelcent !== undefined && e.bestellmenge !== undefined)
    b += (e.bezugskostenZehntelcent / e.bestellmenge) * BEZUG_FAKTOR[preis.basis];
  return b;
}

/** Listenbetrag der Bezugseinheit (erste Staffelstufe bzw. Betrag). */
export function listenbetrag(preis: Preis): number {
  return preis.basis === 'einheit'
    ? (preis.staffel[0]?.betragZehntelcent ?? 0)
    : preis.betragZehntelcent;
}

const euroText = (z: number) =>
  `${(z / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: z < 1000 ? 4 : 2 })} €`;

/**
 * T182: Einstand als lesbare Kette, z. B. „Liste 15,00 € + Versand 15,00 € ÷ 2 = 22,50 € je Rolle“;
 * null ohne Einstand.
 */
export function einstandText(preis: Preis): string | null {
  const e = preis.einstand;
  if (e === undefined) return null;
  const liste = listenbetrag(preis);
  const teile = [`Liste ${euroText(liste)}`];
  if (e.rabattProzent) teile.push(`− ${String(e.rabattProzent).replace('.', ',')} % Rabatt`);
  if (e.skontoProzent) teile.push(`− ${String(e.skontoProzent).replace('.', ',')} % Skonto`);
  if (e.zuschlagZehntelcent) teile.push(`+ Zuschläge ${euroText(e.zuschlagZehntelcent)}`);
  if (e.bezugskostenZehntelcent !== undefined && e.bestellmenge !== undefined)
    teile.push(
      `+ Versand ${euroText(e.bezugskostenZehntelcent)} ÷ ${String(e.bestellmenge).replace('.', ',')}${
        preis.basis === 'einheit' ? '' : preis.basis === 'je1000' ? ' Stück × 1.000' : ' kg × 100'
      }`,
    );
  const je =
    preis.basis === 'einheit' ? preis.einheitName : preis.basis === 'je1000' ? '1.000' : '100 kg';
  return `${teile.join(' ')} = ${euroText(Math.round(einstandBetrag(preis, liste)))} je ${je}`;
}

/** Rechnet einen Preis in Vergleichswerte um. anzahlEinheiten (Standard 1) wählt die Staffelstufe
 *  (höchstes "ab" <= anzahlEinheiten). Wirft RangeError "Preis <id> gehört nicht zu Material <id>",
 *  wenn materialId nicht passt. */
export function preisVergleichswerte(
  material: Material,
  preis: Preis,
  anzahlEinheiten = 1,
): Vergleichswerte {
  if (preis.materialId !== material.id) {
    throw new RangeError(`Preis ${preis.id} gehört nicht zu Material ${material.id}`);
  }
  // Verbrauchsmaterial (T102) hat keine Fläche: Preis je Einheit (ml, kg …), je 1.000 Einheiten
  const flaecheM2 =
    material.form === 'Menge'
      ? 0
      : material.form === 'Rolle'
        ? (material.breiteUm / 1_000_000) * material.laengeM
        : (material.breiteUm / 1_000_000) * (material.hoeheUm / 1_000_000);
  const gewichtG = material.grammatur === undefined ? undefined : material.grammatur * flaecheM2;

  // Preis je Stück (Bogen, Stück bzw. Rolle) in Zehntelcent, ungerundet.
  let preisJeStueck: number;
  if (preis.basis === 'einheit') {
    preisJeStueck =
      einstandBetrag(preis, gewaehlteStufe(preis, anzahlEinheiten).betragZehntelcent) /
      preis.inhalt;
  } else if (preis.basis === 'je1000') {
    preisJeStueck = einstandBetrag(preis, preis.betragZehntelcent) / 1000;
  } else {
    if (gewichtG === undefined) {
      throw new RangeError(`Material ${material.id} hat keine Grammatur für je 100 kg`);
    }
    preisJeStueck = (einstandBetrag(preis, preis.betragZehntelcent) * gewichtG) / 100000;
  }

  // Erst ganz am Ende je Wert kaufmännisch auf ganze Zehntelcent runden.
  const runden = (wert: number): Geld => zehntelcent(rundeKaufmaennisch(wert));

  const ergebnis: Vergleichswerte = {};
  if (preis.basis === 'einheit') {
    ergebnis.jeEinheit = runden(
      einstandBetrag(preis, gewaehlteStufe(preis, anzahlEinheiten).betragZehntelcent),
    );
  }
  if (material.form === 'Rolle') {
    ergebnis.jeRolle = runden(preisJeStueck);
    ergebnis.jeLaufmeter = runden(preisJeStueck / material.laengeM);
    ergebnis.jeM2 = runden(preisJeStueck / flaecheM2);
  } else {
    ergebnis.je1000 = runden(preisJeStueck * 1000);
  }
  if ((material.form === 'Bogen' || material.form === 'Rolle') && gewichtG !== undefined) {
    ergebnis.je100kg = runden((preisJeStueck / gewichtG) * 100000);
  }
  return ergebnis;
}
