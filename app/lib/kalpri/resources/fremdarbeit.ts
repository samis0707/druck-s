import {
  einheitAnzeige,
  formatEuro,
  rundeKaufmaennisch,
  zehntelcent,
  type Einheit,
  type Geld,
} from '@druck/units';
import { STANDARD_MENGENREGEL, type Abrechnung, type Mengenregel } from './lieferant-schema';
import type { Produktion } from './produktion-schema';
import type { Fehler, PruefErgebnis } from './pruefung';

/** Eine angefragte Menge mit Gesamtpreis vom Lieferanten; Aufschlag je Staffel und Fortdruck
 *  (Einkaufspreis je weitere 1.000) freiwillig. */
export type FremdStaffel = {
  menge: number;
  preisZehntelcent: number;
  fortdruckJe1000Zehntelcent?: number;
  aufschlagProzent?: number;
  aufschlagFestZehntelcent?: number;
};

/** Eingabe der Fremdarbeit-Rechnung (jetzt Probe-Rechnung, ab M9 eine Anfrage im Auftrag). */
export type FremdEingabe = {
  platzId: string;
  /** Angefragte Mengen (beliebig viele, Formular: 6); gerechnet wird nur eine davon. */
  staffeln: readonly FremdStaffel[];
  /** Gerechnete Menge – muss eine der angefragten Mengen sein. */
  menge: number;
  /** Ersetzt den Grundpreis des Platzes (für diese Anfrage). */
  grundpreisZehntelcent?: number;
  /** Gelieferte Menge (ohne Angabe = menge). */
  geliefert?: number;
  /** Davon bei uns weiterverarbeitet (ohne Angabe = geliefert). */
  weiterverarbeitet?: number;
  /** Liefermengen-Regel nur für diese Anfrage (sonst vom Lieferanten, sonst ± 10 %, Staffelpreis). */
  mengenregel?: Mengenregel;
};

/**
 * Ergebnis mit allen Teilen getrennt, damit später wahlweise nur die reinen Kosten, Kosten +
 * feste Aufschläge oder der volle Preis übergeben werden kann (z. B. an CRM/ERP).
 */
export type FremdErgebnis = {
  einheit: Einheit;
  menge: number;
  grundpreis: Geld;
  staffelpreis: Geld;
  /** Reine Kosten = Grundpreis + Staffelpreis (zählt in Voll- und Teilkosten). */
  einkauf: Geld;
  aufschlagProzent: number;
  /** Prozent-Aufschlag als Betrag (auf den Einkauf). */
  aufschlagProzentBetrag: Geld;
  aufschlagFest: Geld;
  /** Verkauf = Einkauf + Prozent-Aufschlag + fester Aufschlag. */
  verkauf: Geld;
  jeStueck: Geld;
  je100: Geld;
  je1000: Geld;
  geliefert: number;
  weiterverarbeitet: number;
  /** Liefermengen-Regel, die gilt (0 % = genaue Menge). */
  toleranzProzent: number;
  abrechnung: Abrechnung;
  /** Abweichung geliefert ↔ bestellt in % (gerundet auf 0,1). */
  abweichungProzent: number;
  innerhalbToleranz: boolean;
  /** Was nach der Regel abzurechnen ist (ohne Abweichung = Verkauf). */
  abrechnungsbetrag: Geld;
  /** Mehrmenge, die zusätzlich abrechenbar wäre, wenn der Kunde zustimmt; sonst null. */
  mehrmengeBetrag: Geld | null;
  lieferant?: string;
  lieferzeitTage?: number;
  hinweise: string[];
};

function fehler(liste: Fehler[]): PruefErgebnis<FremdErgebnis> {
  return { ok: false, fehler: liste };
}

function ganzAb(wert: number, min: number): boolean {
  return Number.isInteger(wert) && wert >= min;
}

function anzahl(wert: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(wert);
}

/** Zehntelcent mit drei Nachkommastellen: 160 → „0,160 €“ (für Stückpreise). */
export function formatEuro3(g: Geld): string {
  const text = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(g.zehntelcent / 1000);
  return `${text} €`;
}

/** Betrag × k ÷ menge, kaufmännisch auf Zehntelcent gerundet (Stück-, 100er-, 1.000er-Preis). */
function anteil(g: Geld, k: number, menge: number): Geld {
  return zehntelcent(rundeKaufmaennisch((g.zehntelcent * k) / menge));
}

/**
 * Rechnet eine Fremdarbeit: Einkauf = Grundpreis + Staffelpreis; Aufschlag % (auf den Einkauf)
 * und fester Aufschlag aus der Staffel, sonst vom Platz, sonst vom Lieferanten, sonst 0;
 * Verkauf = Einkauf + beide. Nur angefragte Mengen werden gerechnet.
 * Mehr-/Minderlieferung nach der Liefermengen-Regel (Anfrage > Lieferant > ± 10 %, Staffelpreis):
 * innerhalb der Toleranz bleibt der Staffelpreis (Mehrmenge abrechenbar, wenn der Kunde zustimmt)
 * oder es zählt die gelieferte Menge (Abweichung zum Fortdruck je 1.000, sonst Staffelpreis
 * anteilig, plus Prozent-Aufschlag); außerhalb: Minderlieferung nach Stückpreis, Mehrmenge nur
 * nach Absprache. Genaue Menge = Toleranz 0.
 */
export function rechneFremdarbeit(
  produktion: Produktion,
  e: FremdEingabe,
): PruefErgebnis<FremdErgebnis> {
  const platz = (produktion.arbeitsplaetze ?? []).find((p) => p.id === e.platzId);
  if (!platz) {
    return fehler([{ pfad: 'platzId', meldung: `Arbeitsplatz ${e.platzId} nicht gefunden` }]);
  }
  const fremd = platz.fremdarbeit;
  if (!fremd) {
    return fehler([{ pfad: 'platzId', meldung: `${platz.name} ist keine Fremdarbeit` }]);
  }
  if (e.staffeln.length === 0) {
    return fehler([{ pfad: 'staffeln', meldung: 'mindestens eine Staffel' }]);
  }

  const liste: Fehler[] = [];
  const gesehen = new Set<number>();
  e.staffeln.forEach((s, i) => {
    if (!ganzAb(s.menge, 1)) {
      liste.push({
        pfad: `staffeln.${i}.menge`,
        meldung: 'muss eine ganze Zahl größer als 0 sein',
      });
    } else if (gesehen.has(s.menge)) {
      liste.push({ pfad: `staffeln.${i}.menge`, meldung: `Menge doppelt: ${anzahl(s.menge)}` });
    }
    gesehen.add(s.menge);
    if (!ganzAb(s.preisZehntelcent, 0)) {
      liste.push({ pfad: `staffeln.${i}.preisZehntelcent`, meldung: 'darf nicht negativ sein' });
    }
    if (s.aufschlagProzent !== undefined && !(s.aufschlagProzent >= 0)) {
      liste.push({ pfad: `staffeln.${i}.aufschlagProzent`, meldung: 'darf nicht negativ sein' });
    }
    if (s.fortdruckJe1000Zehntelcent !== undefined && !ganzAb(s.fortdruckJe1000Zehntelcent, 0)) {
      liste.push({
        pfad: `staffeln.${i}.fortdruckJe1000Zehntelcent`,
        meldung: 'darf nicht negativ sein',
      });
    }
    if (s.aufschlagFestZehntelcent !== undefined && !ganzAb(s.aufschlagFestZehntelcent, 0)) {
      liste.push({
        pfad: `staffeln.${i}.aufschlagFestZehntelcent`,
        meldung: 'darf nicht negativ sein',
      });
    }
  });
  if (e.grundpreisZehntelcent !== undefined && !ganzAb(e.grundpreisZehntelcent, 0)) {
    liste.push({ pfad: 'grundpreisZehntelcent', meldung: 'darf nicht negativ sein' });
  }
  const geliefert = e.geliefert ?? e.menge;
  const weiter = e.weiterverarbeitet ?? geliefert;
  if (e.geliefert !== undefined && !ganzAb(e.geliefert, 0)) {
    liste.push({ pfad: 'geliefert', meldung: 'muss eine ganze Zahl ab 0 sein' });
  }
  if (e.weiterverarbeitet !== undefined && !ganzAb(e.weiterverarbeitet, 0)) {
    liste.push({ pfad: 'weiterverarbeitet', meldung: 'muss eine ganze Zahl ab 0 sein' });
  } else if (weiter > geliefert) {
    liste.push({ pfad: 'weiterverarbeitet', meldung: 'mehr als geliefert' });
  }
  if (liste.length > 0) return fehler(liste);

  const staffel = e.staffeln.find((s) => s.menge === e.menge);
  if (!staffel) {
    const mengen = e.staffeln.map((s) => anzahl(s.menge)).join(', ');
    return fehler([{ pfad: 'menge', meldung: `Nur angefragte Mengen: ${mengen}` }]);
  }

  const lieferant = (produktion.lieferanten ?? []).find((l) => l.id === fremd.lieferantId);
  const einheit: Einheit = fremd.einheit ?? 'Stueck';
  const grundpreis = zehntelcent(e.grundpreisZehntelcent ?? fremd.grundpreisZehntelcent ?? 0);
  const staffelpreis = zehntelcent(staffel.preisZehntelcent);
  const einkauf = zehntelcent(grundpreis.zehntelcent + staffelpreis.zehntelcent);
  const prozent =
    staffel.aufschlagProzent ?? fremd.aufschlagProzent ?? lieferant?.aufschlagProzent ?? 0;
  // Prozent über Hundertstel ganzzahlig rechnen (0,5 % → 50), dann kaufmännisch runden.
  const aufschlagProzentBetrag = zehntelcent(
    rundeKaufmaennisch((einkauf.zehntelcent * Math.round(prozent * 100)) / 10_000),
  );
  const aufschlagFest = zehntelcent(
    staffel.aufschlagFestZehntelcent ??
      fremd.aufschlagFestZehntelcent ??
      lieferant?.aufschlagFestZehntelcent ??
      0,
  );
  const verkauf = zehntelcent(
    einkauf.zehntelcent + aufschlagProzentBetrag.zehntelcent + aufschlagFest.zehntelcent,
  );

  // Liefermengen-Regel: Anfrage > Lieferant > Standard (± 10 %, Staffelpreis bleibt)
  const toleranz =
    e.mengenregel?.toleranzProzent ??
    lieferant?.toleranzProzent ??
    STANDARD_MENGENREGEL.toleranzProzent;
  const abrechnung =
    e.mengenregel?.abrechnung ?? lieferant?.abrechnung ?? STANDARD_MENGENREGEL.abrechnung;
  const abweichung = geliefert - e.menge;
  const abweichungProzent = Math.round((abweichung / e.menge) * 1000) / 10;
  const innerhalb = Math.abs(abweichung) * 100 <= e.menge * toleranz;
  // Abweichung bewertet: Fortdruck je 1.000 (sonst Staffelpreis anteilig) + Prozent-Aufschlag
  const je1000Einkauf =
    staffel.fortdruckJe1000Zehntelcent ??
    rundeKaufmaennisch((staffelpreis.zehntelcent * 1000) / e.menge);
  const deltaEinkauf = rundeKaufmaennisch((je1000Einkauf * Math.abs(abweichung)) / 1000);
  const delta = zehntelcent(
    deltaEinkauf + rundeKaufmaennisch((deltaEinkauf * Math.round(prozent * 100)) / 10_000),
  );

  const hinweise: string[] = [];
  const name = einheitAnzeige(einheit);
  let abrechnungsbetrag = verkauf;
  let mehrmengeBetrag: Geld | null = null;
  if (abweichung !== 0) {
    const art = abweichung < 0 ? 'Minderlieferung' : 'Mehrlieferung';
    const pct = `${abweichung < 0 ? '−' : '+'}${anzahl(Math.abs(abweichungProzent))} %`;
    const regel =
      toleranz === 0
        ? 'genaue Menge vereinbart'
        : `${innerhalb ? 'innerhalb' : 'außerhalb'} ± ${anzahl(toleranz)} %`;
    const kopf = `${art} ${anzahl(geliefert)} statt ${anzahl(e.menge)} ${name} (${pct}, ${regel})`;
    const mehr = `Mehrmenge ${anzahl(abweichung)} = +${formatEuro(delta)}`;
    if (innerhalb && abrechnung === 'geliefert') {
      abrechnungsbetrag = zehntelcent(
        verkauf.zehntelcent + Math.sign(abweichung) * delta.zehntelcent,
      );
      hinweise.push(`${kopf}: nach gelieferter Menge ${formatEuro(abrechnungsbetrag)}`);
    } else if (innerhalb) {
      if (abweichung > 0) mehrmengeBetrag = delta;
      hinweise.push(
        abweichung > 0
          ? `${kopf}: Preis bleibt ${formatEuro(verkauf)}; ${mehr}, abrechenbar wenn der Kunde zustimmt`
          : `${kopf}: Preis bleibt ${formatEuro(verkauf)}`,
      );
    } else if (abweichung < 0) {
      abrechnungsbetrag = anteil(verkauf, geliefert, e.menge);
      hinweise.push(
        `${kopf}: nach Stückpreis ${formatEuro(abrechnungsbetrag)} – oder neuen Preis vereinbaren`,
      );
    } else {
      mehrmengeBetrag = delta;
      hinweise.push(
        `${kopf}: Preis bleibt ${formatEuro(verkauf)}; ${mehr} nur nach Absprache mit dem Kunden`,
      );
    }
  }

  const ergebnis: FremdErgebnis = {
    einheit,
    menge: e.menge,
    grundpreis,
    staffelpreis,
    einkauf,
    aufschlagProzent: prozent,
    aufschlagProzentBetrag,
    aufschlagFest,
    verkauf,
    jeStueck: anteil(verkauf, 1, e.menge),
    je100: anteil(verkauf, 100, e.menge),
    je1000: anteil(verkauf, 1000, e.menge),
    geliefert,
    weiterverarbeitet: weiter,
    toleranzProzent: toleranz,
    abrechnung,
    abweichungProzent,
    innerhalbToleranz: innerhalb,
    abrechnungsbetrag,
    mehrmengeBetrag,
    hinweise,
  };
  const lieferantName = lieferant?.name ?? fremd.lieferant;
  if (lieferantName !== undefined) ergebnis.lieferant = lieferantName;
  const lieferzeit = fremd.lieferzeitTage ?? lieferant?.lieferzeitTage;
  if (lieferzeit !== undefined) ergebnis.lieferzeitTage = lieferzeit;
  return { ok: true, wert: ergebnis };
}

/** Liefermengen-Regel als Text: „± 10 %, Staffelpreis bleibt“ / „genaue Menge“. */
export function mengenregelText(r: { toleranzProzent: number; abrechnung: Abrechnung }): string {
  if (r.toleranzProzent === 0) return 'genaue Menge';
  const abrechnung = r.abrechnung === 'staffel' ? 'Staffelpreis bleibt' : 'nach gelieferter Menge';
  return `± ${anzahl(r.toleranzProzent)} %, ${abrechnung}`;
}

/** Rechenweg als Zeilen (für Anzeige und Prüfung). */
export function fremdRechenweg(r: FremdErgebnis): string[] {
  const name = einheitAnzeige(r.einheit);
  const zeilen = [
    `Einkauf: Grundpreis ${formatEuro(r.grundpreis)} + Staffel ${anzahl(r.menge)} ${name} ` +
      `${formatEuro(r.staffelpreis)} = ${formatEuro(r.einkauf)}`,
    `Aufschlag: ${anzahl(r.aufschlagProzent)} % = ${formatEuro(r.aufschlagProzentBetrag)} + fest ` +
      `${formatEuro(r.aufschlagFest)}`,
    `Verkauf: ${formatEuro(r.verkauf)}`,
    `Je ${einheitAnzeige(r.einheit, 1)} ${formatEuro3(r.jeStueck)} · je 100 ${formatEuro(r.je100)} · je 1.000 ${formatEuro(r.je1000)}`,
    `Kosten (Voll- und Teilkosten): ${formatEuro(r.einkauf)} Einkauf`,
    `Liefermenge: ${mengenregelText(r)}`,
    `Geliefert ${anzahl(r.geliefert)} ${name}, davon weiterverarbeitet ${anzahl(r.weiterverarbeitet)}`,
  ];
  if (r.geliefert !== r.menge) zeilen.push(`Abzurechnen: ${formatEuro(r.abrechnungsbetrag)}`);
  if (r.lieferzeitTage !== undefined || r.lieferant !== undefined) {
    const teile: string[] = [];
    if (r.lieferant !== undefined) teile.push(`Lieferant ${r.lieferant}`);
    if (r.lieferzeitTage !== undefined) {
      teile.push(`Lieferzeit ${r.lieferzeitTage} ${r.lieferzeitTage === 1 ? 'Tag' : 'Tage'}`);
    }
    zeilen.push(teile.join(' · '));
  }
  return zeilen;
}
