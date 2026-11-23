/**
 * T174: Lieferantendaten einspielen (Austauschformat `kalpri-lieferantendaten` v1, siehe
 * docs/austausch/lieferantendaten-v1.md). kalpri kennt keinen Shop – es liest nur diese Datei.
 *
 * Regeln (alle nur ergänzend, nie überschreibend):
 * - **Sorten** (Katalog): je Sorte ein Hauspapier (Zuordnung, sonst Vorschlag der Datei; leer =
 *   überspringen). Lieferantensorte mit gleichem Lieferant + Name + Hauspapier + Grammaturbereich
 *   wird wiederverwendet, sonst neu. Preise werden auf je 100 kg umgerechnet; unterschiedliche
 *   Preise je Grammatur ergeben je Bereich eine eigene Lieferantensorte. Neuer Sortenpreis nur, wenn
 *   er vom am Abruftag geltenden abweicht.
 * - **Artikel**: vorhandenes Material über die Artikelnummer, sonst über Hauspapier + Grammatur +
 *   Format (auch gedreht) + Laufrichtung. Gefunden: nur leere Felder füllen, Abweichungen als
 *   Hinweis. Nicht gefunden: neues Material.
 * - **Bestellungen**: Preis je 1.000 Bogen = Zwischensumme ÷ Anzahl × 1000, gültig ab Bestelldatum.
 *   Material über Artikelnummer, sonst eindeutige Rückfrage. Gleicher Preis wie der am Tag geltende →
 *   kein neuer Eintrag. Stornierte Bestellungen und Nebenkosten nie im Materialpreis.
 */
import { z } from 'zod';
import { pruefeLager, type Lager } from './lager-schema';
import { naechsteMaterialId } from './lager';
import type { Material } from './material';

type Bogen = Extract<Material, { form: 'Bogen' }>;
import type { Preis } from './preis-schema';
import type { LieferantenSorte } from './sorten-schema';
import type { PruefErgebnis } from './pruefung';
import { ausZod } from './pruefung';

// ---------------------------------------------------------------- Schema (Vertrag v1)

const text = (max: number) => z.string().trim().min(1, 'Pflichtfeld').max(max);
const ganz = z.number().int('muss eine ganze Zahl sein');
const positiv = ganz.positive('muss größer als 0 sein');
const betrag = ganz.min(0, 'darf nicht negativ sein');
const datumIso = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Datum im Format JJJJ-MM-TT');
const https = z
  .string()
  .trim()
  .url('muss eine Webadresse sein')
  .refine(
    (u) => u.startsWith('https://') && !/^https:\/\/[^/]*@/.test(u),
    'nur https ohne Zugangsdaten',
  );

const ArtikelSchema = z.object({
  artikelnummer: text(60),
  url: https.optional(),
  grammatur: positiv.max(2000),
  breiteMm: positiv.max(10000),
  hoeheMm: positiv.max(10000),
  laufrichtung: z.enum(['SB', 'BB']).optional(),
  aufAnfrage: z.boolean().optional(),
  dickeUm: positiv.max(10000).optional(),
  volumen: z.number().positive().max(5).optional(),
  oberflaeche: z.enum(['ungestrichen', 'gestrichen', 'beschichtet']).optional(),
  packung: z.object({ einheit: text(40), inhalt: positiv }).optional(),
  preis: z
    .object({
      betragZehntelcent: betrag,
      je: z.enum(['100kg', '1000Bogen', 'Packung']),
      staffel: z.array(z.object({ abMenge: positiv, betragZehntelcent: betrag })).optional(),
    })
    .optional(),
  hinweise: z.array(z.string()).optional(),
});

const SorteSchema = z.object({
  name: text(120),
  hersteller: text(120).optional(),
  hauspapierVorschlag: text(120).optional(),
  oberflaeche: z.enum(['ungestrichen', 'gestrichen', 'beschichtet']).optional(),
  artikel: z.array(ArtikelSchema).max(2000),
});

const PositionSchema = z.object({
  artikelnummer: text(60),
  sorte: text(120).optional(),
  grammatur: positiv.max(2000).optional(),
  breiteMm: positiv.max(10000).optional(),
  hoeheMm: positiv.max(10000).optional(),
  laufrichtung: z.enum(['SB', 'BB']).optional(),
  anzahl: positiv,
  einheit: text(30),
  zwischensummeZehntelcent: betrag,
});

const BestellungSchema = z.object({
  nummer: text(60),
  datum: datumIso,
  status: z.enum(['ausstehend', 'abgeschlossen', 'storniert']),
  nebenkosten: z
    .array(z.object({ art: text(40), text: text(120).optional(), betragZehntelcent: betrag }))
    .optional(),
  positionen: z.array(PositionSchema).max(2000),
});

export const LieferantendatenSchema = z.object({
  art: z.literal('kalpri-lieferantendaten', {
    errorMap: () => ({ message: 'keine Lieferantendaten (art)' }),
  }),
  version: z.literal(1, { errorMap: () => ({ message: 'Version muss 1 sein' }) }),
  lieferant: text(80),
  quelle: z.string().trim().min(1),
  abgerufenAm: datumIso,
  programm: z.string().optional(),
  sorten: z.array(SorteSchema).max(500).optional(),
  bestellungen: z.array(BestellungSchema).max(2000).optional(),
  hinweise: z.array(z.string()).optional(),
});
export type Lieferantendaten = z.infer<typeof LieferantendatenSchema>;
export type LieferantenArtikel = z.infer<typeof ArtikelSchema>;

export function pruefeLieferantendaten(input: unknown): PruefErgebnis<Lieferantendaten> {
  return ausZod(LieferantendatenSchema.safeParse(input));
}

// ---------------------------------------------------------------- Zuordnung und Ergebnis

/** Entscheidungen des Nutzers in der Vorschau. */
export type LieferantendatenZuordnung = {
  /** Sortenname beim Lieferanten → Hauspapier; '' = Sorte überspringen. */
  hauspapier?: Record<string, string> | undefined;
  /** Schlüssel der Rückfrage (positionSchluessel) → Material-ID oder 'ueberspringen'. */
  positionen?: Record<string, string> | undefined;
};

export type Rueckfrage = {
  schluessel: string;
  text: string;
  optionen: { materialId: string; text: string }[];
};

export type EinspielVorschau = {
  neueSorten: string[];
  neueSortenPreise: string[];
  neueMaterialien: string[];
  ergaenzteFelder: string[];
  neuePreise: string[];
  hinweise: string[];
  rueckfragen: Rueckfrage[];
};

export type EinspielErgebnis =
  | { ok: true; lager: Lager; vorschau: EinspielVorschau; geaendert: boolean }
  | { ok: false; fehler: { pfad: string; meldung: string }[] };

export const positionSchluessel = (bestellnummer: string, index: number) =>
  `${bestellnummer}#${index + 1}`;

// ---------------------------------------------------------------- Hilfen

const k = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');
const euroText = (z: number) =>
  `${(z / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} €`;
const datumText = (iso: string) => {
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return t === null ? iso : `${t[3]}.${t[2]}.${t[1]}`;
};

function naechsteId(ids: readonly string[], praefix: string, trenner = '-'): string {
  let max = 0;
  const muster = new RegExp(`^${praefix}${trenner}(\\d+)$`);
  for (const id of ids) {
    const m = muster.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${praefix}${trenner}${String(max + 1).padStart(4, '0')}`;
}

/** Preis eines Artikels je 100 kg in Zehntelcent (gerundet); null ohne Preis. */
export function je100kg(
  a: Pick<LieferantenArtikel, 'preis' | 'packung' | 'grammatur' | 'breiteMm' | 'hoeheMm'>,
): number | null {
  const p = a.preis;
  if (p === undefined || p.betragZehntelcent <= 0) return null;
  if (p.je === '100kg') return p.betragZehntelcent;
  let je1000: number;
  if (p.je === '1000Bogen') je1000 = p.betragZehntelcent;
  else if (a.packung !== undefined) je1000 = (p.betragZehntelcent * 1000) / a.packung.inhalt;
  else return null;
  // Bogengewicht in kg = mm × mm × g/m² / 1e9; je 100 kg = je Bogen ÷ kg × 100
  return Math.round((je1000 * 1e8) / (a.breiteMm * a.hoeheMm * a.grammatur));
}

const formatGleich = (m: Material, b: number, h: number) =>
  m.form === 'Bogen' &&
  ((m.breiteUm === b * 1000 && m.hoeheUm === h * 1000) ||
    (m.breiteUm === h * 1000 && m.hoeheUm === b * 1000));

const mitNummer = (m: Material, lieferant: string, nummer: string) =>
  (m.artikelnummern ?? []).some(
    (a) => k(a.nummer) === k(nummer) && k(a.lieferant) === k(lieferant),
  );

function kandidaten(
  materialien: readonly Material[],
  papier: string,
  grammatur: number,
  b: number,
  h: number,
  lr: 'SB' | 'BB' | undefined,
): Material[] {
  const grund = materialien.filter(
    (m) =>
      m.form === 'Bogen' &&
      k(m.sorte) === k(papier) &&
      m.grammatur === grammatur &&
      formatGleich(m, b, h),
  );
  if (lr === undefined) return grund;
  const genau = grund.filter((m) => m.form === 'Bogen' && m.laufrichtung === lr);
  return genau.length > 0
    ? genau
    : grund.filter((m) => m.form === 'Bogen' && m.laufrichtung === undefined);
}

const materialText = (m: Material) =>
  m.form === 'Bogen'
    ? `${m.id} ${m.sorte} ${m.grammatur} g · ${m.breiteUm / 10000} × ${m.hoeheUm / 10000} cm${m.laufrichtung ? ` · ${m.laufrichtung}` : ''}`
    : `${m.id} ${m.sorte}`;

// ---------------------------------------------------------------- Einspielen

/**
 * Spielt die Datei in das Lager ein. Für die Vorschau einfach aufrufen und das Lager nicht
 * speichern. `heute` nur für Hinweise; Preise gelten ab Abruf- bzw. Bestelldatum.
 */
export function lieferantendatenEinspielen(
  lagerAlt: Lager,
  eingabe: unknown,
  zuordnung: LieferantendatenZuordnung = {},
): EinspielErgebnis {
  const geprueft = pruefeLieferantendaten(eingabe);
  if (!geprueft.ok) return geprueft;
  const d = geprueft.wert;
  const lieferant = d.lieferant.trim();
  const abruftag = d.abgerufenAm.slice(0, 10);
  const v: EinspielVorschau = {
    neueSorten: [],
    neueSortenPreise: [],
    neueMaterialien: [],
    ergaenzteFelder: [],
    neuePreise: [],
    hinweise: [...(d.hinweise ?? [])],
    rueckfragen: [],
  };
  const materialien: Material[] = lagerAlt.materialien.map((m) => ({ ...m }));
  const sorten: LieferantenSorte[] = [...(lagerAlt.sorten ?? [])];
  const sortenPreise = [...(lagerAlt.sortenPreise ?? [])];
  const preise: Preis[] = [...(lagerAlt.preise ?? [])];
  /** Sortenname beim Lieferanten → Hauspapier (für Bestellungen). */
  const papierFuer = new Map<string, string>();
  for (const s of sorten) if (k(s.lieferant) === k(lieferant)) papierFuer.set(k(s.name), s.papier);

  const nummerErgaenzen = (m: Material, nummer: string, url?: string) => {
    if (mitNummer(m, lieferant, nummer)) return;
    m.artikelnummern = [
      ...(m.artikelnummern ?? []),
      { lieferant, nummer, ...(url ? { url } : {}) },
    ];
    v.ergaenzteFelder.push(`${m.id}: Artikelnummer ${lieferant} ${nummer}`);
  };

  // ---- Katalog
  for (const sorte of d.sorten ?? []) {
    const gewaehlt = zuordnung.hauspapier?.[sorte.name];
    const papier = (gewaehlt ?? sorte.hauspapierVorschlag ?? '').trim();
    if (papier === '') {
      v.hinweise.push(`${sorte.name}: kein Hauspapier gewählt – übersprungen`);
      continue;
    }
    papierFuer.set(k(sorte.name), papier);

    // Preise je Grammatur (je 100 kg); bei mehreren Formaten der höchste, mit Hinweis
    const jeGrammatur = new Map<number, number>();
    for (const a of sorte.artikel) {
      const p = je100kg(a);
      if (p === null) continue;
      const alt = jeGrammatur.get(a.grammatur);
      if (alt !== undefined && Math.abs(alt - p) > alt * 0.005)
        v.hinweise.push(
          `${sorte.name} ${a.grammatur} g: Preise je Format unterschiedlich (${euroText(Math.min(alt, p))} bis ${euroText(Math.max(alt, p))} je 100 kg) – der höhere gilt`,
        );
      jeGrammatur.set(a.grammatur, Math.max(alt ?? 0, p));
    }
    const grammaturen = [...jeGrammatur.keys()].sort((a, b) => a - b);
    const bereiche: { von: number; bis: number; preis: number }[] = [];
    for (const g of grammaturen) {
      const p = jeGrammatur.get(g)!;
      const letzter = bereiche[bereiche.length - 1];
      if (letzter !== undefined && Math.abs(letzter.preis - p) <= letzter.preis * 0.005) {
        letzter.bis = g;
        letzter.preis = Math.max(letzter.preis, p);
      } else bereiche.push({ von: g, bis: g, preis: p });
    }
    if (bereiche.length === 0)
      v.hinweise.push(`${sorte.name}: keine Preise in der Datei – keine Lieferantensorte angelegt`);
    const ohneBereich = bereiche.length <= 1;
    const zuSorten =
      bereiche.length === 0
        ? []
        : ohneBereich
          ? [{ von: undefined, bis: undefined, preis: bereiche[0]?.preis }]
          : bereiche.map((b) => ({
              von: b.von as number | undefined,
              bis: b.bis as number | undefined,
              preis: b.preis as number | undefined,
            }));
    for (const b of zuSorten) {
      let ls = sorten.find(
        (s) =>
          k(s.lieferant) === k(lieferant) &&
          k(s.name) === k(sorte.name) &&
          k(s.papier) === k(papier) &&
          s.grammaturVon === b.von &&
          s.grammaturBis === b.bis,
      );
      const bereichText = b.von === undefined ? '' : ` (${b.von}–${b.bis} g)`;
      if (ls === undefined) {
        ls = {
          id: naechsteId(
            sorten.map((s) => s.id),
            'LS',
          ),
          papier,
          name: sorte.name,
          lieferant,
          ...(b.von !== undefined ? { grammaturVon: b.von, grammaturBis: b.bis } : {}),
        };
        sorten.push(ls);
        v.neueSorten.push(`${sorte.name}${bereichText} · ${lieferant} → ${papier}`);
      }
      if (b.preis === undefined) continue;
      let geltend: number | undefined;
      let geltendAb = '';
      for (const sp of sortenPreise)
        if (sp.sorteId === ls.id && sp.gueltigAb <= abruftag && sp.gueltigAb >= geltendAb) {
          geltend = sp.je100kgZehntelcent;
          geltendAb = sp.gueltigAb;
        }
      if (geltend === b.preis) continue;
      sortenPreise.push({
        id: naechsteId(
          sortenPreise.map((p) => p.id),
          'SP',
        ),
        sorteId: ls.id,
        gueltigAb: abruftag,
        je100kgZehntelcent: b.preis,
        anlass: `Lieferantendaten ${datumText(abruftag)}`,
      });
      v.neueSortenPreise.push(
        `${sorte.name}${bereichText}: ${euroText(b.preis)} je 100 kg ab ${datumText(abruftag)}${geltend !== undefined ? ` (bisher ${euroText(geltend)})` : ''}`,
      );
    }

    // Artikel → Materialien
    for (const a of sorte.artikel) {
      const oberflaeche = a.oberflaeche ?? sorte.oberflaeche;
      if (a.aufAnfrage)
        v.hinweise.push(`${sorte.name} ${a.grammatur} g: laut Datenblatt auf Anfrage`);
      let m = materialien.find((x) => mitNummer(x, lieferant, a.artikelnummer));
      if (m === undefined) {
        const kand = kandidaten(
          materialien,
          papier,
          a.grammatur,
          a.breiteMm,
          a.hoeheMm,
          a.laufrichtung,
        );
        if (kand.length > 1)
          v.hinweise.push(
            `${a.artikelnummer}: passt zu ${kand.length} Materialien (${kand.map((x) => x.id).join(', ')}) – ${kand[0]!.id} genommen`,
          );
        m = kand[0];
      }
      if (m === undefined) {
        const neu: Material = {
          id: naechsteMaterialId({ ...lagerAlt, materialien }),
          sorte: papier,
          grammatur: a.grammatur,
          kategorie: 'papier',
          form: 'Bogen',
          breiteUm: a.breiteMm * 1000,
          hoeheUm: a.hoeheMm * 1000,
          ...(a.laufrichtung ? { laufrichtung: a.laufrichtung } : {}),
          ...(a.dickeUm ? { dickeUm: a.dickeUm } : {}),
          ...(a.volumen ? { volumen: Math.round(a.volumen * 100) / 100 } : {}),
          ...(oberflaeche ? { oberflaeche } : {}),
          ...(a.packung
            ? { packung: { einheit: a.packung.einheit, inhalt: a.packung.inhalt } }
            : {}),
          artikelnummern: [
            { lieferant, nummer: a.artikelnummer, ...(a.url ? { url: a.url } : {}) },
          ],
        };
        materialien.push(neu);
        v.neueMaterialien.push(materialText(neu));
        continue;
      }
      nummerErgaenzen(m, a.artikelnummer, a.url);
      if (m.form !== 'Bogen') continue;
      const bogen: Bogen = m;
      const fuellen = <F extends 'dickeUm' | 'volumen' | 'laufrichtung' | 'oberflaeche'>(
        feld: F,
        wert: Bogen[F] | undefined,
        name: string,
        zeige: (x: NonNullable<Bogen[F]>) => string,
      ) => {
        if (wert === undefined) return;
        const alt = bogen[feld];
        if (alt === undefined) {
          bogen[feld] = wert;
          v.ergaenzteFelder.push(`${bogen.id}: ${name} ${zeige(wert as NonNullable<Bogen[F]>)}`);
        } else if (alt !== wert)
          v.hinweise.push(
            `${bogen.id}: ${name} beim Lieferanten ${zeige(wert as NonNullable<Bogen[F]>)}, in kalpri ${zeige(alt as NonNullable<Bogen[F]>)} – bleibt`,
          );
      };
      fuellen('dickeUm', a.dickeUm, 'Dicke', (x) => `${x} µm`);
      fuellen(
        'volumen',
        a.volumen === undefined ? undefined : Math.round(a.volumen * 100) / 100,
        'Volumen',
        (x) => `${String(x).replace('.', ',')} cm³/g`,
      );
      fuellen('laufrichtung', a.laufrichtung, 'Laufrichtung', (x) => String(x));
      fuellen('oberflaeche', oberflaeche, 'Oberfläche', (x) => String(x));
      if (a.packung && m.packung === undefined) {
        m.packung = { einheit: a.packung.einheit, inhalt: a.packung.inhalt };
        v.ergaenzteFelder.push(`${m.id}: Packung ${a.packung.inhalt} Bogen`);
      }
    }
  }

  // ---- Bestellungen (älteste zuerst, damit „gleicher Preis“ richtig erkannt wird)
  const bestellungen = [...(d.bestellungen ?? [])].sort((a, b) => a.datum.localeCompare(b.datum));
  for (const b of bestellungen) {
    const tag = b.datum.slice(0, 10);
    if (b.status === 'storniert') {
      v.hinweise.push(`Bestellung ${b.nummer} (${datumText(tag)}) storniert – nicht übernommen`);
      continue;
    }
    if (b.status === 'ausstehend')
      v.hinweise.push(
        `Bestellung ${b.nummer} (${datumText(tag)}) noch ausstehend – Preise übernommen`,
      );
    if ((b.nebenkosten ?? []).length > 0)
      v.hinweise.push(
        `Bestellung ${b.nummer}: Nebenkosten nicht im Materialpreis – ${(b.nebenkosten ?? [])
          .map((n) => `${n.text ?? n.art} ${euroText(n.betragZehntelcent)}`)
          .join(', ')}`,
      );
    b.positionen.forEach((p, i) => {
      const schluessel = positionSchluessel(b.nummer, i);
      const bezeichnung = `${p.sorte ?? p.artikelnummer}${p.grammatur ? ` ${p.grammatur} g` : ''}${p.breiteMm && p.hoeheMm ? ` ${p.breiteMm}×${p.hoeheMm}` : ''}`;
      if (k(p.einheit) !== 'bogen') {
        v.hinweise.push(
          `${schluessel} ${bezeichnung}: Einheit „${p.einheit}“ – nur Bogen werden übernommen`,
        );
        return;
      }
      const wahl = zuordnung.positionen?.[schluessel];
      if (wahl === 'ueberspringen') return;
      let m: Material | undefined;
      if (wahl !== undefined) {
        m = materialien.find((x) => x.id === wahl);
        if (m === undefined) v.hinweise.push(`${schluessel}: Material ${wahl} nicht gefunden`);
      }
      if (m === undefined) m = materialien.find((x) => mitNummer(x, lieferant, p.artikelnummer));
      if (m === undefined) {
        const papier = p.sorte === undefined ? undefined : papierFuer.get(k(p.sorte));
        const kand =
          papier !== undefined && p.grammatur && p.breiteMm && p.hoeheMm
            ? kandidaten(materialien, papier, p.grammatur, p.breiteMm, p.hoeheMm, p.laufrichtung)
            : [];
        if (kand.length === 1) m = kand[0];
        else {
          v.rueckfragen.push({
            schluessel,
            text:
              kand.length > 1
                ? `${bezeichnung} (Bestellung ${datumText(tag)}): welches Material? Laufrichtung steht nicht in der Bestellung.`
                : `${bezeichnung} (Bestellung ${datumText(tag)}): kein passendes Material gefunden.`,
            optionen: (kand.length > 1
              ? kand
              : materialien.filter(
                  (x) =>
                    x.form === 'Bogen' &&
                    (p.grammatur === undefined || x.grammatur === p.grammatur),
                )
            ).map((x) => ({ materialId: x.id, text: materialText(x) })),
          });
          return;
        }
      }
      if (m === undefined) return;
      const mat: Material = m;
      if (mat.form !== 'Bogen') {
        v.hinweise.push(`${schluessel}: ${mat.id} ist kein Bogen – übersprungen`);
        return;
      }
      nummerErgaenzen(mat, p.artikelnummer);
      const je1000 = Math.round((p.zwischensummeZehntelcent * 1000) / p.anzahl);
      // am Bestelltag geltender eigener Preis dieses Lieferanten
      let geltend: Preis | undefined;
      for (const x of preise)
        if (
          x.materialId === mat.id &&
          k(x.lieferant) === k(lieferant) &&
          x.gueltigAb <= tag &&
          (geltend === undefined || x.gueltigAb >= geltend.gueltigAb)
        )
          geltend = x;
      if (
        geltend !== undefined &&
        geltend.basis === 'je1000' &&
        geltend.betragZehntelcent === je1000
      )
        return;
      preise.push({
        id: naechsteId(
          preise.map((x) => x.id),
          'P',
          '',
        ),
        materialId: mat.id,
        lieferant,
        artikelnummer: p.artikelnummer,
        gueltigAb: tag,
        basis: 'je1000',
        betragZehntelcent: je1000,
      });
      v.neuePreise.push(
        `${materialText(mat)}: ${euroText(je1000)} je 1.000 Bogen ab ${datumText(tag)} (${p.anzahl} Bogen für ${euroText(p.zwischensummeZehntelcent)})`,
      );
    });
  }

  const neu: Lager = {
    ...lagerAlt,
    materialien,
    ...(sorten.length > 0 || lagerAlt.sorten ? { sorten } : {}),
    ...(sortenPreise.length > 0 || lagerAlt.sortenPreise ? { sortenPreise } : {}),
    ...(preise.length > 0 || lagerAlt.preise ? { preise } : {}),
  };
  const p = pruefeLager(neu);
  if (!p.ok) return p;
  const geaendert =
    v.neueSorten.length +
      v.neueSortenPreise.length +
      v.neueMaterialien.length +
      v.ergaenzteFelder.length +
      v.neuePreise.length >
    0;
  return { ok: true, lager: p.wert, vorschau: v, geaendert };
}
