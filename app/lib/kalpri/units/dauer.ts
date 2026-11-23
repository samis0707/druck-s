import { zehntelcent, type Geld } from './geld';
import { rundeKaufmaennisch } from './runden';

/** Zeitdauer, intern ganzzahlig in Millisekunden. */
export type Dauer = { readonly ms: number; readonly __art: 'Dauer' };

const MS_JE_SEKUNDE = 1000;
const MS_JE_MINUTE = 60_000;
const MS_JE_STUNDE = 3_600_000;

function pruefeDauerZahl(wert: number): void {
  if (Number.isNaN(wert) || !Number.isFinite(wert)) {
    throw new RangeError(`Ungültige Dauer: ${wert}`);
  }
  if (wert < 0) {
    throw new RangeError(`Dauer darf nicht negativ sein: ${wert}`);
  }
}

function legeAn(msWert: number): Dauer {
  return { ms: Object.is(msWert, -0) ? 0 : msWert, __art: 'Dauer' };
}

export function ms(wert: number): Dauer {
  pruefeDauerZahl(wert);
  if (!Number.isInteger(wert)) {
    throw new RangeError(`Dauer muss ganzzahlig in ms sein: ${wert}`);
  }
  return legeAn(wert);
}

export function sekunden(wert: number): Dauer {
  pruefeDauerZahl(wert);
  return legeAn(rundeKaufmaennisch(wert * MS_JE_SEKUNDE));
}

export function minuten(wert: number): Dauer {
  pruefeDauerZahl(wert);
  return legeAn(rundeKaufmaennisch(wert * MS_JE_MINUTE));
}

export function stunden(wert: number): Dauer {
  pruefeDauerZahl(wert);
  return legeAn(rundeKaufmaennisch(wert * MS_JE_STUNDE));
}

export function inSekunden(d: Dauer): number {
  return d.ms / MS_JE_SEKUNDE;
}

export function inMinuten(d: Dauer): number {
  return d.ms / MS_JE_MINUTE;
}

export function inStunden(d: Dauer): number {
  return d.ms / MS_JE_STUNDE;
}

export function plusD(a: Dauer, b: Dauer): Dauer {
  return legeAn(a.ms + b.ms);
}

export function malD(a: Dauer, faktor: number): Dauer {
  pruefeDauerZahl(faktor);
  return legeAn(rundeKaufmaennisch(a.ms * faktor));
}

export function summeD(liste: readonly Dauer[]): Dauer {
  let summe = 0;
  for (const d of liste) {
    summe += d.ms;
  }
  return legeAn(summe);
}

/** Kosten für eine Dauer bei einem Stundensatz, kaufmännisch auf Zehntelcent gerundet. */
export function kostenFuerDauer(satzJeStunde: Geld, d: Dauer): Geld {
  return zehntelcent(rundeKaufmaennisch((satzJeStunde.zehntelcent * d.ms) / MS_JE_STUNDE));
}

export type ZeitEinheit = 's' | 'min' | 'h';

const ZEIT_WOERTER: Record<string, number> = {
  s: MS_JE_SEKUNDE,
  sek: MS_JE_SEKUNDE,
  sekunde: MS_JE_SEKUNDE,
  sekunden: MS_JE_SEKUNDE,
  min: MS_JE_MINUTE,
  minute: MS_JE_MINUTE,
  minuten: MS_JE_MINUTE,
  h: MS_JE_STUNDE,
  std: MS_JE_STUNDE,
  stunde: MS_JE_STUNDE,
  stunden: MS_JE_STUNDE,
};

export type LeseErgebnis<T> = { ok: true; wert: T } | { ok: false; meldung: string };

export const DAUER_BEISPIEL = 'Zeit nicht lesbar – z. B. „5 min“, „0,08 h“, „1,5 s“';

/**
 * Liest eine Zeitangabe wie „5 min“, „0,08 h“, „1,5 s“, „2 Std.“ (Komma oder Punkt als
 * Dezimalzeichen, Einheit Pflicht, Groß-/Kleinschreibung egal). „1.500 s“ ist mehrdeutig
 * (Tausenderpunkt?) und wird abgelehnt; „0.875 min“ ist erlaubt.
 */
export function leseDauer(text: string): LeseErgebnis<Dauer> {
  const sauber = text.trim().toLowerCase();
  if (sauber === '') {
    return { ok: false, meldung: 'Pflichtfeld' };
  }
  const treffer = /^(\d+(?:[.,]\d+)?)\s*([a-z]+)\.?$/.exec(sauber);
  if (!treffer) {
    return { ok: false, meldung: DAUER_BEISPIEL };
  }
  const zahlText = treffer[1] ?? '';
  const wort = treffer[2] ?? '';
  const faktor = ZEIT_WOERTER[wort];
  if (faktor === undefined) {
    return { ok: false, meldung: DAUER_BEISPIEL };
  }
  if (/^[1-9]\d{0,2}\.\d{3}$/.test(zahlText)) {
    return { ok: false, meldung: 'Bitte ohne Tausenderpunkt eingeben' };
  }
  const zahl = Number(zahlText.replace(',', '.'));
  return { ok: true, wert: legeAn(rundeKaufmaennisch(zahl * faktor)) };
}

function formatZahl(wert: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(wert);
}

/**
 * Deutsches Format mit höchstens 2 Nachkommastellen. Ohne Einheit automatisch:
 * unter 1 min in s, unter 1 h in min, sonst in h.
 */
export function formatDauer(d: Dauer, einheit?: ZeitEinheit): string {
  const gewaehlt: ZeitEinheit =
    einheit ?? (d.ms < MS_JE_MINUTE ? 's' : d.ms < MS_JE_STUNDE ? 'min' : 'h');
  if (gewaehlt === 's') return `${formatZahl(inSekunden(d))} s`;
  if (gewaehlt === 'min') return `${formatZahl(inMinuten(d))} min`;
  return `${formatZahl(inStunden(d))} h`;
}
