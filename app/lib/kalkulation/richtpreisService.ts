/**
 * Richtpreis-Dienst: Verbindung von Stammdaten (kalpri-Engine) und Preisschicht.
 *
 * - `berechneIntern`: Artikel + Antworten + Auflagen → Kosten, Richtpreis und Rechenweg
 *   (Mitarbeiterbereich, Ad-hoc-Kalkulation, Snapshot zur Anfrage).
 * - `oeffentlicheArtikel` / `berechneOeffentlich`: dieselbe Rechnung für Besucher ohne Login –
 *   nur für den Shop freigegebene Artikel, nur kundenverständliche Fragen, nie Kosten, Sätze,
 *   Lieferanten oder interne Hinweise.
 * - `speichereSnapshot`: Richtpreis-Snapshot zu einer Anfrage (Tabelle request_quotes).
 */
import { z } from "zod";
import { artikelFragen, type Artikel, type ArtikelAntworten, type ArtikelFrage } from "@druck/resources";
import { query } from "../db";
import herkunft from "../kalpri/HERKUNFT.json";
import { ladePreisEinstellungen } from "./einstellungen";
import { ladeDaten } from "./daten";
import {
  MAX_AUFLAGEN,
  RICHTPREIS_HINWEIS,
  richtpreis,
  type KostenEingabe,
  type PreisEinstellungen,
  type RichtpreisErgebnis,
} from "./richtpreis";
import { auflageKosten, kalkuliereArtikel, shopFreigegeben, type Daten } from "./schnittstelle";
import { heuteIso } from "./zeit";

export { MAX_AUFLAGEN };

// ---------------------------------------------------------------------------
// Fragen in kundenverständlicher Form

export type OeffentlicheFrage = {
  schluessel: string;
  titel: string;
  art: ArtikelFrage["art"];
  /** Bei „format“: Eingabe in Millimetern (breiteMm, hoeheMm). */
  einheit?: "mm";
  optionen: { wert: string; text: string }[];
};

/** „Wer macht es?“ ist eine interne Entscheidung der Druckerei und wird dem Kunden nicht gestellt. */
export const istInterneFrage = (f: Pick<ArtikelFrage, "schluessel">) => f.schluessel.endsWith(":wer");

/** Entfernt interne Kennungen aus Optionstexten („M-0012 – Bilderdruck 135 g“, „(A-0003)“). */
export function kundenText(text: string): string {
  return text
    .replace(/^[A-Za-z0-9_.-]+ – /, "")
    .replace(/\s*\([A-Za-z]+-?\d+\)\s*$/, "")
    .trim();
}

export function oeffentlicheFragen(a: Artikel, d: Daten): OeffentlicheFrage[] {
  return artikelFragen(a, d.lager, d.produktion)
    .filter((f) => !istInterneFrage(f))
    .map((f) => ({
      schluessel: f.schluessel,
      titel: f.titel,
      art: f.art,
      ...(f.art === "format" ? { einheit: "mm" as const } : {}),
      optionen: f.optionen.map((o) => ({ wert: o.wert, text: kundenText(o.text) })),
    }));
}

// ---------------------------------------------------------------------------
// Interne Rechnung

export type AuflageRichtpreis = {
  auflage: number;
  kostenZehntelcent: number;
  vollstaendig: boolean;
  ohneKosten: string[];
  richtpreis: RichtpreisErgebnis;
};

export type InterneRechnung =
  | {
      ok: true;
      artikel: { id: string; titel: string; einheit: string };
      auflagen: AuflageRichtpreis[];
      /** Nicht beantwortete Fragen (Titel), die für einen Preis nötig wären. */
      offen: string[];
      hinweise: string[];
      /** Rechenweg je Auflage und Zeile (nur Mitarbeiter). */
      zeilen: {
        auflage: number;
        zeilen: {
          titel: string;
          art: string;
          menge: number | null;
          einheit: string;
          mengeGesamt: number | null;
          kostenZehntelcent: number | null;
          zeitMs: number;
          rechenweg: string[];
          hinweise: string[];
        }[];
      }[];
      einstellungen: PreisEinstellungen;
    }
  | { ok: false; status: number; meldung: string; details?: unknown };

export function berechneIntern(
  d: Daten,
  a: Artikel,
  auflagen: readonly number[],
  antworten: ArtikelAntworten,
  einstellungen: PreisEinstellungen,
  opts: { nurOeffentlicheFragen?: boolean; heute?: string } = {},
): InterneRechnung {
  const heute = opts.heute ?? heuteIso();
  const rech = kalkuliereArtikel(d, a, auflagen, antworten, heute);
  if (!rech.ok) return rech;
  const fragen = artikelFragen(a, d.lager, d.produktion).filter((f) => !(opts.nurOeffentlicheFragen && istInterneFrage(f)));
  const offen = fragen.filter((f) => !(f.schluessel in antworten)).map((f) => f.titel);
  const liste: AuflageRichtpreis[] = rech.ergebnis.auflagen.map((x) => {
    const k = auflageKosten(rech.kalkulation, x, d);
    const eingabe: KostenEingabe = {
      auflage: k.auflage,
      kostenZehntelcent: k.kostenZehntelcent,
      vollstaendig: k.vollstaendig,
      ohneKosten: k.ohneKosten,
      offen,
    };
    return {
      auflage: k.auflage,
      kostenZehntelcent: k.kostenZehntelcent,
      vollstaendig: k.vollstaendig,
      ohneKosten: k.ohneKosten,
      richtpreis: richtpreis(eingabe, einstellungen),
    };
  });
  return {
    ok: true,
    artikel: { id: a.id, titel: a.titel, einheit: a.einheit },
    auflagen: liste,
    offen,
    hinweise: rech.hinweise,
    zeilen: rech.ergebnis.auflagen.map((x) => ({
      auflage: x.auflage,
      zeilen: x.zeilen.map((z) => ({
        titel: z.titel,
        art: z.art,
        menge: z.menge,
        einheit: z.einheit,
        mengeGesamt: z.mengeGesamt,
        kostenZehntelcent: z.kostenMitZeilenaufschlag?.zehntelcent ?? z.kostenVoll?.zehntelcent ?? null,
        zeitMs: z.zeitMs,
        rechenweg: z.rechenweg,
        hinweise: z.hinweise,
      })),
    })),
    einstellungen,
  };
}

// ---------------------------------------------------------------------------
// Öffentlich

/** Ergebnis der öffentlichen Rechnung: HTTP-Status und Rumpf (deutsche Fehlertexte). */
export type OeffentlicheAntwort = { status: number; body: Record<string, unknown> };

const FormatMmSchema = z
  .object({
    breiteMm: z.number({ invalid_type_error: "Breite muss eine Zahl sein" }).int("Breite in ganzen Millimetern").min(10, "Breite mindestens 10 mm").max(3000, "Breite höchstens 3000 mm"),
    hoeheMm: z.number({ invalid_type_error: "Höhe muss eine Zahl sein" }).int("Höhe in ganzen Millimetern").min(10, "Höhe mindestens 10 mm").max(3000, "Höhe höchstens 3000 mm"),
  })
  .strict("Format nur mit breiteMm und hoeheMm");

export const RichtpreisAnfrageSchema = z
  .object(
    {
      artikel: z
        .string({ required_error: "Artikel fehlt", invalid_type_error: "Artikel muss ein Text sein" })
        .min(1, "Artikel fehlt")
        .max(80, "Artikel-Kennung zu lang"),
      antworten: z
        .record(
          z.string().max(80, "Name der Frage zu lang"),
          z.union([z.string().max(200, "Antwort zu lang"), FormatMmSchema], {
            errorMap: () => ({ message: "Antwort muss ein Text oder ein Format {breiteMm, hoeheMm} sein" }),
          }),
          { invalid_type_error: "Antworten müssen ein Objekt sein" },
        )
        .optional(),
      auflagen: z
        .array(
          z
            .number({ invalid_type_error: "Auflage muss eine Zahl sein" })
            .int("Auflage muss eine ganze Zahl sein")
            .min(1, "Auflage mindestens 1")
            .max(1_000_000, "Auflage höchstens 1.000.000"),
          { required_error: "Auflagen fehlen", invalid_type_error: "Auflagen müssen eine Liste sein" },
        )
        .min(1, "Mindestens eine Auflage angeben")
        .max(MAX_AUFLAGEN, `Höchstens ${MAX_AUFLAGEN} Auflagen`),
    },
    { invalid_type_error: "Anfrage muss ein JSON-Objekt sein" },
  )
  .strict("Unbekanntes Feld in der Anfrage");

export type RichtpreisAnfrage = z.infer<typeof RichtpreisAnfrageSchema>;

/** Antworten gegen die Fragen des Artikels prüfen und in die Form der Engine bringen (µm). */
export function pruefeAntworten(
  fragen: readonly OeffentlicheFrage[],
  roh: NonNullable<RichtpreisAnfrage["antworten"]>,
): { ok: true; antworten: ArtikelAntworten } | { ok: false; details: { pfad: string; meldung: string }[] } {
  const details: { pfad: string; meldung: string }[] = [];
  const antworten: Record<string, string | { breiteUm: number; hoeheUm: number }> = {};
  const nachSchluessel = new Map(fragen.map((f) => [f.schluessel, f]));
  for (const [schluessel, wert] of Object.entries(roh)) {
    const f = nachSchluessel.get(schluessel);
    const pfad = `antworten.${schluessel}`;
    if (!f) {
      details.push({ pfad, meldung: "Diese Frage gibt es für den Artikel nicht" });
      continue;
    }
    if (f.art === "format") {
      if (typeof wert === "string") details.push({ pfad, meldung: "Format als {breiteMm, hoeheMm} angeben" });
      else antworten[schluessel] = { breiteUm: wert.breiteMm * 1000, hoeheUm: wert.hoeheMm * 1000 };
      continue;
    }
    if (typeof wert !== "string") {
      details.push({ pfad, meldung: "Antwort muss ein Text sein" });
      continue;
    }
    if (f.art === "auswahl") {
      if (!f.optionen.some((o) => o.wert === wert)) details.push({ pfad, meldung: "Diese Auswahl gibt es nicht" });
      else antworten[schluessel] = wert;
    } else if (f.art === "zahl") {
      if (!/^\d{1,6}$/.test(wert) || Number(wert) < 1) details.push({ pfad, meldung: "Bitte eine ganze Zahl ab 1 angeben" });
      else antworten[schluessel] = String(Number(wert));
    } else {
      if (wert.trim() === "" || wert.length > 80 || /[\u0000-\u001f]/.test(wert)) details.push({ pfad, meldung: "Bitte einen kurzen Text (höchstens 80 Zeichen) angeben" });
      else antworten[schluessel] = wert.trim();
    }
  }
  return details.length > 0 ? { ok: false, details } : { ok: true, antworten };
}

const GENERISCH = "Für diese Angaben nennen wir den Preis gern auf Anfrage.";

/** Artikelliste für den öffentlichen Richtpreis: nur Freigegebenes, ohne interne Angaben. */
export async function oeffentlicheArtikel(zuordnung: Record<string, string[]> = {}): Promise<OeffentlicheAntwort> {
  const g = await ladeDaten();
  if (!g.ok) return { status: 503, body: { error: "Der Richtpreis-Rechner ist gerade nicht verfügbar.", code: "nicht_verfuegbar" } };
  const artikel = g.daten.artikel.filter(shopFreigegeben).map((a) => ({
    id: a.id,
    titel: a.titel,
    einheit: a.einheit,
    text: a.shopText ?? null,
    /** Produkte der Anfrage (z. B. „flyer“), zu denen die Druckerei den Artikel zugeordnet hat. */
    produkte: Object.entries(zuordnung).filter(([, ids]) => ids.includes(a.id)).map(([slug]) => slug),
    fragen: oeffentlicheFragen(a, g.daten),
  }));
  return { status: 200, body: { aktiv: true, artikel, maxAuflagen: MAX_AUFLAGEN } };
}

/** POST /api/v1/richtpreis (nach der Begrenzung je IP, die der Route-Handler macht). */
export async function berechneOeffentlich(rumpf: unknown): Promise<OeffentlicheAntwort> {
  const e = RichtpreisAnfrageSchema.safeParse(rumpf);
  if (!e.success) {
    return {
      status: 400,
      body: {
        error: "Die Anfrage ist ungültig.",
        code: "ungueltig",
        details: e.error.issues.map((i) => ({ pfad: i.path.join("."), meldung: i.message })),
      },
    };
  }
  const g = await ladeDaten();
  if (!g.ok) return { status: 503, body: { error: "Der Richtpreis-Rechner ist gerade nicht verfügbar.", code: "nicht_verfuegbar" } };
  const a = g.daten.artikel.find((x) => x.id === e.data.artikel);
  // nicht freigegebene Artikel verhalten sich wie nicht vorhandene (nichts über Interna verraten)
  if (!a || !shopFreigegeben(a)) return { status: 404, body: { error: "Diesen Artikel gibt es nicht.", code: "nicht_gefunden" } };
  const fragen = oeffentlicheFragen(a, g.daten);
  const p = pruefeAntworten(fragen, e.data.antworten ?? {});
  if (!p.ok) return { status: 400, body: { error: "Die Angaben sind ungültig.", code: "ungueltig", details: p.details } };
  const einst = await ladePreisEinstellungen();
  const r = berechneIntern(g.daten, a, e.data.auflagen, p.antworten, einst, { nurOeffentlicheFragen: true });
  if (!r.ok) return { status: 422, body: { error: "Dieser Artikel lässt sich so nicht berechnen.", code: "nicht_berechenbar" } };
  return {
    status: 200,
    body: {
      artikel: { id: r.artikel.id, titel: r.artikel.titel },
      kennzeichnung: "unverbindlicher Richtpreis",
      hinweis: RICHTPREIS_HINWEIS,
      waehrung: "EUR",
      auflagen: r.auflagen.map((x) => oeffentlichesErgebnis(x.richtpreis, r.offen)),
    },
  };
}

/** Nur Preise, Spanne und generische Gründe – nie Kosten oder interne Texte. */
export function oeffentlichesErgebnis(r: RichtpreisErgebnis, offen: readonly string[]) {
  if (r.status === "auf_anfrage") {
    return {
      auflage: r.auflage,
      status: r.status,
      kennzeichnung: r.kennzeichnung,
      gruende: offen.length > 0 ? [`Angaben fehlen: ${offen.join(", ")}`] : [GENERISCH],
    };
  }
  return {
    auflage: r.auflage,
    status: r.status,
    netto: { vonCent: r.von.nettoCent, richtpreisCent: r.preis.nettoCent, bisCent: r.bis.nettoCent },
    brutto: { vonCent: r.von.bruttoCent, richtpreisCent: r.preis.bruttoCent, bisCent: r.bis.bruttoCent },
    mwstProzent: r.mwstProzent,
    jeStueckNettoZehntelcent: r.jeStueckZehntelcent,
    je1000NettoCent: r.je1000Cent,
  };
}

// ---------------------------------------------------------------------------
// Snapshot zu einer Anfrage

export type RichtpreisSnapshot = {
  id: string;
  requestId: string;
  artikelId: string;
  artikelTitel: string | null;
  antworten: Record<string, unknown>;
  auflagen: number[];
  ergebnis: Record<string, unknown>;
  preisEinstellungen: PreisEinstellungen;
  kalpriHerkunft: Record<string, unknown> | null;
  createdAt: string;
};

export function kalpriHerkunft(): Record<string, unknown> {
  return { commit: herkunft.commit, datum: herkunft.datum };
}

/**
 * Richtpreis rechnen und als Snapshot an die Anfrage hängen (Eingaben, Ergebnis, damalige
 * Einstellungen). Gespeichert wird das Ergebnis der Mitarbeiter-Sicht (mit Kosten).
 */
export async function berechneUndSpeichere(
  requestId: string,
  artikelId: string,
  antworten: ArtikelAntworten,
  auflagen: readonly number[],
): Promise<{ ok: true; snapshot: RichtpreisSnapshot } | { ok: false; status: number; meldung: string }> {
  if (auflagen.length < 1 || auflagen.length > MAX_AUFLAGEN) return { ok: false, status: 400, meldung: `1 bis ${MAX_AUFLAGEN} Auflagen` };
  const g = await ladeDaten();
  if (!g.ok) return { ok: false, status: 503, meldung: "Keine Stammdaten" };
  const a = g.daten.artikel.find((x) => x.id === artikelId);
  if (!a) return { ok: false, status: 404, meldung: "Artikel nicht gefunden" };
  const einst = await ladePreisEinstellungen();
  const r = berechneIntern(g.daten, a, auflagen, antworten, einst);
  if (!r.ok) return { ok: false, status: r.status, meldung: r.meldung };
  const snapshot = await speichereSnapshot(requestId, a.id, antworten, [...auflagen], { artikel: r.artikel, auflagen: r.auflagen, offen: r.offen, hinweise: r.hinweise }, einst);
  return { ok: true, snapshot: { ...snapshot, artikelTitel: a.titel } };
}

export async function speichereSnapshot(
  requestId: string,
  artikelId: string,
  antworten: ArtikelAntworten,
  auflagen: number[],
  ergebnis: Record<string, unknown>,
  einstellungen: PreisEinstellungen,
): Promise<RichtpreisSnapshot> {
  const r = await query<{ id: string; created_at: Date }>(
    `INSERT INTO request_quotes (request_id, artikel_id, antworten, auflagen, ergebnis, preis_einstellungen, kalpri_herkunft)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
    [requestId, artikelId, JSON.stringify(antworten), auflagen, JSON.stringify(ergebnis), JSON.stringify(einstellungen), JSON.stringify(kalpriHerkunft())],
  );
  return {
    id: r.rows[0].id,
    requestId,
    artikelId,
    artikelTitel: null,
    antworten: antworten as Record<string, unknown>,
    auflagen,
    ergebnis,
    preisEinstellungen: einstellungen,
    kalpriHerkunft: kalpriHerkunft(),
    createdAt: r.rows[0].created_at.toISOString(),
  };
}

/** Snapshots einer Anfrage, neueste zuerst (Mitarbeiter-Ansicht). */
export async function ladeSnapshots(requestId: string): Promise<RichtpreisSnapshot[]> {
  const r = await query<{
    id: string;
    request_id: string;
    artikel_id: string;
    antworten: Record<string, unknown>;
    auflagen: number[];
    ergebnis: Record<string, unknown>;
    preis_einstellungen: PreisEinstellungen;
    kalpri_herkunft: Record<string, unknown> | null;
    created_at: Date;
  }>(`SELECT * FROM request_quotes WHERE request_id = $1 ORDER BY created_at DESC, id`, [requestId]);
  return r.rows.map((z) => ({
    id: z.id,
    requestId: z.request_id,
    artikelId: z.artikel_id,
    artikelTitel: (z.ergebnis as { artikel?: { titel?: string } }).artikel?.titel ?? null,
    antworten: z.antworten,
    auflagen: z.auflagen,
    ergebnis: z.ergebnis,
    preisEinstellungen: z.preis_einstellungen,
    kalpriHerkunft: z.kalpri_herkunft,
    createdAt: z.created_at.toISOString(),
  }));
}
