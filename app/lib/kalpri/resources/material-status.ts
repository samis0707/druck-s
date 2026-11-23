import { aktuellePreise } from './preise';
import type { Lager } from './lager-schema';
import { pruefeMaterial } from './material';

export type MaterialStatusStand = 'ok' | 'hinweis' | 'fehler';

export type MaterialStatus = { stand: MaterialStatusStand; gruende: string[] };

/** Pflichtangaben für die Kalkulation: Anzeigename je Prüffeld (aus den bestehenden
 *  Validierungen in material.ts abgeleitet; Dicke ist überall optional). */
const PFLICHTANGABEN: readonly { pfad: string; name: string }[] = [
  { pfad: 'grammatur', name: 'Grammatur' },
  { pfad: 'breiteUm', name: 'Breite' },
  { pfad: 'hoeheUm', name: 'Höhe' },
  { pfad: 'laengeM', name: 'Länge' },
];

const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

function datumDeutsch(iso: string): string {
  const teile = DATUM.exec(iso);
  if (teile === null) {
    return iso;
  }
  return `${teile[3]}.${teile[2]}.${teile[1]}`;
}

/**
 * Abgeleiteter Status eines Materials (reine Funktion, T69): `fehler`, wenn zum Stichtag kein
 * gültiger Preis vorliegt; sonst `hinweis`, wenn Pflichtangaben für die Kalkulation fehlen
 * (Grammatur, Format, je nach Form gemäß pruefeMaterial - Stueck hat Grammatur nicht als
 * Pflichtfeld); sonst `ok`. Lagerbestand ist kein Teil des Status. `material` darf eine
 * unvollständige Eingabe sein (z. B. Formular); fehlende Pflichtfelder werden dann benannt.
 * Fehler und Hinweise zusammen: stand `fehler`, die Begründungen listen beides.
 */
export function materialStatus(lager: Lager, material: unknown, stichtag: string): MaterialStatus {
  const gruende: string[] = [];
  const aktuelles = aktuellePreise(lager, (material as { id?: string }).id ?? '', stichtag);
  const preisDa = aktuelles.length > 0;
  if (!preisDa) {
    gruende.push(`kein gültiger Preis ab ${datumDeutsch(stichtag)}`);
  }
  const pruefung = pruefeMaterial(material);
  if (!pruefung.ok) {
    for (const pflicht of PFLICHTANGABEN) {
      const fehler = pruefung.fehler.find((f) => f.pfad === pflicht.pfad);
      if (fehler !== undefined) {
        gruende.push(
          fehler.meldung === 'Pflichtfeld'
            ? `${pflicht.name} fehlt`
            : `${pflicht.name}: ${fehler.meldung}`,
        );
      }
    }
  }
  const stand: MaterialStatusStand = !preisDa ? 'fehler' : gruende.length > 0 ? 'hinweis' : 'ok';
  return { stand, gruende };
}
