import {
  GANZZAHLIGE_EINHEITEN,
  einheitAnzeige,
  formatDauer,
  formatEuro,
  kostenFuerDauer,
  ms,
  plusG,
  zehntelcent,
  type Einheit,
  type Geld,
} from '@druck/units';
import type { Leistungsaenderung } from './auspraegung-schema';
import { greifendeAuspraegungen, type Merkmale } from './auspraegungen';
import type { Grenzen, Produktion, Ruestbaustein, Variante } from './produktion-schema';
import { schrittLeistung } from './produktion-schema';
import type { Fehler, PruefErgebnis } from './pruefung';
import { stundensatzDesPlatzes } from './stundensatz';

const MS_JE_STUNDE = 3_600_000;

/** Eingabe der Probe-Rechnung (später: ein Arbeitsgang im Auftrag). */
export type ProbeEingabe = {
  platzId: string;
  schrittId: string;
  /** Gute Menge in der Einheit des Schritts (ohne Zuschuss). */
  menge: number;
  /** Bekannte Merkmale (Material, Format, Fächer, Einstellungen …) für Ausprägungen und Grenzen. */
  merkmale?: Merkmale;
  /** Name einer Variante (Leistungsprofil); ohne → Werte des Schritts. */
  profil?: string;
  /** Leistungsänderung des Werkzeugs (z. B. Stanzform). */
  werkzeug?: Leistungsaenderung;
  /** Leistungsänderung nur für diesen Arbeitsgang. */
  arbeitsgang?: Leistungsaenderung;
  /** Mengen in anderen Einheiten für Rüstbausteine (z. B. Stapel, Platte). */
  mengen?: Partial<Record<Einheit, number>>;
  /** Handwerte ersetzen am Ende den berechneten Wert. */
  handwerte?: {
    leistungJeStunde?: number;
    ruestenMs?: number;
    zuschuss?: number;
    /** Stundensatz von Hand (Vollkosten) in Zehntelcent je Stunde (T97). */
    stundensatzZehntelcent?: number;
  };
  /** T115: gewähltes Verbrauchsmaterial je Gruppe der Maschine (Gruppe → Material-ID). */
  verbrauchWahl?: Readonly<Record<string, string>>;
  /** Durchgänge je Einheit (z. B. 2 bei 4/4, wenn die Maschine je Durchgang eine Seite
   *  bedruckt); die Leistung gilt je Durchgang. Standard 1. */
  durchgaenge?: number;
  /** Zuschuss mehrfach, z. B. 2, wenn die Farben einen zusätzlichen Durchgang brauchen. */
  zuschussMal?: number;
  /** Weitere Rüstposten, z. B. „Sonderfarbe wechseln“ (Farbwerk). */
  ruestenDazu?: { name: string; anzahl: number; jeMs: number }[];
  /** Läuft im Durchlauf eines anderen Schritts mit: keine eigene Laufzeit, nur Rüsten. */
  ohneLauf?: string;
  /** Weitere Leistungsänderungen nach dem Arbeitsgang, z. B. „Heften läuft mit −10 %“. */
  weitere?: { quelle: string; a: Leistungsaenderung }[];
};

export type LeistungsStufe = { quelle: string; prozent: number; jeStunde: number };
export type RuestPosten = { name: string; anzahl: number; jeMs: number; ms: number };

export type ProbeErgebnis = {
  einheit: Einheit;
  menge: number;
  profil?: string;
  /** Die Variante hat keine eigene Leistung: es gilt die des Schritts. */
  leistungVomSchritt?: boolean;
  grundJeStunde: number;
  stufen: LeistungsStufe[];
  berechnetJeStunde: number;
  jeStunde: number;
  leistungVonHand: boolean;
  zuschussFest: number;
  zuschussProzent: number;
  zuschussBerechnet: number;
  /** Zuschuss mehrfach (nur gesetzt, wenn größer als 1). */
  zuschussMal?: number;
  zuschuss: number;
  zuschussVonHand: boolean;
  mengeGesamt: number;
  /** Durchgänge je Einheit (Standard 1). */
  durchgaenge: number;
  laufMs: number;
  /** Name des Schritts, mit dem dieser läuft (dann laufMs = 0). */
  ohneLauf?: string;
  ruesten: RuestPosten[];
  ruestenBerechnetMs: number;
  ruestenMs: number;
  ruestenVonHand: boolean;
  zeitMs: number;
  /** Zeit vor Mindestzeit und Takt (nur gesetzt, wenn sie sich unterscheidet). */
  zeitRohMs?: number;
  mindestzeitMs?: number;
  taktMs?: number;
  /** Personal: Anteil im Stundensatz und Besatzung beim Lauf (nur gesetzt, wenn angegeben). */
  personal?: { satz: Geld; besatzungLauf: number };
  stundensatzVoll: Geld | null;
  stundensatzTeil: Geld | null;
  /** true, wenn der Schritt nur mitläuft und keine eigene Leistung hat (T99). */
  ohneEigeneLeistung?: true;
  /** „Kostenstelle <Name>“, wenn der Satz von einer Kostenstelle kommt (sonst nicht gesetzt). */
  satzHerkunft?: string;
  /** true, wenn der Vollkosten-Satz von Hand kommt (T97; sonst nicht gesetzt). */
  satzVollVonHand?: true;
  zusatzkosten: Geld;
  kostenVoll: Geld | null;
  kostenTeil: Geld | null;
  nichtGeeignet: boolean;
  /** Gründe, warum der Platz für diese Eingabe nicht geeignet ist: Sonderfall „nicht geeignet“
   *  und Grenzen (Format, Grammatur, Dicke). Nur gesetzt, wenn es Gründe gibt (T84). */
  ungeeignet?: string[];
  hinweise: string[];
};

function fehlt(meldung: string, pfad = ''): PruefErgebnis<ProbeErgebnis> {
  return { ok: false, fehler: [{ pfad, meldung } satisfies Fehler] };
}

function mmText(um: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(um / 1000);
}

/** Hinweise, wenn Format, Grammatur oder Dicke außerhalb der Grenzen liegen (Format in beiden Lagen). */
export function grenzenHinweise(grenzen: Grenzen | undefined, m: Merkmale): string[] {
  const hinweise: string[] = [];
  if (!grenzen) return hinweise;
  const b = m.bogenbreiteUm;
  const h = m.bogenhoeheUm;
  if (b !== undefined && h !== undefined) {
    const max = grenzen.formatMax;
    if (
      max &&
      !((b <= max.breiteUm && h <= max.hoeheUm) || (b <= max.hoeheUm && h <= max.breiteUm))
    ) {
      hinweise.push(
        `Bogen größer als Höchstformat ${mmText(max.breiteUm)} × ${mmText(max.hoeheUm)} mm`,
      );
    }
    const min = grenzen.formatMin;
    if (
      min &&
      !((b >= min.breiteUm && h >= min.hoeheUm) || (b >= min.hoeheUm && h >= min.breiteUm))
    ) {
      hinweise.push(
        `Bogen kleiner als Mindestformat ${mmText(min.breiteUm)} × ${mmText(min.hoeheUm)} mm`,
      );
    }
  }
  if (m.grammatur !== undefined) {
    if (grenzen.grammaturMin !== undefined && m.grammatur < grenzen.grammaturMin) {
      hinweise.push(`Grammatur unter ${grenzen.grammaturMin} g/m²`);
    }
    if (grenzen.grammaturMax !== undefined && m.grammatur > grenzen.grammaturMax) {
      hinweise.push(`Grammatur über ${grenzen.grammaturMax} g/m²`);
    }
  }
  if (
    m.dickeUm !== undefined &&
    grenzen.dickeMaxUm !== undefined &&
    m.dickeUm > grenzen.dickeMaxUm
  ) {
    hinweise.push(`Material dicker als ${mmText(grenzen.dickeMaxUm)} mm`);
  }
  return hinweise;
}

/** Prozent in Hundertstel als ganze Zahl (0,5 % → 50), damit ohne Gleitkommafehler gerundet wird. */
function hundertstel(prozent: number): number {
  return Math.round(prozent * 100);
}

/**
 * Probe-Rechnung für einen Arbeitsschritt an einem Arbeitsplatz.
 * Leistung: Grund (Standard oder Profil) → Ausprägungen → Werkzeug → Arbeitsgang (Prozente
 * multipliziert) → Handwert ersetzt. Zuschuss: fest + Prozent (addiert aus Schritt, Ausprägungen,
 * Werkzeug, Arbeitsgang), bei ganzzahliger Einheit aufgerundet. Rüsten: Bausteine von Platz und
 * Schritt (je Auftrag einmal, je Schritt-Einheit × Gesamtmenge, sonst aus `mengen`; „alle“ je
 * angefangene n) + Rüsten aus Ausprägungen, Werkzeug, Arbeitsgang. Kosten = Zeit × Stundensatz
 * (Voll- und Teilkosten) + Zusatzkosten der Ausprägungen.
 */
export function rechneProbe(produktion: Produktion, e: ProbeEingabe): PruefErgebnis<ProbeErgebnis> {
  const platz = (produktion.arbeitsplaetze ?? []).find((p) => p.id === e.platzId);
  if (!platz) return fehlt(`Arbeitsplatz ${e.platzId} nicht gefunden`, 'platzId');
  const schritt = produktion.arbeitsschritte.find((s) => s.id === e.schrittId);
  const amPlatz = platz.schritte.find((s) => s.schrittId === e.schrittId);
  if (!schritt || !amPlatz) {
    return fehlt(`Schritt ${e.schrittId} ist an diesem Platz nicht möglich`, 'schrittId');
  }
  const ganz = (GANZZAHLIGE_EINHEITEN as readonly string[]).includes(schritt.einheit);
  if (!Number.isFinite(e.menge) || e.menge < 0 || (ganz && !Number.isInteger(e.menge))) {
    return fehlt(
      ganz ? 'Menge muss eine ganze Zahl ab 0 sein' : 'Menge muss eine Zahl ab 0 sein',
      'menge',
    );
  }
  let grund = schrittLeistung(platz, amPlatz);
  let variante: Variante | undefined;
  let leistungVomSchritt = false;
  if (e.profil !== undefined) {
    const name = e.profil.trim().toLowerCase();
    variante = amPlatz.profile?.find((p) => p.name.toLowerCase() === name);
    if (!variante) return fehlt(`Ausführung ${e.profil} nicht gefunden`, 'profil');
    if (variante.menge !== undefined && variante.dauerMs !== undefined) {
      grund = { menge: variante.menge, dauerMs: variante.dauerMs };
    } else {
      leistungVomSchritt = true;
    }
  }
  // „läuft mit“ ohne eigene Leistung (T99): rechnet nur im selben Durchlauf (ohneLauf)
  const mitName = (id: string) => produktion.arbeitsschritte.find((s) => s.id === id)?.name ?? id;
  if (!grund && amPlatz.laeuftMit !== undefined) {
    if (e.ohneLauf === undefined) {
      return fehlt(
        `${schritt.name} läuft nur mit ${mitName(amPlatz.laeuftMit.schrittId)} an derselben Maschine – diese Zeile fehlt`,
        'leistung',
      );
    }
    grund = { menge: 0, dauerMs: 1 };
  }
  if (!grund) return fehlt('Leistung fehlt – rechnet nicht', 'leistung');
  const ohneEigeneLeistung = grund.menge === 0;

  const merkmale = e.merkmale ?? {};
  const greifend = greifendeAuspraegungen(platz, schritt.id, merkmale);
  const aenderungen: { quelle: string; a: Leistungsaenderung }[] = [
    ...greifend.map((a) => ({ quelle: a.name, a: a.wirkung })),
    ...(e.werkzeug ? [{ quelle: 'Werkzeug', a: e.werkzeug }] : []),
    ...(e.arbeitsgang ? [{ quelle: 'Arbeitsgang', a: e.arbeitsgang }] : []),
    ...(e.weitere ?? []),
  ];

  // Leistung
  const grundJeStunde = (grund.menge * MS_JE_STUNDE) / grund.dauerMs;
  let jeStundeBerechnet = grundJeStunde;
  const stufen: LeistungsStufe[] = [];
  for (const { quelle, a } of aenderungen) {
    if (a.leistungProzent === undefined || a.leistungProzent === 0) continue;
    jeStundeBerechnet = (jeStundeBerechnet * (100 + a.leistungProzent)) / 100;
    stufen.push({ quelle, prozent: a.leistungProzent, jeStunde: jeStundeBerechnet });
  }
  const handLeistung = e.handwerte?.leistungJeStunde;
  if (handLeistung !== undefined && !(handLeistung > 0)) {
    return fehlt('Leistung von Hand muss größer als 0 sein', 'handwerte.leistungJeStunde');
  }
  const jeStunde = handLeistung ?? jeStundeBerechnet;

  // Zuschuss
  // Eine Variante mit eigenem Zuschuss ersetzt den des Schritts
  const zuschussGrund = variante?.zuschuss ?? amPlatz.zuschuss;
  let zuschussFest = zuschussGrund?.fest ?? 0;
  let zuschussHundertstel = hundertstel(zuschussGrund?.prozent ?? 0);
  for (const { a } of aenderungen) {
    zuschussFest += a.zuschussFest ?? 0;
    zuschussHundertstel += hundertstel(a.zuschussProzent ?? 0);
  }
  const prozentTeil = ganz
    ? Math.ceil((e.menge * zuschussHundertstel) / 10_000)
    : (e.menge * zuschussHundertstel) / 10_000;
  const zuschussMal = e.zuschussMal ?? 1;
  const zuschussBerechnet = (zuschussFest + prozentTeil) * zuschussMal;
  const zuschuss = e.handwerte?.zuschuss ?? zuschussBerechnet;
  const mengeGesamt = e.menge + zuschuss;

  const hinweise: string[] = [];

  // Rüsten
  const ruesten: RuestPosten[] = [];
  // Eine Variante mit eigener Rüstzeit ersetzt die Rüstbausteine des Schritts (die des Platzes
  // bleiben)
  const schrittRuesten: Ruestbaustein[] =
    variante?.ruestenMs !== undefined
      ? [{ name: `Rüsten ${variante.name}`, dauerMs: variante.ruestenMs, je: 'Auftrag' }]
      : (amPlatz.ruesten ?? []);
  for (const baustein of [...(platz.ruesten ?? []), ...schrittRuesten]) {
    let roh: number | undefined;
    if (baustein.je === 'Auftrag') roh = 1;
    else if (baustein.je === schritt.einheit) roh = mengeGesamt;
    else roh = e.mengen?.[baustein.je];
    if (roh === undefined) {
      hinweise.push(`Rüsten „${baustein.name}“: Menge in ${einheitAnzeige(baustein.je)} fehlt`);
      roh = 0;
    }
    const anzahl = baustein.alle !== undefined ? Math.ceil(roh / baustein.alle) : Math.ceil(roh);
    ruesten.push({
      name: baustein.name,
      anzahl,
      jeMs: baustein.dauerMs,
      ms: anzahl * baustein.dauerMs,
    });
  }
  for (const { quelle, a } of aenderungen) {
    if (a.ruestenMs !== undefined && a.ruestenMs > 0) {
      ruesten.push({ name: quelle, anzahl: 1, jeMs: a.ruestenMs, ms: a.ruestenMs });
    }
  }
  for (const p of e.ruestenDazu ?? []) {
    ruesten.push({ name: p.name, anzahl: p.anzahl, jeMs: p.jeMs, ms: p.anzahl * p.jeMs });
  }
  const ruestenBerechnetMs = ruesten.reduce((summe, p) => summe + p.ms, 0);
  const ruestenMs = e.handwerte?.ruestenMs ?? ruestenBerechnetMs;

  // Zeit
  const durchgaenge = e.durchgaenge ?? 1;
  const laufMs =
    e.ohneLauf !== undefined
      ? 0
      : Math.round((mengeGesamt * durchgaenge * MS_JE_STUNDE) / jeStunde);
  // Mindestzeit, dann je angefangenen Takt; die zusätzliche Zeit zählt wie Rüsten (mit Personal)
  const zeitRohMs = laufMs + ruestenMs;
  let zeitMs = Math.max(zeitRohMs, platz.mindestzeitMs ?? 0);
  if (platz.taktMs !== undefined && zeitMs > 0) {
    zeitMs = Math.ceil(zeitMs / platz.taktMs) * platz.taktMs;
  }

  // Kosten
  let zusatz = 0;
  for (const a of greifend) zusatz += a.wirkung.kostenZehntelcent ?? 0;
  const zusatzkosten = zehntelcent(zusatz);
  const stundensatz = stundensatzDesPlatzes(produktion, platz);
  // Stundensatz von Hand ersetzt den Vollkosten-Satz des Platzes (T97); Teilkosten bleiben
  const satzVonHand = e.handwerte?.stundensatzZehntelcent;
  const satzVoll =
    satzVonHand !== undefined
      ? zehntelcent(satzVonHand)
      : stundensatz.stundensatzVollZehntelcent === undefined
        ? null
        : zehntelcent(stundensatz.stundensatzVollZehntelcent);
  const satzTeil =
    stundensatz.stundensatzTeilZehntelcent === undefined
      ? null
      : zehntelcent(stundensatz.stundensatzTeilZehntelcent);
  // Personal: beim Lauf nur die Besatzung (z. B. 0 = ohne Bediener); Rüsten mit vollem Personal
  const personal =
    stundensatz.personalZehntelcent !== undefined
      ? {
          satz: zehntelcent(stundensatz.personalZehntelcent),
          besatzungLauf: platz.besatzungLauf ?? 1,
        }
      : undefined;
  const kostenMit = (satz: Geld): Geld => {
    if (!personal || personal.besatzungLauf === 1) return kostenFuerDauer(satz, ms(zeitMs));
    const ohne = Math.max(0, personal.satz.zehntelcent * (1 - personal.besatzungLauf));
    const laufSatz = zehntelcent(Math.max(0, satz.zehntelcent - ohne));
    return plusG(kostenFuerDauer(satz, ms(zeitMs - laufMs)), kostenFuerDauer(laufSatz, ms(laufMs)));
  };
  const kostenVoll = satzVoll ? plusG(kostenMit(satzVoll), zusatzkosten) : null;
  const kostenTeil = satzTeil ? plusG(kostenMit(satzTeil), zusatzkosten) : null;
  if (!satzVoll) hinweise.push('Stundensatz fehlt – keine Kosten');
  else if (!satzTeil) hinweise.push('Teilkosten nicht hinterlegt');
  if (stundensatz.vorlaeufig && satzVonHand === undefined) hinweise.push('Stundensatz vorläufig');

  // Eignung und Grenzen
  let nichtGeeignet = false;
  const ungeeignet: string[] = [];
  for (const a of greifend) {
    if (a.wirkung.nichtGeeignet === true) {
      nichtGeeignet = true;
      hinweise.push(`Nicht geeignet: ${a.wirkung.hinweis ?? a.name}`);
      ungeeignet.push(a.wirkung.hinweis ?? a.name);
    } else if (a.wirkung.hinweis !== undefined) {
      hinweise.push(a.wirkung.hinweis);
    }
  }
  for (const h of [
    ...grenzenHinweise(platz.grenzen, merkmale),
    ...grenzenHinweise(amPlatz.grenzen, merkmale),
  ]) {
    if (!hinweise.includes(h)) hinweise.push(h);
    if (!ungeeignet.includes(h)) ungeeignet.push(h);
  }

  const ergebnis: ProbeErgebnis = {
    einheit: schritt.einheit,
    menge: e.menge,
    grundJeStunde,
    stufen,
    berechnetJeStunde: jeStundeBerechnet,
    jeStunde,
    leistungVonHand: handLeistung !== undefined,
    zuschussFest,
    zuschussProzent: zuschussHundertstel / 100,
    zuschussBerechnet,
    zuschuss,
    zuschussVonHand: e.handwerte?.zuschuss !== undefined,
    mengeGesamt,
    durchgaenge,
    laufMs,
    ruesten,
    ruestenBerechnetMs,
    ruestenMs,
    ruestenVonHand: e.handwerte?.ruestenMs !== undefined,
    zeitMs,
    stundensatzVoll: satzVoll,
    stundensatzTeil: satzTeil,
    zusatzkosten,
    kostenVoll,
    kostenTeil,
    nichtGeeignet,
    hinweise,
  };
  if (variante !== undefined) ergebnis.profil = variante.name;
  if (e.ohneLauf !== undefined) ergebnis.ohneLauf = e.ohneLauf;
  if (zeitRohMs !== zeitMs) ergebnis.zeitRohMs = zeitRohMs;
  if (platz.mindestzeitMs !== undefined) ergebnis.mindestzeitMs = platz.mindestzeitMs;
  if (platz.taktMs !== undefined) ergebnis.taktMs = platz.taktMs;
  if (personal) ergebnis.personal = personal;
  if (stundensatz.herkunft.art === 'kostenstelle') {
    ergebnis.satzHerkunft = `Kostenstelle ${stundensatz.herkunft.name}`;
  }
  if (satzVonHand !== undefined) ergebnis.satzVollVonHand = true;
  if (leistungVomSchritt) ergebnis.leistungVomSchritt = true;
  if (ohneEigeneLeistung) ergebnis.ohneEigeneLeistung = true;
  if (zuschussMal > 1) ergebnis.zuschussMal = zuschussMal;
  if (ungeeignet.length > 0) ergebnis.ungeeignet = ungeeignet;
  return { ok: true, wert: ergebnis };
}

function zahl(wert: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(wert);
}

function prozentText(p: number): string {
  return `${p > 0 ? '+' : '−'}${zahl(Math.abs(p))} %`;
}

/** Rechenweg als Textzeilen für die Anzeige (deutsch). */
export function rechenweg(r: ProbeErgebnis): string[] {
  const einheit = einheitAnzeige(r.einheit);
  const titel =
    r.profil === undefined
      ? 'Leistung'
      : r.leistungVomSchritt === true
        ? `Leistung (${r.profil}, vom Schritt)`
        : `Leistung (${r.profil})`;
  let leistung =
    r.ohneEigeneLeistung === true
      ? `${titel}: keine eigene (läuft mit ${r.ohneLauf ?? '–'})`
      : `${titel}: ${zahl(r.grundJeStunde)} ${einheit}/h`;
  for (const s of r.stufen) leistung += ` → ${s.quelle} ${prozentText(s.prozent)}`;
  if (r.stufen.length > 0) leistung += ` = ${zahl(r.berechnetJeStunde)} ${einheit}/h`;
  if (r.leistungVonHand) leistung += ` → von Hand ${zahl(r.jeStunde)} ${einheit}/h`;

  const zuschuss = r.zuschussVonHand
    ? `Zuschuss: von Hand ${zahl(r.zuschuss)} → ${zahl(r.mengeGesamt)} ${einheit}`
    : r.zuschussMal !== undefined
      ? `Zuschuss: ${zahl(r.zuschussFest)} fest + ${zahl(r.zuschussProzent)} % = ${zahl(r.zuschussBerechnet / r.zuschussMal)} × ${zahl(r.zuschussMal)} (${zahl(r.zuschussMal - 1)} ${r.zuschussMal === 2 ? 'Durchgang' : 'Durchgänge'} mehr für Farben) = ${zahl(r.zuschuss)} → ${zahl(r.mengeGesamt)} ${einheit}`
      : `Zuschuss: ${zahl(r.zuschussFest)} fest + ${zahl(r.zuschussProzent)} % = ${zahl(r.zuschuss)} → ${zahl(r.mengeGesamt)} ${einheit}`;

  const durch = r.durchgaenge === 1 ? '' : ` × ${zahl(r.durchgaenge)} Durchgänge`;
  const lauf =
    r.ohneLauf !== undefined
      ? `Lauf: läuft mit ${r.ohneLauf} – keine eigene Laufzeit`
      : `Lauf: ${zahl(r.mengeGesamt)} ${einheit}${durch} ÷ ${zahl(r.jeStunde)}/h = ${formatDauer(ms(r.laufMs), 'min')}`;

  const posten = r.ruesten
    .filter((p) => p.anzahl > 0)
    .map((p) =>
      p.anzahl === 1
        ? `${p.name} ${formatDauer(ms(p.jeMs), 'min')}`
        : `${p.name} ${zahl(p.anzahl)} × ${formatDauer(ms(p.jeMs), 'min')}`,
    );
  let ruesten = `Rüsten: ${posten.length > 0 ? posten.join(' + ') : 'keins'} = ${formatDauer(ms(r.ruestenBerechnetMs), 'min')}`;
  if (r.ruestenVonHand) ruesten += ` → von Hand ${formatDauer(ms(r.ruestenMs), 'min')}`;

  let zeit = `Zeit: ${formatDauer(ms(r.zeitMs), 'min')} = ${formatDauer(ms(r.zeitMs), 'h')}`;
  if (r.zeitRohMs !== undefined) {
    const regel = [
      r.mindestzeitMs !== undefined && r.mindestzeitMs > r.zeitRohMs
        ? `mindestens ${formatDauer(ms(r.mindestzeitMs), 'min')}`
        : null,
      r.taktMs !== undefined ? `je angefangene ${formatDauer(ms(r.taktMs), 'min')}` : null,
    ]
      .filter((t): t is string => t !== null)
      .join(', ');
    zeit = `Zeit: ${formatDauer(ms(r.zeitRohMs), 'min')} → ${regel} = ${formatDauer(ms(r.zeitMs), 'min')} = ${formatDauer(ms(r.zeitMs), 'h')}`;
  }

  const kosten = (art: string, satz: Geld | null, betrag: Geld | null, vonHand = false): string => {
    if (!satz || !betrag) return `${art}: nicht hinterlegt`;
    const zusatz = r.zusatzkosten.zehntelcent > 0 ? ` + ${formatEuro(r.zusatzkosten)} Zusatz` : '';
    const herkunft = vonHand
      ? ' (von Hand)'
      : r.satzHerkunft === undefined
        ? ''
        : ` (${r.satzHerkunft})`;
    const p = r.personal;
    if (p && p.besatzungLauf !== 1) {
      const ohne = Math.max(0, p.satz.zehntelcent * (1 - p.besatzungLauf));
      const laufSatz = zehntelcent(Math.max(0, satz.zehntelcent - ohne));
      return (
        `${art}: Rüsten ${formatDauer(ms(r.zeitMs - r.laufMs), 'h')} × ${formatEuro(satz)}/h + ` +
        `Lauf ${formatDauer(ms(r.laufMs), 'h')} × ${formatEuro(laufSatz)}/h ` +
        `(Besatzung ${zahl(p.besatzungLauf)})${herkunft}${zusatz} = ${formatEuro(betrag)}`
      );
    }
    return `${art}: ${formatDauer(ms(r.zeitMs), 'h')} × ${formatEuro(satz)}/h${herkunft}${zusatz} = ${formatEuro(betrag)}`;
  };

  return [
    leistung,
    zuschuss,
    lauf,
    ruesten,
    zeit,
    kosten('Vollkosten', r.stundensatzVoll, r.kostenVoll, r.satzVollVonHand === true),
    kosten('Teilkosten', r.stundensatzTeil, r.kostenTeil),
  ];
}
