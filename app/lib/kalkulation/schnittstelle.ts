/**
 * Aus kalpri/apps/schnittstelle/src/api.ts übernommen (Logik der Endpunkte unverändert, ohne die
 * Shop-Datei-Auslieferung); Erweiterungen für druck-s stehen unten (kalkuliereArtikel).
 *
 * Schnittstelle (T159), erste Fassung: Artikel, Kalkulationen und Tätigkeiten abfragen und einen
 * Artikel kalkulieren. Reine Funktion ohne Netz – `anfrage()` bekommt Methode, Pfad, Abfrage und
 * Rumpf und gibt Status und Antwort zurück. Der kleine Server (`server.mjs`) ruft sie auf; ein
 * anderer Rahmen (Express, Fastify, Cloud-Funktion) kann dasselbe tun.
 *
 * Grundsätze:
 * - Ausgegeben werden **Kosten** (Vollkosten mit Lieferanten-Aufschlägen, ohne Gewinn). VV und
 *   Gewinn rechnet Paginanet bzw. später die Preisregeln je Kundengruppe dazu.
 * - Keine Stundensätze, Personalanteile oder Lieferanten-Konditionen nach außen.
 * - Einmalige Werkzeugkosten (Stanzform) stehen getrennt.
 * - Ein- und Ausgaben sind mit zod beschrieben (AGENTS-Regel 9).
 */
import {
  artikelFragen,
  artikelMitAntworten,
  guenstigsteMaschinen,
  kalkulationAusProdukt,
  kalkulationHinzufuegen,
  leereKalkulationen,
  pruefeArtikelbestand,
  pruefeKalkulationen,
  pruefeLager,
  pruefeProduktion,
  pruefeWerkzeuge,
  rechneKalkulation,
  schrittImWeg,
  type Artikel,
  type ArtikelAntworten,
  type AuflagenErgebnis,
  type Kalkulation,
  type KalkulationsErgebnis,
  type Lager,
  type Produktion,
} from '@druck/resources';
import { z } from 'zod/v3';

/** decodeURIComponent, das bei ungültiger %-Kodierung nicht wirft (der Rohtext bleibt, die Suche scheitert dann normal mit 404). */
function dekodiere(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}


export const API_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Daten

/** Alles, was die Schnittstelle liest – aus einer Sicherung der Werkbank (Start → Sicherung). */
export type Daten = {
  produktion: Produktion;
  lager: Lager;
  artikel: Artikel[];
  kalkulationen: Kalkulation[];
  /** Datum der Sicherung (JJJJ-MM-TT) oder null. */
  stand: string | null;
};

const SicherungSchema = z.object({
  datum: z.string().optional(),
  daten: z.record(z.string(), z.unknown()),
});

/** Liest eine Sicherung der Werkbank (JSON-Objekt) und prüft jeden Teil mit seinem Schema. */
export function datenAusSicherung(
  roh: unknown,
): { ok: true; daten: Daten } | { ok: false; fehler: string[] } {
  const s = SicherungSchema.safeParse(roh);
  if (!s.success)
    return { ok: false, fehler: ['keine Sicherung der Werkbank (Feld „daten“ fehlt)'] };
  const d = s.data.daten;
  const fehler: string[] = [];
  const p = pruefeProduktion(d['werkbank.produktion.v1']);
  const l = pruefeLager(d['werkbank.material.v1']);
  const w = pruefeWerkzeuge(d['werkbank.werkzeuge.v1'] ?? { version: 1, stanzformen: [] });
  const a = pruefeArtikelbestand(d['werkbank.artikel.v1'] ?? { version: 1, artikel: [] });
  const k = pruefeKalkulationen(d['werkbank.kalkulation.v1'] ?? { version: 1, kalkulationen: [] });
  if (!p.ok) fehler.push('Produktion ungültig');
  if (!l.ok) fehler.push('Material ungültig');
  if (!w.ok) fehler.push('Werkzeuge ungültig');
  if (!a.ok) fehler.push('Artikel ungültig');
  if (!k.ok) fehler.push('Kalkulationen ungültig');
  if (!p.ok || !l.ok || !w.ok || !a.ok || !k.ok) return { ok: false, fehler };
  return {
    ok: true,
    daten: {
      produktion: p.wert,
      lager: { ...l.wert, stanzformen: w.wert.stanzformen },
      artikel: a.wert.artikel,
      kalkulationen: k.wert.kalkulationen,
      stand: s.data.datum?.slice(0, 10) ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Ein- und Ausgaben

const FormatSchema = z.object({
  breiteUm: z.number().int().positive(),
  hoeheUm: z.number().int().positive(),
});

/** POST /v1/artikel/{id}/kalkulieren */
export const KalkulierenSchema = z
  .object({
    auflagen: z
      .array(z.number().int().positive().max(10_000_000), {
        required_error: 'Auflagen fehlen',
      })
      .min(1, 'mindestens eine Auflage')
      .max(10, 'höchstens 10 Auflagen'),
    /** Antworten auf die Fragen des Artikels (GET /v1/artikel/{id} → fragen). */
    antworten: z
      .record(z.string().max(80), z.union([z.string().max(200), FormatSchema]))
      .optional(),
  })
  .strict();

export type Kalkulieren = z.infer<typeof KalkulierenSchema>;

/** Kosten einer Auflage, in Zehntelcent (ganze Zahl) und als Text. */
export type AuflageKosten = {
  auflage: number;
  /** Vollkosten mit Lieferanten-Aufschlägen, ohne Gewinn (wie „für Paginanet“). */
  kostenZehntelcent: number;
  kosten: string;
  jeStueckZehntelcent: number;
  /** Darin: einmalige Werkzeugkosten (z. B. neue Stanzform); fallen bei Nachbestellung weg. */
  werkzeugEinmaligZehntelcent: number;
  /** false: Mindestens eine Zeile hat keine Kosten (fehlender Preis) – Betrag ist zu niedrig. */
  vollstaendig: boolean;
  /** Zeilen ohne Kosten, z. B. „Material: Graupappe“. */
  ohneKosten: string[];
};

// ---------------------------------------------------------------------------
// Antworten

export type Antwort = { status: number; body: unknown };

export const ok = (body: unknown): Antwort => ({ status: 200, body });
export const fehler = (status: number, meldung: string, details?: unknown): Antwort => ({
  status,
  body: details === undefined ? { fehler: meldung } : { fehler: meldung, details },
});

export function euro(zc: number): string {
  return `${(zc / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function auflageKosten(k: Kalkulation, a: AuflagenErgebnis, d: Daten): AuflageKosten {
  const ohne: string[] = [];
  a.zeilen.forEach((z, i) => {
    if (z.kostenVoll !== null) return;
    const zl = k.zeilen[i];
    if (zl?.art === 'material') {
      const m = d.lager.materialien.find((x) => x.id === zl.materialId);
      ohne.push(`Material: ${m?.sorte ?? zl.materialId}`);
    } else if (zl?.art === 'zukauf') ohne.push(`Zukauf: ${zl.bezeichnung ?? 'ohne Preis'}`);
    else if (zl?.art === 'arbeitsgang') {
      ohne.push(
        `Arbeit: ${d.produktion.arbeitsschritte.find((s) => s.id === zl.schrittId)?.name ?? zl.schrittId}`,
      );
    }
  });
  // Material ohne Preis rechnet 0 € (Zeile hat Kosten 0, aber einen Hinweis) – auch melden
  a.zeilen.forEach((z) => {
    for (const h of z.hinweise) if (/kein Preis/i.test(h)) ohne.push(h);
  });
  // Zukauf mit Preis 0 (noch kein Lieferantenpreis)
  k.zeilen.forEach((zl, i) => {
    if (zl.art === 'zukauf' && (a.zeilen[i]?.kostenVoll?.zehntelcent ?? 0) === 0)
      ohne.push(`Zukauf: ${zl.bezeichnung ?? 'ohne Preis'} – Preis vom Lieferanten fehlt`);
  });
  const kosten = a.kostenMitZeilenaufschlag.zehntelcent;
  const unique = [...new Set(ohne)];
  return {
    auflage: a.auflage,
    kostenZehntelcent: kosten,
    kosten: euro(kosten),
    jeStueckZehntelcent: a.auflage > 0 ? Math.round(kosten / a.auflage) : 0,
    werkzeugEinmaligZehntelcent: a.zeilen.reduce((n, z) => n + (z.werkzeugZehntelcent ?? 0), 0),
    vollstaendig: a.vollstaendig && unique.length === 0,
    ohneKosten: unique,
  };
}

export function artikelKurz(a: Artikel) {
  return { id: a.id, titel: a.titel, einheit: a.einheit };
}

function stanzformenDes(a: Artikel, d: Daten) {
  return a.teile.flatMap((t) => {
    if (t.stanzformId === undefined) return [];
    const f = (d.lager.stanzformen ?? []).find((x) => x.id === t.stanzformId);
    return [
      {
        teil: t.name,
        id: t.stanzformId,
        vorhanden: f !== undefined,
        // „bezahlt“: Nachbestellung ohne Werkzeugkosten
        bezahlt: f?.bezahlt === true,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Endpunkte

function artikelListe(d: Daten): Antwort {
  return ok({ artikel: d.artikel.map(artikelKurz) });
}

function artikelEinzeln(d: Daten, id: string): Antwort {
  const a = d.artikel.find((x) => x.id === id);
  if (!a) return fehler(404, `Artikel ${id} nicht gefunden`);
  return ok({
    ...artikelKurz(a),
    beschreibung: a.beschreibung ?? null,
    /** Was beim Kalkulieren noch gewählt werden kann bzw. muss. */
    fragen: artikelFragen(a, d.lager, d.produktion),
    stanzformen: stanzformenDes(a, d),
  });
}

/** Ergebnis der Kette Artikel → Kalkulation → günstigste Maschinen → Rechnung. */
export type ArtikelRechnung =
  | {
      ok: true;
      kalkulation: Kalkulation;
      ergebnis: KalkulationsErgebnis;
      /** Nicht beantwortete Fragen (Schlüssel): bei einer Auswahl gilt der erste Wert, Offenes bleibt offen. */
      offen: string[];
      hinweise: string[];
    }
  | { ok: false; status: number; meldung: string; details?: unknown };

/** Die Kette hinter POST /v1/artikel/{id}/kalkulieren – auch für Richtpreis und Ad-hoc-Kalkulation. */
export function kalkuliereArtikel(
  d: Daten,
  a: Artikel,
  auflagen: readonly number[],
  antworten: ArtikelAntworten,
  heute: string,
): ArtikelRechnung {
  const produkt = artikelMitAntworten(a, antworten);
  const v = kalkulationAusProdukt(produkt, d.produktion, d.lager, {
    titel: a.titel,
    auflagen: [...auflagen],
    erstelltAm: heute,
    artikelId: a.id,
  });
  const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
  if (!r.ok) return { ok: false, status: 422, meldung: 'Artikel lässt sich so nicht kalkulieren', details: r.fehler };
  const roh = r.wert.kalkulationen[0];
  if (!roh) return { ok: false, status: 500, meldung: 'keine Kalkulation entstanden' };
  // wie in der Werkbank: je Arbeitsgang die günstigste geeignete Maschine
  const g = guenstigsteMaschinen(roh, d.produktion, d.lager, heute);
  const ergebnis = rechneKalkulation(g.kalkulation, d.produktion, d.lager, heute);
  const offen = artikelFragen(a, d.lager, d.produktion)
    .map((f) => f.schluessel)
    .filter((k) => !(k in antworten));
  return {
    ok: true,
    kalkulation: g.kalkulation,
    ergebnis,
    offen,
    hinweise: [...g.wechsel.map((w) => w.text), ...v.hinweise],
  };
}

function artikelKalkulieren(d: Daten, id: string, rumpf: unknown, heute: string): Antwort {
  const a = d.artikel.find((x) => x.id === id);
  if (!a) return fehler(404, `Artikel ${id} nicht gefunden`);
  const e = KalkulierenSchema.safeParse(rumpf);
  if (!e.success) {
    return fehler(
      400,
      'Anfrage ungültig',
      e.error.issues.map((i) => ({ pfad: i.path.join('.'), meldung: i.message })),
    );
  }
  const rech = kalkuliereArtikel(d, a, e.data.auflagen, e.data.antworten ?? {}, heute);
  if (!rech.ok) return fehler(rech.status, rech.meldung, rech.details);
  return ok({
    artikel: artikelKurz(a),
    art: 'kosten',
    hinweisKosten: 'Kosten ohne Verwaltungs- und Gewinnaufschlag; Preisregeln folgen.',
    /** Nicht beantwortete Fragen (GET /v1/artikel/{id} → fragen): bei einer Auswahl gilt der
     *  erste Wert, Offenes bleibt offen – die Kosten sind dann nur vorläufig. */
    offen: rech.offen,
    auflagen: rech.ergebnis.auflagen.map((x) => auflageKosten(rech.kalkulation, x, d)),
    hinweise: rech.hinweise,
  });
}

function kalkulationListe(d: Daten, heute: string): Antwort {
  return ok({
    kalkulationen: d.kalkulationen.map((k) => {
      const e = rechneKalkulation(k, d.produktion, d.lager, heute);
      return {
        id: k.id,
        titel: k.titel,
        artikelId: k.artikelId ?? null,
        einheit: k.einheit,
        auflagen: e.auflagen.map((a) => ({
          auflage: a.auflage,
          kostenZehntelcent: a.kostenMitZeilenaufschlag.zehntelcent,
        })),
      };
    }),
  });
}

function kalkulationEinzeln(d: Daten, id: string, heute: string): Antwort {
  const k = d.kalkulationen.find((x) => x.id === id);
  if (!k) return fehler(404, `Kalkulation ${id} nicht gefunden`);
  const e = rechneKalkulation(k, d.produktion, d.lager, heute);
  return ok({
    id: k.id,
    titel: k.titel,
    artikelId: k.artikelId ?? null,
    einheit: k.einheit,
    produkt: k.produkt ?? null,
    stichworte: k.stichworte ?? [],
    art: 'kosten',
    auflagen: e.auflagen.map((a) => ({
      ...auflageKosten(k, a, d),
      // Schritte nur mit Name, Menge und Kosten – keine Stundensätze
      schritte: a.zeilen.map((z, i) => {
        const zl = k.zeilen[i];
        const name =
          zl?.art === 'arbeitsgang'
            ? (d.produktion.arbeitsschritte.find((s) => s.id === zl.schrittId)?.name ??
              zl.schrittId)
            : zl?.art === 'material'
              ? 'Material'
              : zl?.art === 'zukauf'
                ? 'Zukauf'
                : (zl?.bezeichnung ?? 'Sonstiges');
        return {
          art: zl?.art ?? 'sonstiges',
          name: zl?.bezeichnung ?? name,
          menge: z.menge,
          einheit: z.einheit,
          kostenZehntelcent: z.kostenVoll?.zehntelcent ?? null,
        };
      }),
    })),
  });
}

function taetigkeiten(d: Daten): Antwort {
  return ok({
    taetigkeiten: d.produktion.arbeitsschritte.map((s) => {
      const weg = schrittImWeg(s).imWeg;
      const maschinen = (d.produktion.arbeitsplaetze ?? [])
        .filter((p) => p.inaktiv !== true && p.schritte.some((x) => x.schrittId === s.id))
        .map((p) => ({ id: p.id, name: p.name }));
      return {
        id: s.id,
        name: s.name,
        einheit: s.einheit,
        /** Wie die Tätigkeit in eine Kalkulation kommt: Merkmal (Weiterverarbeitung), Druck,
         *  Schneiden, je Auftrag – oder nur von Hand (null). */
        imWeg: weg ?? null,
        maschinen,
      };
    }),
  });
}

// ---------------------------------------------------------------------------
// Shop-Freigabe: nur freigegebene, nicht archivierte Artikel (T186)

export function shopFreigegeben(a: Artikel): boolean {
  return a.freigegeben === true && a.archiviert !== true;
}

// ---------------------------------------------------------------------------
// Verteiler

export type Anfrage = {
  methode: string;
  /** Pfad ohne Abfrage, z. B. „/v1/artikel/A-0003“. */
  pfad: string;
  rumpf?: unknown;
};

/**
 * Beantwortet eine Anfrage. Die Prüfung des Schlüssels macht der Server vorher (er kennt die
 * Kopfzeilen); `heute` (JJJJ-MM-TT) ist der Stichtag für Preise.
 */
export function anfrage(d: Daten, a: Anfrage, heute: string): Antwort {
  const teile = a.pfad.replace(/\/+$/, '').split('/').filter(Boolean).map(dekodiere);
  const [v, bereich, id, aktion] = teile;
  if (v !== 'v1') return fehler(404, 'unbekannter Pfad – alle Pfade beginnen mit /v1');
  const get = a.methode === 'GET';
  if (bereich === 'status' && get && id === undefined) {
    return ok({
      version: API_VERSION,
      stand: d.stand,
      anzahl: {
        artikel: d.artikel.length,
        kalkulationen: d.kalkulationen.length,
        taetigkeiten: d.produktion.arbeitsschritte.length,
      },
    });
  }
  if (bereich === 'artikel') {
    if (id === undefined && get) return artikelListe(d);
    if (id !== undefined && aktion === undefined && get) return artikelEinzeln(d, id);
    if (id !== undefined && aktion === 'kalkulieren' && a.methode === 'POST')
      return artikelKalkulieren(d, id, a.rumpf, heute);
  }
  if (bereich === 'kalkulationen' && get) {
    if (id === undefined) return kalkulationListe(d, heute);
    if (aktion === undefined) return kalkulationEinzeln(d, id, heute);
  }
  if (bereich === 'taetigkeiten' && get && id === undefined) return taetigkeiten(d);
  return fehler(404, `${a.methode} ${a.pfad} gibt es nicht`);
}
