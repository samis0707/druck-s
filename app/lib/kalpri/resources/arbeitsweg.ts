import type { Artikel, ArtikelMerkmal, ArtikelTeil } from './artikel-schema';
import type { Arbeitsschritt, ImWeg, Produktion, SeitenRegel, WegMenge } from './produktion-schema';
import { schrittLeistung } from './produktion-schema';

/** Arbeitsplatz, der einen Schritt kann; rechnet = am Platz ist eine Leistung hinterlegt. */
export type FaehigerPlatz = { id: string; name: string; rechnet: boolean };

/** Ein Schritt im Arbeitsweg eines Artikels. */
export type WegSchritt = {
  /** Teil, für das der Schritt gilt; null = ganzes Produkt (nach dem Zusammenführen). */
  teilId: string | null;
  schrittId: string;
  name: string;
  /** Warum der Schritt dabei ist, z. B. „bedruckt“, „Ecken: gerundet R5“. */
  grund: string;
  /** null: steht fest; sonst die Bedingung, z. B. „nur wenn Ecken: gerundet“. */
  bedingung: string | null;
  menge: WegMenge;
  /** Anzahl aus dem Merkmal (bei menge.jeAnzahl), sonst null. */
  anzahl: number | null;
  /** T115: fester Wert des Merkmals (z. B. „matt“), sonst null – wählt Verbrauchsmaterial. */
  wert?: string | null;
  plaetze: FaehigerPlatz[];
  hinweise: string[];
};

export type WegMeldung = { teilId: string | null; schrittId: string; text: string };

export type Arbeitsweg = { schritte: WegSchritt[]; meldungen: WegMeldung[] };

/** Plätze, an denen der Schritt hängt (ohne Fremdarbeit-Plätze zuerst, dann Fremdarbeit). */
export function plaetzeFuerSchritt(p: Produktion, schrittId: string): FaehigerPlatz[] {
  const mit = (p.arbeitsplaetze ?? []).filter(
    (x) => x.inaktiv !== true && x.schritte.some((s) => s.schrittId === schrittId),
  );
  const sortiert = [
    ...mit.filter((x) => x.fremdarbeit === undefined),
    ...mit.filter((x) => x.fremdarbeit !== undefined),
  ];
  return sortiert.map((x) => ({
    id: x.id,
    name: x.name,
    rechnet:
      x.fremdarbeit !== undefined ||
      x.schritte.some(
        (s) =>
          s.schrittId === schrittId &&
          (schrittLeistung(x, s) !== undefined || s.laeuftMit !== undefined),
      ),
  }));
}

/** Einheiten, in denen eine Tätigkeit keine Weiterverarbeitung am Produkt ist (Zeit, Auftrag). */
const OHNE_WEITERVERARBEITUNG: readonly string[] = ['Stunde', 'Auftrag', 'Einsatz'];

/**
 * T133: Tätigkeit, wie sie im Arbeitsweg zählt. Ohne Angabe „im Weg“ kommt sie, wenn ein Merkmal
 * so heißt wie sie selbst (z. B. Merkmal „Stanzen“) – so ist jede Tätigkeit als
 * Weiterverarbeitung wählbar. Menge dann nach der Einheit: Bogen → Druckbogen; Exemplar, Satz,
 * Paket, Bündel → je Produkt; sonst Nutzen.
 */
export function schrittImWeg(s: Arbeitsschritt): Arbeitsschritt {
  if (s.imWeg !== undefined) return s;
  // T141: Zeit, Einsatz und „je Auftrag“ hängen nicht an der Auflage – kein Merkmal daraus
  // (sonst: „Druckdaten bearbeiten“ als Merkmal = 1.000 Stunden bei 1.000 Stück)
  if (OHNE_WEITERVERARBEITUNG.includes(s.einheit)) return s;
  const menge: WegMenge =
    s.menge ??
    (s.einheit === 'Bogen'
      ? { wert: 'druckbogen' }
      : ['Exemplar', 'Satz', 'Paket', 'Buendel'].includes(s.einheit)
        ? { wert: 'produkt' }
        : { wert: 'nutzen' });
  return { ...s, imWeg: { art: 'merkmal', name: s.name }, menge };
}

export type Weiterverarbeitung = {
  /** Anzeige, z. B. „Bohren: 4-fach“ oder „Stanzen“. */
  text: string;
  /** Merkmal, das die Tätigkeit zieht. */
  merkmal: { name: string; wert: string };
  /** am Teil (Bogen, Nutzen) oder am ganzen Produkt (je Exemplar, z. B. Heften). */
  ebene: 'teil' | 'produkt';
};

/**
 * T133: Weiterverarbeitungen zur Auswahl aus dem Katalog – je Merkmal-Wert ein Eintrag
 * („Bohren: 2-fach“, „Bohren: 4-fach“), Tätigkeiten ohne Werte unter ihrem Namen (Wert „ja“).
 * Nur Tätigkeiten, die eine Maschine kann; ohne Druck, Schneiden, „je Auftrag“ und Zeit.
 */
export function weiterverarbeitungen(p: Produktion): Weiterverarbeitung[] {
  const aus: Weiterverarbeitung[] = [];
  const mitWerten = new Set(
    p.arbeitsschritte.flatMap((s) =>
      s.imWeg?.art === 'merkmal' && (s.imWeg.werte ?? []).length > 0
        ? [s.imWeg.name.toLowerCase()]
        : [],
    ),
  );
  for (const roh of p.arbeitsschritte) {
    if (OHNE_WEITERVERARBEITUNG.includes(roh.einheit)) continue;
    const s = schrittImWeg(roh);
    const w = s.imWeg;
    if (w?.art !== 'merkmal') continue;
    if (plaetzeFuerSchritt(p, s.id).length === 0) continue;
    const ebene = mengeImWeg(s).wert === 'produkt' ? 'produkt' : 'teil';
    const werte = w.werte ?? [];
    // Schritt ohne Werte an einem Merkmal, das andere mit Werten haben (z. B. „Stanze aufbauen“
    // bei Register): kommt mit jedem Wert, braucht keinen eigenen Eintrag
    if (werte.length === 0 && mitWerten.has(w.name.toLowerCase())) continue;
    const eintraege =
      werte.length === 0
        ? [{ text: s.name, merkmal: { name: w.name, wert: 'ja' }, ebene }]
        : werte.map((x) => ({
            text: `${w.name}: ${x}`,
            merkmal: { name: w.name, wert: x },
            ebene,
          }));
    for (const e of eintraege) {
      if (!aus.some((x) => x.text.toLowerCase() === e.text.toLowerCase()))
        aus.push(e as Weiterverarbeitung);
    }
  }
  return aus;
}

/** Menge im Arbeitsweg: angegeben, sonst Druck → Druckbogen, Schnitt → Schnitte Endschnitt,
 *  Merkmal → Nutzen. */
export function mengeImWeg(s: Pick<Arbeitsschritt, 'imWeg' | 'menge'>): WegMenge {
  if (s.menge) return s.menge;
  if (s.imWeg?.art === 'druck') return { wert: 'druckbogen' };
  if (s.imWeg?.art === 'schnitt') return { wert: 'endschnitt' };
  return { wert: 'nutzen' };
}

const MENGE_TEXT: Record<WegMenge['wert'], string> = {
  druckbogen: 'Druckbogen',
  nutzen: 'Nutzen',
  stapel: 'Stapel',
  endschnitt: 'Schnitte Endschnitt',
  produkt: 'Exemplare',
  blaetter: 'Blätter je Produkt (einmal je Auftrag)',
};

const zahl = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n);

/** „Stapel × 4 × Anzahl“, „Exemplare ÷ 250“, „Schnitte Endschnitt (aufeinander)“. */
export function wegMengeText(m: WegMenge): string {
  let t = MENGE_TEXT[m.wert];
  if (m.gestapelt) t += ' (aufeinander)';
  if (m.faktor !== undefined && m.faktor !== 1) t += ` × ${zahl(m.faktor)}`;
  if (m.jeAnzahl) t += ' × Anzahl aus dem Merkmal';
  if (m.teiler !== undefined && m.teiler !== 1) t += ` ÷ ${zahl(m.teiler)}`;
  return t;
}

/** „bei jedem bedruckten Teil“, „wenn Ecken: gerundet“, „nur von Hand“. */
export function imWegText(w: ImWeg | undefined): string {
  if (w === undefined) return 'nur von Hand';
  if (w.art === 'druck') return 'bei jedem bedruckten Teil';
  if (w.art === 'schnitt') return 'Schneiden nach dem Druck';
  if (w.art === 'auftrag') return 'einmal je Auftrag';
  return `wenn ${w.name}${w.werte && w.werte.length > 0 ? `: ${w.werte.join(' oder ')}` : ''}`;
}

/** „Vielfaches von 4 · 8–64 Seiten · Umschlag 4 oder 6“. */
export function seitenRegelText(r: SeitenRegel): string {
  const teile: string[] = [];
  if (r.vielfaches !== undefined) teile.push(`Seiten durch ${r.vielfaches} teilbar`);
  if (r.min !== undefined && r.max !== undefined) teile.push(`${r.min}–${r.max} Seiten`);
  else if (r.min !== undefined) teile.push(`mindestens ${r.min} Seiten`);
  else if (r.max !== undefined) teile.push(`höchstens ${r.max} Seiten`);
  if (r.umschlag) teile.push(`Umschlag ${r.umschlag.join(' oder ')} Seiten`);
  return teile.join(' · ');
}

/** Erste Zahl im Text: „4-fach, Ø 6 mm“ → 4, „2 Rillen“ → 2, „1,5 mm“ → 1,5; keine → null. */
export function anzahlAusText(text: string): number | null {
  const t = /(\d+(?:,\d+)?)/.exec(text);
  return t?.[1] === undefined ? null : Number(t[1].replace(',', '.'));
}

type Ja = { art: 'ja' } | { art: 'nein' } | { art: 'bedingt'; text: string };
const JA: Ja = { art: 'ja' };
const NEIN: Ja = { art: 'nein' };

function und(a: Ja, b: Ja): Ja {
  if (a.art === 'nein' || b.art === 'nein') return NEIN;
  if (a.art === 'ja') return b;
  if (b.art === 'ja') return a;
  return { art: 'bedingt', text: `${a.text} und ${b.text}` };
}

/** Werte einer Eigenschaft: fest → [wert], wählbar → werte, offen → null (noch nichts bekannt). */
function werteVon<T>(
  e: { zustand: 'fest'; wert: T } | { zustand: 'waehlbar'; werte: T[] } | { zustand: 'offen' },
): T[] | null {
  if (e.zustand === 'fest') return [e.wert];
  if (e.zustand === 'waehlbar') return e.werte;
  return null;
}

/** Bedingung aus einer Eigenschaft: alle Werte passen → ja, keiner → nein, manche/offen → bedingt. */
function nach<T>(e: Parameters<typeof werteVon<T>>[0], passt: (w: T) => boolean, text: string): Ja {
  const w = werteVon(e);
  if (w === null) return { art: 'bedingt', text };
  const n = w.filter(passt).length;
  if (n === 0) return NEIN;
  if (n === w.length) return JA;
  return { art: 'bedingt', text };
}

/** T125: Lieferant liefert Bogen (Lieferform), Verarbeitung im Haus – gilt als bedruckt geliefert. */
const geliefert = (t: ArtikelTeil) =>
  t.lieferform !== undefined && t.wer.zustand === 'fest' && t.wer.wert === 'lieferant';
const bedruckt = (t: ArtikelTeil) =>
  geliefert(t) ? JA : nach(t.druck, (d) => d !== 'ohne', 'wenn bedruckt');
const imHaus = (t: ArtikelTeil) =>
  geliefert(t) ? JA : nach(t.wer, (w) => w === 'haus', 'wenn im Haus');
const ausPapier = (t: ArtikelTeil) =>
  nach(t.woraus, (q) => q.art === 'sorte' || q.art === 'material', 'wenn aus Papier aus dem Lager');

function passtWert(w: ImWeg & { art: 'merkmal' }, wert: string): boolean {
  if (!w.werte || w.werte.length === 0) return true;
  const v = wert.trim().toLowerCase();
  return w.werte.some((x) => v.startsWith(x.trim().toLowerCase()));
}

/** Passt ein Merkmal zum Schritt? Liefert die Bedingung und die Anzahl (fester Wert). */
function merkmalPasst(
  w: ImWeg & { art: 'merkmal' },
  merkmale: readonly ArtikelMerkmal[] | undefined,
): { ja: Ja; grund: string; wert: string | null } | null {
  const m = (merkmale ?? []).find(
    (x) => x.name.trim().toLowerCase() === w.name.trim().toLowerCase(),
  );
  if (!m) return null;
  const werte = werteVon(m.wert);
  const bedingung = `nur wenn ${m.name}${w.werte && w.werte.length > 0 ? `: ${w.werte.join(' oder ')}` : ''}`;
  if (werte === null)
    return { ja: { art: 'bedingt', text: bedingung }, grund: `${m.name}: offen`, wert: null };
  const passend = werte.filter((x) => passtWert(w, x));
  if (passend.length === 0) return { ja: NEIN, grund: '', wert: null };
  const ja: Ja = passend.length === werte.length ? JA : { art: 'bedingt', text: bedingung };
  return {
    ja,
    grund: `${m.name}: ${passend.join(' · ')}`,
    wert: m.wert.zustand === 'fest' ? m.wert.wert : null,
  };
}

/** Reihenfolge im Teil: Druck, Schritte auf Druckbogen, Schneiden, Schritte auf Nutzen/Stapel. */
function rang(s: Arbeitsschritt): number {
  if (s.imWeg?.art === 'druck') return 0;
  const m = mengeImWeg(s).wert;
  if (m === 'druckbogen') return 1;
  if (s.imWeg?.art === 'schnitt' || m === 'endschnitt') return 2;
  return 3;
}

function seitenWerte(
  t: ArtikelTeil,
): { werte: number[]; bereich?: { von: number; bis: number; schritt: number } } | null {
  const s = t.seiten;
  if (!s || s.zustand === 'offen') return null;
  if (s.zustand === 'fest') return { werte: [s.wert] };
  const b = s.bereich;
  return {
    werte: s.werte ?? [],
    ...(b ? { bereich: { von: b.von, bis: b.bis, schritt: b.schritt ?? 1 } } : {}),
  };
}

/** Prüft die Seiten eines Teils gegen die Regel; Meldungen mit Vorschlag. */
export function seitenPruefen(
  regel: SeitenRegel,
  teil: Pick<ArtikelTeil, 'name' | 'seiten' | 'liegtUm'>,
  schrittName: string,
): string[] {
  const s = seitenWerte(teil as ArtikelTeil);
  if (s === null) return [];
  const umschlag = teil.liegtUm !== undefined && regel.umschlag !== undefined;
  const erlaubt = (n: number): boolean => {
    if (umschlag) return (regel.umschlag ?? []).includes(n);
    if (regel.vielfaches !== undefined && n % regel.vielfaches !== 0) return false;
    if (regel.min !== undefined && n < regel.min) return false;
    if (regel.max !== undefined && n > regel.max) return false;
    return true;
  };
  const vorschlag = (n: number): string => {
    if (umschlag) return `erlaubt: ${(regel.umschlag ?? []).join(' oder ')}`;
    const v = regel.vielfaches ?? 1;
    const unten = Math.max(v, Math.floor(n / v) * v, regel.min ?? 0);
    const oben = Math.min(Math.ceil(n / v) * v, regel.max ?? Number.MAX_SAFE_INTEGER);
    const k = [...new Set([unten, oben])].filter((x) => erlaubt(x) && x !== n);
    return k.length === 0
      ? `Regel: ${seitenRegelText(inhaltRegel)}`
      : `nächste mögliche: ${k.join(' oder ')}`;
  };
  const meldungen: string[] = [];
  const inhaltRegel: SeitenRegel = {
    ...(regel.vielfaches === undefined ? {} : { vielfaches: regel.vielfaches }),
    ...(regel.min === undefined ? {} : { min: regel.min }),
    ...(regel.max === undefined ? {} : { max: regel.max }),
  };
  const regelText = umschlag
    ? `Umschlag ${(regel.umschlag ?? []).join(' oder ')} Seiten`
    : seitenRegelText(inhaltRegel);
  for (const n of s.werte) {
    if (!erlaubt(n)) {
      meldungen.push(
        `${teil.name}: ${n} Seiten passen nicht zu ${schrittName} (${regelText}) – ${vorschlag(n)}`,
      );
    }
  }
  if (s.bereich) {
    const falsch: number[] = [];
    for (let n = s.bereich.von; n <= s.bereich.bis && falsch.length < 3; n += s.bereich.schritt) {
      if (!erlaubt(n)) falsch.push(n);
    }
    if (falsch.length > 0) {
      meldungen.push(
        `${teil.name}: Bereich ${s.bereich.von}–${s.bereich.bis} enthält Seitenzahlen, die nicht zu ${schrittName} passen (${regelText}), z. B. ${falsch.join(', ')}`,
      );
    }
  }
  return meldungen;
}

/**
 * Arbeitsweg eines Artikels aus dem Katalog: je Teil (im Haus) Druck bei bedruckten Teilen,
 * Schneiden bei Teilen aus Papier, Schritte zu Merkmalen des Teils; Merkmale des ganzen Produkts
 * geben Schritte je Exemplar (am Ende) bzw. bei Teil-Mengen je bedrucktem Teil. Wählbare und
 * offene Werte machen einen Schritt bedingt. Regeln der Schritte prüfen die Seiten der Teile.
 * Mehrere Schritte mit demselben Auslöser (z. B. zwei Druckverfahren) stehen alle da – die
 * Kalkulation wählt.
 */
export function arbeitsweg(a: Artikel, p: Produktion): Arbeitsweg {
  const katalog = p.arbeitsschritte.map(schrittImWeg);
  const schritte: WegSchritt[] = [];
  const meldungen: WegMeldung[] = [];

  const neu = (
    s: Arbeitsschritt,
    teilId: string | null,
    ja: Ja,
    grund: string,
    wert: string | null,
  ): void => {
    if (ja.art === 'nein') return;
    const menge = mengeImWeg(s);
    const hinweise: string[] = [];
    let anzahl: number | null = null;
    if (menge.jeAnzahl) {
      anzahl = wert === null ? null : anzahlAusText(wert);
      if (anzahl === null) {
        hinweise.push(
          wert === null
            ? 'Anzahl folgt aus dem gewählten Merkmal'
            : 'Anzahl fehlt im Merkmal – gerechnet mit 1',
        );
      }
    }
    const plaetze = plaetzeFuerSchritt(p, s.id);
    if (plaetze.length === 0) hinweise.push(`Keine Maschine kann „${s.name}“`);
    else if (!plaetze.some((x) => x.rechnet))
      hinweise.push('An keiner Maschine ist eine Leistung hinterlegt');
    schritte.push({
      teilId,
      schrittId: s.id,
      name: s.name,
      grund,
      bedingung: ja.art === 'bedingt' ? ja.text : null,
      menge,
      anzahl,
      wert,
      plaetze,
      hinweise,
    });
  };

  for (const t of a.teile) {
    const haus = imHaus(t);
    if (haus.art === 'nein') continue;
    const eigene = [...katalog].sort((x, y) => rang(x) - rang(y));
    for (const s of eigene) {
      const w = s.imWeg;
      if (w === undefined || mengeImWeg(s).wert === 'produkt') continue;
      if (w.art === 'auftrag') continue;
      if (w.art === 'druck') {
        // T125: gedruckt hat der Lieferant
        if (!geliefert(t)) neu(s, t.id, und(haus, bedruckt(t)), 'bedruckt', null);
      } else if (w.art === 'schnitt') {
        // T148: „kein Endschnitt nötig“ am Teil – kein Schneiden auf Endformat
        if (t.ohneEndschnitt !== true)
          neu(s, t.id, und(haus, ausPapier(t)), 'aus Papier, Nutzen schneiden', null);
      } else {
        const amTeil = merkmalPasst(w, t.merkmale);
        const amProdukt = amTeil ? null : merkmalPasst(w, a.merkmale);
        const treffer = amTeil ?? amProdukt;
        if (!treffer) continue;
        // Produkt-Merkmal mit Teil-Menge: nur für bedruckte Teile
        const dazu = amProdukt ? bedruckt(t) : JA;
        neu(s, t.id, und(haus, und(treffer.ja, dazu)), treffer.grund, treffer.wert);
      }
    }
  }
  // T111: schneidet ein fester Schritt die Nutzen aus (Stanzen), entfällt der Endschnitt des Teils
  for (const t of a.teile) {
    const stanzt = schritte.find(
      (x) =>
        x.teilId === t.id &&
        x.bedingung === null &&
        p.arbeitsschritte.find((s) => s.id === x.schrittId)?.schneidetAus === true,
    );
    if (!stanzt) continue;
    for (let i = schritte.length - 1; i >= 0; i--) {
      const x = schritte[i];
      const s = p.arbeitsschritte.find((y) => y.id === x?.schrittId);
      if (x?.teilId === t.id && s?.imWeg?.art === 'schnitt') schritte.splice(i, 1);
    }
  }
  // T108: Schritte einmal je Auftrag
  for (const s of katalog) {
    if (s.imWeg?.art === 'auftrag') neu(s, null, JA, 'einmal je Auftrag', null);
  }
  // Schritte je Exemplar (nach dem Zusammenführen)
  for (const s of katalog) {
    const w = s.imWeg;
    if (w?.art !== 'merkmal' || mengeImWeg(s).wert !== 'produkt') continue;
    const amProdukt = merkmalPasst(w, a.merkmale);
    const amTeil = a.teile.map((t) => merkmalPasst(w, t.merkmale)).find((x) => x !== null) ?? null;
    const treffer = amProdukt ?? amTeil;
    if (treffer) neu(s, null, treffer.ja, treffer.grund, treffer.wert);
  }

  // Regeln: Schritte am Produkt prüfen alle bedruckten Teile, Schritte am Teil ihr Teil
  for (const ws of schritte) {
    const s = p.arbeitsschritte.find((x) => x.id === ws.schrittId);
    if (!s?.seiten) continue;
    const teile =
      ws.teilId === null
        ? a.teile.filter((t) => bedruckt(t).art !== 'nein')
        : a.teile.filter((t) => t.id === ws.teilId);
    for (const t of teile) {
      for (const text of seitenPruefen(s.seiten, t, s.name)) {
        meldungen.push({
          teilId: t.id,
          schrittId: s.id,
          text: ws.bedingung === null ? text : `${ws.bedingung}: ${text}`,
        });
      }
    }
  }
  return { schritte, meldungen };
}
