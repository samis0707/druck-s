import { arbeitsweg, plaetzeFuerSchritt, schrittImWeg, type WegSchritt } from './arbeitsweg';
import { verbrauchWahlFuerWert } from './maschinen-verbrauch';
import { varianteAnZeile } from './variante';
import { druckText, formatText, quelleText } from './artikel';
import type { Artikel, ArtikelMerkmal, ArtikelTeil, DruckWert, Quelle } from './artikel-schema';
import type { Format, Kalkulation, Mengenquelle, Teil, Zeile } from './kalkulation-schema';
import type { Lager } from './lager-schema';
import { annahmeVon, type Oeffnet, type Produktion } from './produktion-schema';
import { dickeFuer, ruecken, rueckenText, type Ruecken } from './ruecken';
import { istStueckTeil } from './papierweg';

// ---------------------------------------------------------------------------
// Offenes Format

/** Offenes Format eines Teils (Nutzen auf dem Druckbogen) und Nutzen je Exemplar. */
export type OffenesFormat = {
  /** null: Endformat noch nicht festgelegt. */
  format: Format | null;
  /** Nutzen je Exemplar (z. B. 8 Doppelbogen bei 32 Seiten Rückstich). */
  jeProdukt: number;
  /** Woher, z. B. „Wickelfalz, 6 Seiten“; null: offen = geschlossen, ohne Schritt. */
  grund: string | null;
  vonHand: boolean;
  hinweise: string[];
  /** Rücken, wenn der Schritt ihn bildet (Klebebindung) und die Dicke bekannt ist. */
  ruecken: Ruecken | null;
};

function feste<T>(
  e: { zustand: 'fest'; wert: T } | { zustand: 'waehlbar'; werte: T[] } | { zustand: 'offen' },
): T | null {
  return e.zustand === 'fest' ? e.wert : null;
}

/** Schritte des Arbeitswegs, die das Format eines Teils öffnen: zuerst die festen. */
function oeffnendeSchritte(
  t: ArtikelTeil,
  p: Produktion,
  weg: readonly WegSchritt[],
): { schritt: WegSchritt; oeffnet: Oeffnet }[] {
  const bedrucktMoeglich = !(t.druck.zustand === 'fest' && t.druck.wert === 'ohne');
  const treffer = weg
    .filter((s) => s.teilId === t.id || (s.teilId === null && bedrucktMoeglich))
    .flatMap((s) => {
      const o = p.arbeitsschritte.find((x) => x.id === s.schrittId)?.oeffnet;
      return o ? [{ schritt: s, oeffnet: o }] : [];
    });
  return [
    ...treffer.filter((x) => x.schritt.bedingung === null),
    ...treffer.filter((x) => x.schritt.bedingung !== null),
  ];
}

/**
 * Offenes Format eines Teils: von Hand am Teil, sonst aus dem ersten Schritt im Arbeitsweg, der
 * das Format öffnet (Falzen, Binden), sonst gleich dem Endformat. Der Bund des Artikels sagt,
 * ob die Felder nebeneinander (links, Standard) oder untereinander (oben) liegen.
 * - nebeneinander „seiten“: Seiten ÷ 2 Felder (Wickelfalz 6 Seiten → 3), ein Nutzen je Teil
 * - bogen (Bindung): Inhalt auf Bogen mit Feldern × 2 Seiten, Nutzen je Exemplar =
 *   Seiten ÷ (Felder × 2) aufgerundet × Stück je Produkt; ein Umschlag (liegt um) bleibt ein
 *   Bogen mit Seiten ÷ 2 Feldern
 */
export function offenesFormat(
  a: Artikel,
  t: ArtikelTeil,
  p: Produktion,
  lager?: Pick<Lager, 'materialien'>,
): OffenesFormat {
  const end = feste(a.endformat);
  const seiten = t.seiten?.zustand === 'fest' ? t.seiten.wert : null;
  const hinweise: string[] = [];
  const kandidaten = oeffnendeSchritte(t, p, arbeitsweg(a, p).schritte);
  const erster = kandidaten[0];

  let felderNeben = 1;
  let felderUnter = 1;
  let jeProdukt = t.jeProdukt;
  let grund: string | null = null;
  let rueckenWert: Ruecken | null = null;
  if (erster) {
    const o = erster.oeffnet;
    const umschlag = o.bogen === true && t.liegtUm !== undefined;
    const seitenText = seiten === null ? '' : `, ${seiten} Seiten`;
    grund = `${erster.schritt.name}${seitenText}`;
    if (erster.schritt.bedingung !== null) hinweise.push(erster.schritt.bedingung);
    if (o.nebeneinander === 'seiten' || umschlag) {
      if (seiten === null) hinweise.push('Seiten fehlen – offenes Format folgt aus den Seiten');
      else felderNeben = Math.ceil(seiten / 2);
      if (umschlag) grund = `${erster.schritt.name}, Umschlag${seitenText}`;
    } else {
      felderNeben = o.nebeneinander;
    }
    if (!umschlag) felderUnter = o.untereinander ?? 1;
    if (umschlag && o.ruecken === true) {
      rueckenWert = rueckenAmUmschlag(a, t, lager, hinweise);
      if (rueckenWert !== null) grund += ` + ${rueckenText(rueckenWert)}`;
    }
    if (o.bogen === true && !umschlag) {
      const jeBogen = felderNeben * felderUnter * 2;
      if (seiten === null) {
        hinweise.push('Seiten fehlen – Bogen je Exemplar folgen aus den Seiten');
      } else {
        const bogen = Math.ceil(seiten / jeBogen);
        jeProdukt = t.jeProdukt * bogen;
        grund = `${erster.schritt.name}${seitenText} = ${bogen} Bogen je Exemplar`;
        if (seiten % jeBogen !== 0) {
          hinweise.push(
            `${seiten} Seiten füllen ${bogen} Bogen zu je ${jeBogen} Seiten nicht ganz`,
          );
        }
      }
    }
  }
  if (t.offenesFormat) {
    return {
      format: t.offenesFormat,
      jeProdukt,
      grund: grund === null ? 'von Hand' : `von Hand (${grund})`,
      vonHand: true,
      hinweise,
      ruecken: rueckenWert,
    };
  }
  if (end === null) {
    return {
      format: null,
      jeProdukt,
      grund,
      vonHand: false,
      hinweise: [...hinweise, 'Endformat fehlt'],
      ruecken: rueckenWert,
    };
  }
  const oben = a.bund === 'oben';
  const dazu = rueckenWert?.um ?? 0;
  const format: Format = {
    breiteUm: end.breiteUm * (oben ? felderUnter : felderNeben) + (oben ? 0 : dazu),
    hoeheUm: end.hoeheUm * (oben ? felderNeben : felderUnter) + (oben ? dazu : 0),
  };
  return { format, jeProdukt, grund, vonHand: false, hinweise, ruecken: rueckenWert };
}

/**
 * Rücken am Umschlag: Seiten und Papierdicke des Teils, um das er liegt (Inhalt). Fehlt etwas,
 * wird nichts angenommen: Hinweis, null.
 */
function rueckenAmUmschlag(
  a: Artikel,
  t: ArtikelTeil,
  lager: Pick<Lager, 'materialien'> | undefined,
  hinweise: string[],
): Ruecken | null {
  const inhalt = a.teile.find((x) => x.id === t.liegtUm);
  if (!inhalt) return null;
  const seiten = inhalt.seiten?.zustand === 'fest' ? inhalt.seiten.wert : null;
  if (seiten === null) {
    hinweise.push('Seiten fehlen – Rücken nicht gerechnet');
    return null;
  }
  const r = ruecken(seiten * inhalt.jeProdukt, dickeFuer(feste(inhalt.woraus), lager));
  if (r === null) hinweise.push('Papierdicke fehlt – Rücken nicht gerechnet');
  return r;
}

/** „Seiten ÷ 2 Felder nebeneinander“, „2 Felder nebeneinander × 2 untereinander · Seiten auf
 *  mehrere Bogen (Bindung)“. */
export function oeffnetText(o: Oeffnet): string {
  let t =
    o.nebeneinander === 'seiten'
      ? 'Seiten ÷ 2 Felder nebeneinander'
      : `${o.nebeneinander} ${o.nebeneinander === 1 ? 'Feld' : 'Felder'} nebeneinander`;
  if (o.untereinander !== undefined && o.untereinander > 1)
    t += ` × ${o.untereinander} untereinander`;
  if (o.bogen) t += ' · Seiten auf mehrere Bogen (Bindung)';
  if (o.ruecken === true) t += ' · Rücken aus den Inhaltsseiten';
  return t;
}

/** „offen 297 × 210 mm (Wickelfalz, 6 Seiten)“; offen = geschlossen → null. */
export function offenesFormatText(o: OffenesFormat, endformat: Format | null): string | null {
  if (o.format === null) return null;
  const gleich =
    endformat !== null &&
    o.format.breiteUm === endformat.breiteUm &&
    o.format.hoeheUm === endformat.hoeheUm;
  if (gleich && o.grund === null) return null;
  return `offen ${formatText(o.format)}${o.grund === null ? '' : ` (${o.grund})`}`;
}

// ---------------------------------------------------------------------------
// Offene Werte abfragen

/** Eine Frage beim Anlegen der Kalkulation: wählbare Werte zur Auswahl, offene zum Eintragen. */
export type ArtikelFrage = {
  schluessel: string;
  /** z. B. „Inhalt: Seiten“, „Bindung“. */
  titel: string;
  art: 'auswahl' | 'zahl' | 'text' | 'format';
  /** Bei „auswahl“: wert = Nummer des Werts. */
  optionen: { wert: string; text: string }[];
};

/** Antwort: Nummer des Werts (auswahl), Zahl/Text als Text, Format in µm. */
export type ArtikelAntworten = Readonly<Record<string, string | Format>>;

type Eig<T> =
  | { zustand: 'fest'; wert: T }
  | { zustand: 'waehlbar'; werte: T[] }
  | { zustand: 'offen' };

function seitenAuswahl(s: NonNullable<ArtikelTeil['seiten']> & { zustand: 'waehlbar' }): number[] {
  const werte = new Set(s.werte ?? []);
  if (s.bereich) {
    for (
      let n = s.bereich.von;
      n <= s.bereich.bis && werte.size < 200;
      n += s.bereich.schritt ?? 1
    ) {
      werte.add(n);
    }
  }
  return [...werte].sort((x, y) => x - y);
}

function auswahl<T>(
  schluessel: string,
  titel: string,
  e: Eig<T>,
  text: (w: T) => string,
): ArtikelFrage | null {
  if (e.zustand !== 'waehlbar') return null;
  return {
    schluessel,
    titel,
    art: 'auswahl',
    optionen: e.werte.map((w, i) => ({ wert: String(i), text: text(w) })),
  };
}

/** T112: Werte eines Merkmals aus dem Katalog („Im Arbeitsweg“: Merkmal … mit Werten). */
function katalogWerte(name: string, p: Pick<Produktion, 'arbeitsschritte'> | undefined): string[] {
  const n = name.trim().toLowerCase();
  const werte = (p?.arbeitsschritte ?? []).flatMap((s) =>
    s.imWeg?.art === 'merkmal' && s.imWeg.name.trim().toLowerCase() === n
      ? (s.imWeg.werte ?? [])
      : [],
  );
  return [...new Set(werte)];
}

/**
 * T108: Passt das Material zur Variante des Teils (z. B. „10 Pass“)? Ja, wenn ein Druckplatz mit
 * dieser Variante es annimmt (Rolle nur ab dem Mindestformat des Platzes). Ohne Variante oder
 * ohne Produktion passt alles.
 */
function materialFuerVariante(
  m: Lager['materialien'][number],
  variante: string | undefined,
  p: Pick<Produktion, 'arbeitsschritte' | 'arbeitsplaetze'> | undefined,
): boolean {
  if (variante === undefined || variante.trim() === '' || p === undefined) return true;
  const name = variante.trim().toLowerCase();
  const druck = new Set(p.arbeitsschritte.filter((s) => s.imWeg?.art === 'druck').map((s) => s.id));
  const plaetze = (p.arbeitsplaetze ?? []).filter((pl) =>
    pl.schritte.some(
      (s) =>
        druck.has(s.schrittId) &&
        (s.profile ?? []).some((x) => x.name.trim().toLowerCase() === name),
    ),
  );
  if (plaetze.length === 0) return true;
  const form = m.form === 'Rolle' ? 'rolle' : m.form === 'Stueck' ? 'stueck' : 'bogen';
  return plaetze.some((pl) => {
    const annahme = annahmeVon(pl.grenzen);
    if (annahme.length > 0 && !annahme.includes(form)) return false;
    const min = pl.grenzen?.formatMin?.breiteUm;
    return !(m.form === 'Rolle' && min !== undefined && m.breiteUm < min);
  });
}

/**
 * Was beim Anlegen einer Kalkulation aus dem Artikel (bzw. der Vorlage) gefragt wird: wählbare
 * Werte (Endformat, je Teil Woraus, Bedruckt, Seiten, Wer, Merkmale; Merkmale des Produkts) zur
 * Auswahl; offene Seiten, Merkmale und Endformat zum Eintragen; offenes Material (aus dem Lager)
 * und offene Farbigkeit (übliche Farbigkeiten) zur Auswahl (T108). Offenes „Wer“ bleibt offen.
 */
export function artikelFragen(
  a: Artikel,
  lager?: Pick<Lager, 'materialien'>,
  produktion?: Pick<Produktion, 'arbeitsschritte' | 'arbeitsplaetze'>,
): ArtikelFrage[] {
  const fragen: ArtikelFrage[] = [];
  const dazu = (f: ArtikelFrage | null) => {
    if (f) fragen.push(f);
  };
  if (a.endformat.zustand === 'offen') {
    fragen.push({ schluessel: 'endformat', titel: 'Endformat', art: 'format', optionen: [] });
  } else dazu(auswahl('endformat', 'Endformat', a.endformat, formatText));
  const merkmal = (schluessel: string, titel: string, m: ArtikelMerkmal) => {
    if (m.wert.zustand === 'offen') {
      // T112: kennt der Katalog Werte zu diesem Merkmal (z. B. Bohren: 2-fach, 4-fach), zur Wahl
      const werte = katalogWerte(m.name, produktion);
      fragen.push(
        werte.length > 0
          ? {
              schluessel,
              titel,
              art: 'auswahl',
              optionen: werte.map((w) => ({ wert: w, text: w })),
            }
          : { schluessel, titel, art: 'text', optionen: [] },
      );
    } else dazu(auswahl(schluessel, titel, m.wert, (w) => w));
  };
  for (const t of a.teile) {
    const k = `teil:${t.id}:`;
    dazu(
      auswahl(`${k}woraus`, `${t.name}: Papier/Material`, t.woraus, (q: Quelle) =>
        quelleText(q, lager),
      ),
    );
    // T108: offenes Material → Auswahl aus dem Lager (ohne Verbrauchsmaterial); nicht bei
    // gestellter Ware
    if (t.woraus.zustand === 'offen' && lager && t.wareGestellt !== true) {
      const alle = lager.materialien.filter((m) => m.form !== 'Menge');
      const passend = alle.filter((m) => materialFuerVariante(m, t.variante, produktion));
      const optionen = (passend.length > 0 ? passend : alle).map((m) => ({
        wert: `material:${m.id}`,
        text: `${m.id} – ${quelleText({ art: 'material', materialId: m.id }, lager)}`,
      }));
      if (optionen.length > 0) {
        fragen.push({
          schluessel: `${k}woraus`,
          titel: `${t.name}: Papier/Material`,
          art: 'auswahl',
          optionen,
        });
      }
    }
    dazu(auswahl(`${k}druck`, `${t.name}: Farbigkeit`, t.druck, (d: DruckWert) => druckText(d)));
    // T108: offene Farbigkeit → Auswahl der üblichen Farbigkeiten
    if (t.druck.zustand === 'offen') {
      fragen.push({
        schluessel: `${k}druck`,
        titel: `${t.name}: Farbigkeit`,
        art: 'auswahl',
        optionen: DRUCK_AUSWAHL.map((d, i) => ({ wert: `druck:${i}`, text: druckText(d) })),
      });
    }
    const unbedruckt = t.druck.zustand === 'fest' && t.druck.wert === 'ohne';
    if (!unbedruckt && t.seiten?.zustand === 'waehlbar') {
      fragen.push({
        schluessel: `${k}seiten`,
        titel: `${t.name}: Seiten`,
        art: 'auswahl',
        optionen: seitenAuswahl(t.seiten).map((n) => ({ wert: String(n), text: `${n} Seiten` })),
      });
    } else if (!unbedruckt && t.seiten?.zustand === 'offen') {
      fragen.push({
        schluessel: `${k}seiten`,
        titel: `${t.name}: Seiten`,
        art: 'zahl',
        optionen: [],
      });
    }
    dazu(
      auswahl(`${k}wer`, `${t.name}: Wer macht es?`, t.wer, (w) =>
        w === 'haus' ? 'im Haus' : w === 'lieferant' ? 'vom Lieferanten' : 'aus dem Lager',
      ),
    );
    for (const m of t.merkmale ?? []) merkmal(`${k}merkmal:${m.name}`, `${t.name}: ${m.name}`, m);
  }
  for (const m of a.merkmale ?? []) merkmal(`merkmal:${m.name}`, m.name, m);
  return fragen;
}

/** Antworten mit Vorgabe (T108): unbeantwortete Auswahl-Fragen nehmen den ersten Wert – so wie
 *  die Auswahl ihn anzeigt. */
export function antwortenMitVorgabe(
  fragen: readonly ArtikelFrage[],
  antworten: ArtikelAntworten,
): ArtikelAntworten {
  const neu: Record<string, string | Format> = { ...antworten };
  for (const f of fragen) {
    const erste = f.optionen[0]?.wert;
    if (f.art === 'auswahl' && neu[f.schluessel] === undefined && erste !== undefined) {
      neu[f.schluessel] = erste;
    }
  }
  return neu;
}

/** Farbigkeiten zur Auswahl, wenn sie am Artikel offen ist (T108). */
export const DRUCK_AUSWAHL: readonly DruckWert[] = [
  { vorne: { farbe: 'schwarz' } },
  { vorne: { farbe: 'farbig' } },
  { vorne: { farbe: 'schwarz' }, hinten: { farbe: 'schwarz' } },
  { vorne: { farbe: 'farbig' }, hinten: { farbe: 'schwarz' } },
  { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } },
];

/** Wert aus der Antwort: Nummer des wählbaren Werts, sonst der erste. */
function gewaehlt<T>(e: Eig<T>, antwort: string | Format | undefined): Eig<T> {
  if (e.zustand !== 'waehlbar') return e;
  const i = typeof antwort === 'string' ? Number.parseInt(antwort, 10) : 0;
  const wert = e.werte[Number.isFinite(i) ? i : 0] ?? e.werte[0];
  return wert === undefined ? e : { zustand: 'fest', wert };
}

function merkmalMit(m: ArtikelMerkmal, antwort: string | Format | undefined): ArtikelMerkmal {
  if (m.wert.zustand === 'offen') {
    return typeof antwort === 'string' && antwort.trim() !== ''
      ? { ...m, wert: { zustand: 'fest', wert: antwort.trim() } }
      : m;
  }
  return { ...m, wert: gewaehlt(m.wert, antwort) };
}

/**
 * Artikel mit den Antworten festgelegt (nur einengen): wählbar → der gewählte (sonst der erste)
 * Wert; offen → der eingetragene Wert, wenn es einen gibt.
 */
export function artikelMitAntworten(a: Artikel, antworten: ArtikelAntworten): Artikel {
  const endAntwort = antworten['endformat'];
  const endformat: Artikel['endformat'] =
    a.endformat.zustand === 'offen'
      ? typeof endAntwort === 'object'
        ? { zustand: 'fest', wert: endAntwort }
        : a.endformat
      : gewaehlt(a.endformat, endAntwort);
  const teile = a.teile.map((t): ArtikelTeil => {
    const k = `teil:${t.id}:`;
    const neu: ArtikelTeil = {
      ...t,
      woraus: gewaehlt(t.woraus, antworten[`${k}woraus`]),
      druck: gewaehlt(t.druck, antworten[`${k}druck`]),
      wer: gewaehlt(t.wer, antworten[`${k}wer`]),
    };
    // T108: offenes Material bzw. offene Farbigkeit mit Antwort festlegen
    const w = antworten[`${k}woraus`];
    if (t.woraus.zustand === 'offen' && typeof w === 'string' && w.startsWith('material:')) {
      neu.woraus = { zustand: 'fest', wert: { art: 'material', materialId: w.slice(9) } };
    }
    const d = antworten[`${k}druck`];
    const di = typeof d === 'string' && d.startsWith('druck:') ? Number(d.slice(6)) : Number.NaN;
    const dw = Number.isInteger(di) ? DRUCK_AUSWAHL[di] : undefined;
    if (t.druck.zustand === 'offen' && dw !== undefined) {
      neu.druck = { zustand: 'fest', wert: dw };
    }
    const s = antworten[`${k}seiten`];
    const n = typeof s === 'string' ? Number.parseInt(s, 10) : Number.NaN;
    if (t.seiten?.zustand === 'waehlbar') {
      const erste = seitenAuswahl(t.seiten)[0];
      const wert = Number.isFinite(n) ? n : erste;
      if (wert !== undefined) neu.seiten = { zustand: 'fest', wert };
    } else if (t.seiten?.zustand === 'offen' && Number.isFinite(n) && n > 0) {
      neu.seiten = { zustand: 'fest', wert: n };
    }
    if (t.merkmale)
      neu.merkmale = t.merkmale.map((m) => merkmalMit(m, antworten[`${k}merkmal:${m.name}`]));
    return neu;
  });
  const neu: Artikel = { ...a, endformat, teile };
  if (a.merkmale)
    neu.merkmale = a.merkmale.map((m) => merkmalMit(m, antworten[`merkmal:${m.name}`]));
  return neu;
}

// ---------------------------------------------------------------------------
// Kalkulation aus dem Artikel

export type KalkulationAusArtikel = {
  /** Eingabe für kalkulationHinzufuegen (ohne ID). */
  eingabe: Omit<Kalkulation, 'id'>;
  /** Was nicht übernommen wurde oder zu prüfen ist. */
  hinweise: string[];
};

/** Lagermaterial zum Woraus: Material direkt, Sorte über alle Bogen gleicher Sorte/Grammatur. */
function materialZu(
  q: Quelle | null,
  lager: Pick<Lager, 'materialien'>,
): { id: string | null; hinweis: string | null } {
  if (q === null) return { id: null, hinweis: 'Papier noch offen' };
  if (q.art === 'material') {
    return lager.materialien.some((m) => m.id === q.materialId)
      ? { id: q.materialId, hinweis: null }
      : { id: null, hinweis: `Material ${q.materialId} nicht im Lager` };
  }
  if (q.art === 'sorte') {
    const passend = lager.materialien.filter(
      (m) =>
        m.form === 'Bogen' &&
        m.grammatur === q.grammatur &&
        m.sorte.trim().toLowerCase() === q.sorte.trim().toLowerCase(),
    );
    const erstes = passend[0];
    if (!erstes) return { id: null, hinweis: `${quelleText(q)} nicht im Lager` };
    return {
      id: erstes.id,
      hinweis:
        passend.length > 1
          ? `${quelleText(q)}: ${passend.length} Formate im Lager, genommen ${quelleText({ art: 'material', materialId: erstes.id }, lager)}`
          : null,
    };
  }
  if (q.art === 'artikel')
    return { id: null, hinweis: `aus Artikel ${q.artikelId}: von Hand ergänzen` };
  return { id: null, hinweis: `${q.text}: kein Lagermaterial` };
}

/** Lagen je Exemplar (T104): ein Bogen je Stück jedes Teils, z. B. Umschlag 1 + Inhalt 4 = 5. */
function lagenMenge(teile: readonly Teil[]): Mengenquelle {
  const faktor = teile.reduce((summe, t) => summe + t.jeProdukt, 0);
  return faktor > 1 ? { art: 'produkt', faktor } : { art: 'produkt' };
}

/** Erste Maschine eines Schritts, die rechnet (wie bei den Zeilen). */
function platzVon(s: Pick<WegSchritt, 'plaetze'>): string | null {
  return (s.plaetze.find((x) => x.rechnet) ?? s.plaetze[0])?.id ?? null;
}

/**
 * Zeile „Vorschneiden“ (T103) für ein Teil auf Bogen: nötig, wenn das Material einen eigenen
 * Druckbogen hat (Vorschnitt) oder der Rohbogen größer ist als die Druckmaschine. Maschine und
 * Schritt wie beim Schneiden nach dem Druck; ohne Schneiden im Weg keine Zeile.
 */
function vorschneidenZeile(
  teilId: string,
  materialId: string | null,
  stueck: boolean,
  schritte: readonly WegSchritt[],
  p: Produktion,
  lager: Pick<Lager, 'materialien'>,
): Omit<Extract<Zeile, { art: 'arbeitsgang' }>, 'id'> | null {
  if (stueck || materialId === null) return null;
  const m = lager.materialien.find((x) => x.id === materialId);
  if (m?.form !== 'Bogen') return null;
  const eigene = schritte.filter((s) => s.teilId === teilId && s.bedingung === null);
  const art = (s: WegSchritt) => p.arbeitsschritte.find((x) => x.id === s.schrittId)?.imWeg?.art;
  const druck = eigene.find((s) => art(s) === 'druck');
  // T111: schneidet ein Schritt die Nutzen aus (Stanzen), fehlt der Endschnitt im Weg – zum
  // Vorschneiden dient dann der Schneide-Schritt aus dem Katalog
  const katalogSchnitt = p.arbeitsschritte.find((x) => x.imWeg?.art === 'schnitt');
  const schnitt =
    eigene.find((s) => art(s) === 'schnitt') ??
    (katalogSchnitt === undefined
      ? undefined
      : { schrittId: katalogSchnitt.id, plaetze: plaetzeFuerSchritt(p, katalogSchnitt.id) });
  if (!druck || !schnitt) return null;
  const druckPlatz = platzVon(druck);
  const schnittPlatz = platzVon(schnitt);
  if (druckPlatz === null || schnittPlatz === null) return null;
  const platz = (p.arbeitsplaetze ?? []).find((x) => x.id === druckPlatz);
  const max =
    platz?.schritte.find((x) => x.schrittId === druck.schrittId)?.grenzen?.formatMax ??
    platz?.grenzen?.formatMax;
  const zuGross =
    max !== undefined &&
    !(
      (m.breiteUm <= max.breiteUm && m.hoeheUm <= max.hoeheUm) ||
      (m.breiteUm <= max.hoeheUm && m.hoeheUm <= max.breiteUm)
    );
  if (m.druckbogen === undefined && !zuGross) return null;
  return {
    art: 'arbeitsgang',
    platzId: schnittPlatz,
    schrittId: schnitt.schrittId,
    bezeichnung: 'Vorschneiden',
    menge: { art: 'papierweg', teilId, wert: 'vorschneiden', gestapelt: true },
  };
}

/** Menge der Zeile aus der Menge im Arbeitsweg. */
function mengeAusWeg(s: WegSchritt, teilId: string | null): Mengenquelle {
  const faktor = (s.menge.faktor ?? 1) * (s.anzahl ?? 1);
  if (s.menge.wert === 'blaetter')
    return teilId === null ? { art: 'auftrag' } : { art: 'auftrag', teilId };
  if (s.menge.wert === 'produkt' || teilId === null) {
    return {
      art: 'produkt',
      ...(faktor === 1 ? {} : { faktor }),
      ...(s.menge.teiler === undefined ? {} : { teiler: s.menge.teiler }),
    };
  }
  return {
    art: 'papierweg',
    teilId,
    wert: s.menge.wert,
    ...(faktor === 1 ? {} : { faktor }),
    ...(s.menge.gestapelt ? { gestapelt: true } : {}),
  };
}

/**
 * Neue Kalkulation aus einem (festgelegten) Artikel: je Teil im Haus ein Teil (Endformat, offenes
 * Format und Nutzen je Exemplar aus den Schritten, Material aus dem Lager) mit Zeile Papier
 * (Rohbogen) und den Schritten des Arbeitswegs (Druck mit Farbigkeit, Schneiden, Merkmale) an der
 * ersten Maschine, die rechnet; danach die Schritte je Exemplar. Teile vom Lieferanten werden
 * Zukauf-Zeilen. Bedingte Schritte (noch offene Werte) und Merkmale ohne Schritt nennt `hinweise`.
 */
export function kalkulationAusArtikel(
  a: Artikel,
  p: Produktion,
  lager: Pick<Lager, 'materialien'>,
  kopf: { auflagen: number[]; erstelltAm?: string },
): KalkulationAusArtikel {
  const hinweise: string[] = [];
  const weg = arbeitsweg(a, p);
  const end = feste(a.endformat);
  const teile: Teil[] = [];
  const zeilen: Zeile[] = [];
  const zid = () => `Z${zeilen.length + 1}`;

  const schrittZeile = (
    s: WegSchritt,
    teilId: string | null,
    druck: DruckWert | null,
    materialId: string | null,
    variante?: string,
  ) => {
    if (s.bedingung !== null) {
      hinweise.push(`${s.name} nicht übernommen (${s.bedingung})`);
      return;
    }
    const platz = s.plaetze.find((x) => x.rechnet) ?? s.plaetze[0];
    if (!platz) {
      hinweise.push(`${s.name}: keine Maschine kann es – von Hand ergänzen`);
      return;
    }
    const amPlatz = (p.arbeitsplaetze ?? [])
      .find((x) => x.id === platz.id)
      ?.schritte.find((x) => x.schrittId === s.schrittId);
    // T104: läuft der Schritt an dieser Maschine mit einem anderen (Heften mit Zusammentragen),
    // kommt der andere als eigene Zeile davor, wenn er noch fehlt
    const partner = amPlatz?.laeuftMit?.schrittId;
    if (
      partner !== undefined &&
      !zeilen.some(
        (z) => z.art === 'arbeitsgang' && z.platzId === platz.id && z.schrittId === partner,
      )
    ) {
      const partnerSchritt = p.arbeitsschritte.find((x) => x.id === partner);
      const menge: Mengenquelle =
        s.menge.wert === 'produkt' || teilId === null
          ? partnerSchritt?.einheit === 'Lage'
            ? lagenMenge(teile)
            : { art: 'produkt' }
          : mengeAusWeg(s, teilId);
      zeilen.push({ id: zid(), art: 'arbeitsgang', platzId: platz.id, schrittId: partner, menge });
      hinweise.push(
        `${s.name} läuft mit ${partnerSchritt?.name ?? partner} – Zeile ${partnerSchritt?.name ?? partner} dazu`,
      );
    }
    const zeile: Extract<Zeile, { art: 'arbeitsgang' }> = {
      id: zid(),
      art: 'arbeitsgang',
      platzId: platz.id,
      schrittId: s.schrittId,
      // T108: Schritt „einmal je Auftrag“ → Menge einmal je Auftrag
      menge:
        p.arbeitsschritte.find((x) => x.id === s.schrittId)?.imWeg?.art === 'auftrag'
          ? { art: 'auftrag' }
          : mengeAusWeg(s, teilId),
    };
    // T104: Schritt je Exemplar mit Teiler (z. B. 50 Exemplare je Stapel) und Rüsten je Stapel:
    // Stapel = Exemplare ÷ Teiler
    if (
      s.menge.wert === 'produkt' &&
      s.menge.teiler !== undefined &&
      (amPlatz?.ruesten ?? []).some((r) => r.je === 'Stapel')
    ) {
      zeile.stapel = { art: 'produkt', teiler: s.menge.teiler };
    }
    // T104: Name des Schritts und Grund, z. B. „Dreiseitenbeschnitt (Bindung: Rückstich)“
    // T133: „Stanzen (Stanzen: ja)“ sagt nichts – bei Wert „ja“ reicht der Name der Tätigkeit
    if (s.grund.includes(':') && !/: ja$/i.test(s.grund))
      zeile.bezeichnung = `${s.name} (${s.grund})`.slice(0, 120);
    // T115: Merkmal-Wert wählt das Verbrauchsmaterial der Maschine (z. B. Kaschierung „matt“)
    const wahl = verbrauchWahlFuerWert(
      (p.arbeitsplaetze ?? []).find((x) => x.id === platz.id),
      s.schrittId,
      s.wert,
    );
    if (wahl !== undefined) zeile.verbrauchWahl = wahl;
    // T120: Farbigkeit nur am Druckschritt – sonst zählt z. B. Stanzen oder Kaschieren bei 4/4
    // zwei Durchgänge und meldet fehlende Klickpreise
    const art = p.arbeitsschritte.find((x) => x.id === s.schrittId)?.imWeg?.art;
    if (druck !== null && druck !== 'ohne' && s.menge.wert === 'druckbogen' && art === 'druck')
      zeile.druck = druck;
    if (materialId !== null && s.menge.wert === 'druckbogen') zeile.materialId = materialId;
    // T155: Stanzform des Teils (bei Schritten am ganzen Produkt: die einzige im Artikel)
    if (p.arbeitsschritte.find((x) => x.id === s.schrittId)?.werkzeug === true) {
      const formen = a.teile.flatMap((t) => (t.stanzformId === undefined ? [] : [t]));
      const form =
        teilId === null
          ? formen.length === 1
            ? formen[0]?.stanzformId
            : undefined
          : a.teile.find((t) => t.id === teilId)?.stanzformId;
      if (form !== undefined) zeile.stanzformId = form;
    }
    // T106: Variante des Teils beim Druck, wenn die Maschine sie hat
    if (variante !== undefined && art === 'druck') {
      const v = (amPlatz?.profile ?? []).find(
        (x) => x.name.trim().toLowerCase() === variante.trim().toLowerCase(),
      );
      if (v !== undefined) zeile.profil = v.name;
      else hinweise.push(`${s.name}: Variante „${variante}“ gibt es an ${platz.name} nicht`);
    }
    // T123: Merkmal-Wert wählt die Variante der Maschine (Name oder Angabe gleich dem Wert,
    // z. B. „4-fach“ → „Hang 4-fach“); mehrere passen: Standard, sonst die erste
    if (zeile.profil === undefined && s.wert !== null && s.wert !== undefined) {
      const wert = s.wert.trim().toLowerCase();
      const passend = (amPlatz?.profile ?? []).filter(
        (x) =>
          x.name.trim().toLowerCase() === wert ||
          (x.angaben ?? []).some((a) => a.trim().toLowerCase() === wert),
      );
      // T124: Standard geht vor, sonst die erste in der Reihenfolge der Maschine
      const erste = passend.find((x) => x.standard === true) ?? passend[0];
      if (erste !== undefined) {
        // T129: Variante wie beim Wählen im Formular – ihr Faktor, nicht die Zahl aus „4-fach“
        Object.assign(zeile, varianteAnZeile(zeile, p, erste.name));
        if (passend.length > 1) {
          hinweise.push(
            `${s.name}: Variante ${erste.name} gewählt – auch möglich: ${passend
              .filter((x) => x !== erste)
              .map((x) => x.name)
              .join(', ')}`,
          );
        }
      }
    }
    zeilen.push(zeile);
    for (const h of s.hinweise) hinweise.push(`${s.name}: ${h}`);
  };

  if (end === null) hinweise.push('Endformat fehlt – Teile ohne Format nicht angelegt');
  for (const t of a.teile) {
    const wer = feste(t.wer);
    const geliefert = wer === 'lieferant' && t.lieferform !== undefined;
    if (wer === 'lieferant') {
      const zukauf: Extract<Zeile, { art: 'zukauf' }> = {
        id: zid(),
        art: 'zukauf',
        bezeichnung: `${t.name} (Zukauf)`,
        preise: [0],
      };
      if (t.lieferantId !== undefined) zukauf.lieferantId = t.lieferantId;
      if (t.anfrageText !== undefined) zukauf.beschreibung = t.anfrageText;
      // T125: Bogen vom Lieferanten, Verarbeitung im Haus – die Zeile zeigt die Bestellmenge.
      // T152: nur, wenn das Teil auch angelegt wird (ohne Endformat nicht)
      if (geliefert && end !== null) zukauf.teilId = t.id;
      zeilen.push(zukauf);
      hinweise.push(`${t.name}: Preis vom Lieferanten eintragen`);
      if (!geliefert) continue;
    }
    if (wer === 'lager') {
      hinweise.push(`${t.name}: aus dem Lager – nicht gerechnet`);
      continue;
    }
    if (wer === null) hinweise.push(`${t.name}: „Wer macht es?“ offen – als im Haus gerechnet`);
    if (end === null) continue;
    const offen = offenesFormat(a, t, p, lager);
    const quelle = feste(t.woraus);
    const gestellt = t.wareGestellt === true;
    // Ware gestellt (T101): kein Material, keine Meldung zum Material
    const material = gestellt ? { id: null, hinweis: null } : materialZu(quelle, lager);
    if (material.hinweis !== null) hinweise.push(`${t.name}: ${material.hinweis}`);
    const stueck = istStueckTeil(
      t,
      lager.materialien.find((m) => m.id === material.id),
    );
    for (const h of offen.hinweise) hinweise.push(`${t.name}: ${h}`);
    const teil: Teil = { id: t.id, name: t.name, endformat: end, jeProdukt: offen.jeProdukt };
    if (material.id !== null) teil.materialId = material.id;
    if (geliefert && t.lieferform !== undefined) {
      teil.geliefert = true;
      teil.druckbogen = t.lieferform.format;
    }
    if (
      offen.format !== null &&
      (offen.format.breiteUm !== end.breiteUm || offen.format.hoeheUm !== end.hoeheUm)
    ) {
      teil.offenesFormat = offen.format;
    }
    if (t.beschnittUm !== undefined) teil.beschnittUm = t.beschnittUm;
    if (gestellt) {
      teil.wareGestellt = true;
      if (t.wareText !== undefined && t.wareText.trim() !== '') teil.wareText = t.wareText;
    }
    teile.push(teil);
    // T125: geliefert – Papier und Druck bezahlt der Zukauf
    if (material.id !== null && !geliefert) {
      zeilen.push({
        id: zid(),
        art: 'material',
        materialId: material.id,
        menge: { art: 'papierweg', teilId: t.id, wert: 'rohbogen' },
      });
    }
    const druck = feste(t.druck);
    if (druck === null) hinweise.push(`${t.name}: Farbigkeit offen`);
    // T103: Rohbogen muss vor dem Druck geschnitten werden → Zeile Vorschneiden vor dem Druck
    const vor = geliefert
      ? null
      : vorschneidenZeile(t.id, material.id, stueck, weg.schritte, p, lager);
    if (vor !== null) zeilen.push({ ...vor, id: zid() });
    let objektdruck = false;
    const form = lager.materialien.find((m) => m.id === material.id)?.form;
    for (const weg0 of weg.schritte.filter((x) => x.teilId === t.id)) {
      let s = weg0;
      // Stück-Teile (T101): Druck nur je Stück (Objektdruck), kein Schneiden; Teile auf Bogen
      // nie mit einem Druck je Stück
      const art = p.arbeitsschritte.find((x) => x.id === s.schrittId);
      const jeStueck = art?.einheit === 'Stueck';
      if (art?.imWeg?.art === 'druck' && jeStueck !== stueck) continue;
      if (art?.imWeg?.art === 'druck' && geliefert) continue;
      if (stueck && art?.imWeg?.art === 'schnitt') continue;
      // T108: Druck nur an Maschinen, die das Material annehmen (Rolle → „Rolle“, Bogen →
      // „Bogen“; Maschine ohne Angabe nimmt alles). Keine passende → Schritt entfällt.
      if (art?.imWeg?.art === 'druck' && !stueck) {
        const noetig = form === 'Rolle' ? 'rolle' : 'bogen';
        const passend = s.plaetze.filter((pl) => {
          const a = annahmeVon((p.arbeitsplaetze ?? []).find((x) => x.id === pl.id)?.grenzen);
          return a.length === 0 || a.includes(noetig);
        });
        if (passend.length === 0) continue;
        s = { ...s, plaetze: passend };
      }
      // T108: auf der Rolle gibt es keinen Endschnitt – Schneiden je Abschnitt × 2 (Trennen und
      // Besäumen), in der Zeile anpassbar
      if (form === 'Rolle' && art?.imWeg?.art === 'schnitt') {
        s = { ...s, menge: { wert: 'druckbogen', faktor: 2 } };
        hinweise.push(`${t.name}: ${s.name} auf der Rolle – 2 Schnitte je Abschnitt angenommen`);
      }
      if (art?.imWeg?.art === 'druck') objektdruck = true;
      const vorher = zeilen.length;
      schrittZeile(s, t.id, druck, material.id, t.variante?.trim() || undefined);
      const neueZeile = zeilen[vorher];
      if (form === 'Rolle' && art?.imWeg?.art === 'schnitt' && neueZeile?.art === 'arbeitsgang') {
        neueZeile.stapel = { art: 'auftrag' };
      }
    }
    if (stueck && !objektdruck && druck !== null && druck !== 'ohne') {
      hinweise.push(
        `${t.name}: wird je Stück gedruckt – kein Druckschritt in Stück im Katalog („Objektdruck“ mit „im Weg: bei jedem bedruckten Teil“ anlegen)`,
      );
    }
  }
  for (const s of weg.schritte.filter((x) => x.teilId === null)) schrittZeile(s, null, null, null);
  for (const m of weg.meldungen) hinweise.push(m.text);
  // Merkmale, zu denen kein Schritt im Katalog gehört
  const imKatalog = new Set(
    p.arbeitsschritte
      .map(schrittImWeg)
      .flatMap((s) => (s.imWeg?.art === 'merkmal' ? [s.imWeg.name.trim().toLowerCase()] : [])),
  );
  const merkmale = [
    ...(a.merkmale ?? []).map((m) => m.name),
    ...a.teile.flatMap((t) => (t.merkmale ?? []).map((m) => m.name)),
  ];
  for (const name of [...new Set(merkmale)]) {
    if (!imKatalog.has(name.trim().toLowerCase())) {
      hinweise.push(`Merkmal „${name}“: kein Arbeitsschritt im Katalog – von Hand ergänzen`);
    }
  }

  const eingabe: Omit<Kalkulation, 'id'> = {
    titel: a.titel,
    auflagen: kopf.auflagen,
    einheit: a.einheit,
    zeilen,
    teile,
    artikelId: a.id,
  };
  if (a.kunde !== undefined) eingabe.kunde = a.kunde;
  if (kopf.erstelltAm !== undefined) eingabe.erstelltAm = kopf.erstelltAm;
  return { eingabe, hinweise: [...new Set(hinweise)] };
}
