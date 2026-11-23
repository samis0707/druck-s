import {
  arbeitsplatzAendern,
  arbeitsplatzHinzufuegen,
  kostenstelleHinzufuegen,
  naechsteKostenstelleId,
} from './produktion';
import type { Produktion } from './produktion-schema';
import type { Fehler, PruefErgebnis } from './pruefung';

/** Ein neues Gerät beim Aufteilen: Name und die Schritte des alten Platzes, die es übernimmt. */
export type Geraet = { name: string; schrittIds: string[] };

/** Angaben, die zum Gerät bzw. zur Kostenrechnung gehören und nicht kopiert werden. */
const NICHT_KOPIERT = [
  'id',
  'name',
  'hersteller',
  'modell',
  'beschreibung',
  'kostenstelle',
  'kostenstelleId',
  'stundensatzVollZehntelcent',
  'stundensatzTeilZehntelcent',
  'stundensatzVorlaeufig',
  'personalZehntelcent',
  'inaktiv',
  'schritte',
  'auspraegungen',
];

function nichtOk(fehler: Fehler[]): PruefErgebnis<Produktion> {
  return { ok: false, fehler };
}

/**
 * Teilt einen Sammelplatz in einzelne Geräte (je ein neuer Platz). Jeder Schritt des alten
 * Platzes kommt auf genau ein Gerät; Schritte, die zusammen laufen (laeuftMit), auf dasselbe.
 * Den Stundensatz trägt danach eine Kostenstelle: die des alten Platzes oder eine neue aus
 * dessen Satz (Name des Platzes, Nummer = Kostenstellen-Text). Übrige Angaben des Platzes
 * (Bereich, Standort, Grenzen, Rüsten, Besatzung …) werden kopiert, Sonderfälle nur, wenn sie
 * für alle Schritte oder für einen Schritt des Geräts gelten. Der alte Platz wird inaktiv und
 * bleibt sonst unverändert (gespeicherte Kalkulationen zeigen weiter auf ihn).
 */
export function platzAufteilen(
  produktion: Produktion,
  platzId: string,
  geraete: readonly Geraet[],
): PruefErgebnis<Produktion> {
  const platz = (produktion.arbeitsplaetze ?? []).find((p) => p.id === platzId);
  if (!platz)
    return nichtOk([{ pfad: 'platzId', meldung: `Arbeitsplatz ${platzId} nicht gefunden` }]);
  if (platz.fremdarbeit) {
    return nichtOk([{ pfad: 'platzId', meldung: 'Fremdarbeit lässt sich nicht aufteilen' }]);
  }
  if (geraete.length < 2) {
    return nichtOk([{ pfad: 'geraete', meldung: 'mindestens zwei Geräte' }]);
  }
  const name = (id: string) => produktion.arbeitsschritte.find((s) => s.id === id)?.name ?? id;
  const amPlatz = new Set(platz.schritte.map((s) => s.schrittId));
  const geraetVon = new Map<string, number>();
  const fehler: Fehler[] = [];
  geraete.forEach((g, i) => {
    if (g.schrittIds.length === 0) {
      fehler.push({ pfad: `geraete.${i}.schrittIds`, meldung: 'mindestens ein Schritt' });
    }
    for (const id of g.schrittIds) {
      if (!amPlatz.has(id)) {
        fehler.push({
          pfad: 'geraete',
          meldung: `Schritt ${name(id)} ist an diesem Platz nicht möglich`,
        });
      } else if (geraetVon.has(id)) {
        fehler.push({ pfad: 'geraete', meldung: `Schritt ${name(id)} mehrfach zugeordnet` });
      } else {
        geraetVon.set(id, i);
      }
    }
  });
  for (const s of platz.schritte) {
    if (!geraetVon.has(s.schrittId)) {
      fehler.push({
        pfad: 'geraete',
        meldung: `Schritt ${name(s.schrittId)} keinem Gerät zugeordnet`,
      });
    }
  }
  for (const s of platz.schritte) {
    const mit = s.laeuftMit?.schrittId;
    if (mit === undefined || !geraetVon.has(s.schrittId) || !geraetVon.has(mit)) continue;
    if (geraetVon.get(s.schrittId) !== geraetVon.get(mit)) {
      fehler.push({
        pfad: 'geraete',
        meldung: `${name(s.schrittId)} läuft mit ${name(mit)} – beide müssen auf dasselbe Gerät`,
      });
    }
  }
  if (fehler.length > 0) return nichtOk(fehler);

  let stand = produktion;
  let kostenstelleId = platz.kostenstelleId;
  if (kostenstelleId === undefined && platz.stundensatzVollZehntelcent !== undefined) {
    kostenstelleId = naechsteKostenstelleId(stand);
    const neu: Record<string, unknown> = {
      id: kostenstelleId,
      name: platz.name,
      stundensatzVollZehntelcent: platz.stundensatzVollZehntelcent,
    };
    if (platz.kostenstelle !== undefined) neu['nummer'] = platz.kostenstelle;
    if (platz.stundensatzTeilZehntelcent !== undefined) {
      neu['stundensatzTeilZehntelcent'] = platz.stundensatzTeilZehntelcent;
    }
    if (platz.stundensatzVorlaeufig !== undefined) {
      neu['stundensatzVorlaeufig'] = platz.stundensatzVorlaeufig;
    }
    if (platz.personalZehntelcent !== undefined) {
      neu['personalZehntelcent'] = platz.personalZehntelcent;
    }
    const e = kostenstelleHinzufuegen(stand, neu);
    if (!e.ok) {
      return nichtOk(e.fehler.map((f) => ({ pfad: `kostenstelle.${f.pfad}`, meldung: f.meldung })));
    }
    stand = e.wert;
  }

  const basis: Record<string, unknown> = {};
  for (const [schluessel, w] of Object.entries(platz)) {
    if (!NICHT_KOPIERT.includes(schluessel)) basis[schluessel] = w;
  }
  for (const [i, g] of geraete.entries()) {
    const ids = new Set(g.schrittIds);
    const neu: Record<string, unknown> = {
      ...basis,
      name: g.name,
      schritte: platz.schritte.filter((s) => ids.has(s.schrittId)),
    };
    if (kostenstelleId !== undefined) neu['kostenstelleId'] = kostenstelleId;
    const sonderfaelle = (platz.auspraegungen ?? []).filter(
      (a) => a.schrittId === undefined || ids.has(a.schrittId),
    );
    if (sonderfaelle.length > 0) neu['auspraegungen'] = sonderfaelle;
    const e = arbeitsplatzHinzufuegen(stand, neu);
    if (!e.ok) {
      return nichtOk(e.fehler.map((f) => ({ pfad: `geraete.${i}.${f.pfad}`, meldung: f.meldung })));
    }
    stand = e.wert;
  }
  return arbeitsplatzAendern(stand, { ...platz, inaktiv: true });
}
