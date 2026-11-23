import { mengeImWeg, schrittImWeg } from './arbeitsweg';
import type { Kalkulation, Zeile } from './kalkulation-schema';
import type { Lager } from './lager-schema';
import type { Arbeitsschritt, Erzeugnis, Produktion } from './produktion-schema';

/**
 * T134: „Aus … wird …“ – Tätigkeiten passen wie ein Puzzle zusammen (Nutzer 11.11., angelehnt an
 * Keyline: eingehende und ausgehende Erzeugnisse je Arbeitsvorgang). Die Angabe steht an der
 * Tätigkeit (Zustandswechsel, AGENTS Regel 12), nie an der Maschine. Experten-Modus: Die Prüfung
 * gibt Hinweise, sie verbietet nichts.
 */

export const ERZEUGNIS_NAME: Record<Erzeugnis, string> = {
  rohbogen: 'Rohbogen',
  druckbogen: 'Druckbogen',
  nutzen: 'Nutzen (Blatt)',
  falzbogen: 'Falzbogen',
  satz: 'Satz',
  exemplar: 'Exemplar',
  paket: 'Paket',
  ware: 'Stück / gelieferte Ware',
};

export type SchrittErzeugnis = {
  /** Was hineingehen kann; leer = egal. */
  aus: Erzeugnis[];
  /** Was herauskommt; null = bleibt, wie es war. */
  wird: Erzeugnis | null;
  /** true = aus der Tätigkeit abgeleitet, nicht eingetragen. */
  abgeleitet: boolean;
};

/**
 * Zustandswechsel einer Tätigkeit: eingetragen (aus/wird), sonst abgeleitet – Druck: Bogen bleibt
 * Druckbogen (je Stück: Ware bleibt Ware); Schneiden und „schneidet aus“: Druckbogen → Nutzen; je
 * Druckbogen: braucht Druckbogen; je Nutzen oder Stapel: braucht Nutzen; je Produkt: aus Nutzen,
 * Falzbogen, Satz oder Exemplar wird Exemplar (Paket bei Einheit Paket).
 */
export function schrittErzeugnis(roh: Arbeitsschritt): SchrittErzeugnis {
  const s = schrittImWeg(roh);
  let aus: Erzeugnis[] = [];
  let wird: Erzeugnis | null = null;
  const menge = mengeImWeg(s).wert;
  if (s.imWeg?.art === 'druck') {
    if (s.einheit === 'Stueck') aus = ['ware', 'nutzen'];
    else {
      aus = ['rohbogen', 'druckbogen'];
      wird = 'druckbogen';
    }
  } else if (s.imWeg?.art === 'schnitt' || s.schneidetAus === true) {
    aus = ['rohbogen', 'druckbogen'];
    wird = 'nutzen';
  } else if (
    s.imWeg?.art === 'auftrag' ||
    menge === 'blaetter' ||
    ['Stunde', 'Auftrag', 'Einsatz'].includes(s.einheit)
  ) {
    aus = [];
  } else if (menge === 'druckbogen') {
    aus = ['rohbogen', 'druckbogen'];
  } else if (menge === 'nutzen' || menge === 'stapel') {
    aus = ['nutzen', 'falzbogen'];
  } else if (menge === 'produkt') {
    aus = ['nutzen', 'falzbogen', 'satz', 'exemplar'];
    wird = s.einheit === 'Paket' ? 'paket' : s.einheit === 'Satz' ? 'satz' : 'exemplar';
  }
  const eingetragen = roh.aus !== undefined || roh.wird !== undefined;
  return {
    aus: roh.aus !== undefined ? [...roh.aus] : aus,
    wird: roh.wird !== undefined ? roh.wird : wird,
    abgeleitet: !eingetragen,
  };
}

/** „aus Druckbogen wird Nutzen (Blatt)“, „braucht Nutzen (Blatt)“, „passt überall“. */
export function erzeugnisText(e: SchrittErzeugnis): string {
  const aus = e.aus.map((x) => ERZEUGNIS_NAME[x]).join(' oder ');
  if (e.aus.length === 0)
    return e.wird === null ? 'passt überall' : `wird ${ERZEUGNIS_NAME[e.wird]}`;
  return e.wird === null ? `braucht ${aus}` : `aus ${aus} wird ${ERZEUGNIS_NAME[e.wird]}`;
}

function teilVon(z: Zeile): string | null {
  return z.art === 'arbeitsgang' && z.menge.art === 'papierweg' ? z.menge.teilId : null;
}

/**
 * Prüft die Reihenfolge der Arbeitsgänge: je Teil vom Ausgangszustand (Ware vom Kunden,
 * Stück-Material wie Kuverts → Ware, gelieferte Bogen → Druckbogen, sonst Rohbogen) Schritt für Schritt; danach die Schritte am
 * ganzen Produkt. Passt der Zustand nicht zu dem, was die Tätigkeit braucht, gibt es einen Hinweis
 * an der Zeile. Zeilen mit Menge von Hand, aus der Auflage oder je Auftrag werden nicht geprüft.
 */
export function reihenfolgeHinweise(
  k: Pick<Kalkulation, 'zeilen' | 'teile'>,
  p: Pick<Produktion, 'arbeitsschritte'>,
  lager?: Pick<Lager, 'materialien'>,
): Map<string, string> {
  const hinweise = new Map<string, string>();
  const erzeugnis = (z: Zeile) => {
    if (z.art !== 'arbeitsgang') return null;
    const s = p.arbeitsschritte.find((x) => x.id === z.schrittId);
    return s ? { s, e: schrittErzeugnis(s) } : null;
  };
  const pruefe = (z: Zeile, zustand: Erzeugnis): Erzeugnis => {
    const x = erzeugnis(z);
    if (!x) return zustand;
    // Vorschneiden: aus dem Rohbogen wird der Druckbogen
    if (z.art === 'arbeitsgang' && z.menge.art === 'papierweg' && z.menge.wert === 'vorschneiden') {
      return 'druckbogen';
    }
    // gelieferte Ware nimmt jede Tätigkeit an, die Bogen oder Nutzen braucht
    const passt =
      x.e.aus.length === 0 ||
      x.e.aus.includes(zustand) ||
      (zustand === 'ware' && x.e.aus.some((a) => a !== 'satz' && a !== 'exemplar'));
    if (!passt) {
      hinweise.set(
        z.id,
        `Reihenfolge: ${x.s.name} braucht ${x.e.aus.map((a) => ERZEUGNIS_NAME[a]).join(' oder ')} – ` +
          `an dieser Stelle ist es ${ERZEUGNIS_NAME[zustand]}`,
      );
    }
    return x.e.wird ?? zustand;
  };
  for (const t of k.teile ?? []) {
    const form = lager?.materialien.find((m) => m.id === t.materialId)?.form;
    let zustand: Erzeugnis =
      t.wareGestellt === true || form === 'Stueck'
        ? 'ware'
        : t.geliefert === true
          ? 'druckbogen'
          : 'rohbogen';
    for (const z of k.zeilen) if (teilVon(z) === t.id) zustand = pruefe(z, zustand);
  }
  let zustand: Erzeugnis = 'nutzen';
  for (const z of k.zeilen) {
    if (z.art === 'arbeitsgang' && z.menge.art === 'produkt') zustand = pruefe(z, zustand);
  }
  return hinweise;
}

/**
 * Neue Zeile so weit hinten einordnen, wie die Reihenfolge noch passt: zuerst ans Ende; gibt das
 * einen Hinweis mehr, wandert sie Stelle für Stelle nach vorn (z. B. Stanzen vor das Schneiden).
 * Passt sie nirgends, bleibt sie am Ende – mit Hinweis.
 */
export function zeilenMitEingeordneter(
  k: Pick<Kalkulation, 'zeilen' | 'teile'>,
  neu: Zeile,
  p: Pick<Produktion, 'arbeitsschritte'>,
  lager?: Pick<Lager, 'materialien'>,
): Zeile[] {
  const vorher = reihenfolgeHinweise(k, p, lager).size;
  for (let i = k.zeilen.length; i >= 0; i--) {
    const zeilen = [...k.zeilen.slice(0, i), neu, ...k.zeilen.slice(i)];
    if (reihenfolgeHinweise({ zeilen, teile: k.teile }, p, lager).size <= vorher) return zeilen;
  }
  return [...k.zeilen, neu];
}
