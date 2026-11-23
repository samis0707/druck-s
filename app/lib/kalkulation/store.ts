/**
 * Persistenz der Kalkulations-Stammdaten in Postgres (Pendant zu kalpri/apps/schnittstelle/
 * src/datenbank.ts, die SQLite nutzt):
 *
 * - kalkulation_bereiche: je Datenblock der Werkbank der aktuelle Stand als Text mit Version.
 * - kalkulation_verlauf: jeder gespeicherte Stand wird angehängt (Trigger verbietet UPDATE/DELETE).
 * - kalkulation_dateien: Metadaten; der Inhalt liegt im S3-Speicher von druck-s.
 *
 * Optimistische Sperre: geschrieben wird nur mit der Version, die der Schreibende kennt. Stimmt
 * sie nicht, passiert nichts („Konflikt“, die API antwortet 409). Pro Bereich serialisiert ein
 * Advisory-Lock in der Transaktion die Prüfung, damit zwei gleichzeitige Schreiber nie beide
 * gewinnen.
 */
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { PoolClient } from "pg";
import { query, withTx } from "../db";
import { getStorage, bucketName } from "../storage";
import { BEREICHE, SICHERUNG_ART, bereich } from "./bereiche";

export const DATEI_MAX = 50 * 1024 * 1024;

export type BereichStand = {
  schluessel: string;
  json: string;
  version: number;
  geaendertAm: string;
  geaendertVon: string;
};

export type Schreiben =
  | { ok: true; version: number }
  | { ok: false; art: "konflikt"; version: number }
  | { ok: false; art: "unbekannt" | "ungueltig"; meldung: string };

export type DateiKopf = { id: string; groesse: number; typ: string; name: string; angelegtAm: string };

/** Austauschbarer Dateispeicher (S3 in Produktion, Speicher im Test). */
export interface DateiSpeicher {
  put(key: string, daten: Uint8Array, typ: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}

export const s3DateiSpeicher: DateiSpeicher = {
  async put(key, daten, typ) {
    await getStorage().send(
      new PutObjectCommand({ Bucket: bucketName(), Key: key, Body: daten, ContentType: typ }),
    );
  },
  async get(key) {
    try {
      const r = await getStorage().send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
      return r.Body ? await r.Body.transformToByteArray() : null;
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  },
  async remove(key) {
    await getStorage().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
  },
};

type Zeile = { schluessel: string; json: string; version: number; geaendert_am: Date; geaendert_von: string };
const alsStand = (z: Zeile): BereichStand => ({
  schluessel: z.schluessel,
  json: z.json,
  version: z.version,
  geaendertAm: z.geaendert_am.toISOString(),
  geaendertVon: z.geaendert_von,
});

export async function alleBereiche(): Promise<BereichStand[]> {
  const r = await query<Zeile>(
    "SELECT schluessel, json, version, geaendert_am, geaendert_von FROM kalkulation_bereiche ORDER BY schluessel",
  );
  return r.rows.map(alsStand);
}

export async function bereichVersion(schluessel: string): Promise<number> {
  const r = await query<{ version: number }>("SELECT version FROM kalkulation_bereiche WHERE schluessel = $1", [
    schluessel,
  ]);
  return r.rows[0]?.version ?? 0;
}

export async function istLeer(): Promise<boolean> {
  const r = await query<{ n: string }>("SELECT count(*)::text AS n FROM kalkulation_bereiche");
  return Number(r.rows[0]?.n ?? 0) === 0;
}

/** Summe der Versionen: ändert sich bei jedem Schreiben (Schlüssel für den Zwischenspeicher). */
export async function stand(): Promise<number> {
  const r = await query<{ s: string }>("SELECT COALESCE(SUM(version), 0)::text AS s FROM kalkulation_bereiche");
  return Number(r.rows[0]?.s ?? 0);
}

async function sperren(c: PoolClient, schluessel: string): Promise<void> {
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`kalkulation:${schluessel}`]);
}

async function anhaengen(
  c: PoolClient,
  schluessel: string,
  json: string,
  version: number,
  von: string,
  anlass: string,
): Promise<void> {
  await c.query(
    `INSERT INTO kalkulation_bereiche (schluessel, json, version, geaendert_am, geaendert_von)
     VALUES ($1, $2, $3, now(), $4)
     ON CONFLICT (schluessel) DO UPDATE SET json = EXCLUDED.json, version = EXCLUDED.version,
       geaendert_am = now(), geaendert_von = EXCLUDED.geaendert_von`,
    [schluessel, json, version, von],
  );
  await c.query(
    "INSERT INTO kalkulation_verlauf (schluessel, version, json, von, anlass) VALUES ($1, $2, $3, $4, $5)",
    [schluessel, version, json, von, anlass.slice(0, 200)],
  );
}

type Plan = { schluessel: string; json: string; version: number; gleich: boolean };

/** Mehrere Bereiche in einer Transaktion: alle oder keiner; Konflikt in einem = keiner. */
export async function schreibenMehrere(
  eintraege: readonly { schluessel: string; json: string; erwartet: number }[],
  von: string,
  anlass: string,
): Promise<{ ok: true; versionen: Record<string, number> } | Exclude<Schreiben, { ok: true }>> {
  for (const e of eintraege) {
    const b = bereich(e.schluessel);
    if (b === undefined) return { ok: false, art: "unbekannt", meldung: `Bereich ${e.schluessel}` };
    const fehler = b.pruefe(e.json);
    if (fehler !== null) return { ok: false, art: "ungueltig", meldung: `${b.name}: ${fehler}` };
  }
  return withTx(async (c) => {
    // feste Reihenfolge, damit sich gleichzeitige Mehrfach-Schreiber nicht gegenseitig sperren
    for (const k of [...new Set(eintraege.map((e) => e.schluessel))].sort()) await sperren(c, k);
    const plan: Plan[] = [];
    for (const e of eintraege) {
      const alt = await c.query<{ json: string; version: number }>(
        "SELECT json, version FROM kalkulation_bereiche WHERE schluessel = $1",
        [e.schluessel],
      );
      const aktuell = alt.rows[0]?.version ?? 0;
      if (aktuell !== e.erwartet) return { ok: false as const, art: "konflikt" as const, version: aktuell };
      const gleich = alt.rows[0] !== undefined && alt.rows[0].json === e.json;
      plan.push({ schluessel: e.schluessel, json: e.json, version: gleich ? aktuell : aktuell + 1, gleich });
    }
    for (const p of plan) if (!p.gleich) await anhaengen(c, p.schluessel, p.json, p.version, von, anlass);
    return { ok: true as const, versionen: Object.fromEntries(plan.map((p) => [p.schluessel, p.version])) };
  });
}

export async function schreiben(
  schluessel: string,
  json: string,
  erwartet: number,
  von: string,
  anlass = "werkbank",
): Promise<Schreiben> {
  const r = await schreibenMehrere([{ schluessel, json, erwartet }], von, anlass);
  if (r.ok) return { ok: true, version: r.versionen[schluessel] ?? erwartet };
  return r;
}

/** Wie importieren() in kalpri: nur in eine leere Datenbank, außer `ersetzen`. */
export async function importieren(
  sicherung: unknown,
  von: string,
  ersetzen = false,
): Promise<{ ok: true; bereiche: string[] } | { ok: false; meldungen: string[] }> {
  if (!ersetzen && !(await istLeer()))
    return { ok: false, meldungen: ["Datenbank ist nicht leer – Import nur mit „ersetzen“"] };
  const pruefung = pruefeSicherung(sicherung);
  if (!pruefung.ok) return { ok: false, meldungen: pruefung.meldungen };
  const aktuell = new Map((await alleBereiche()).map((b) => [b.schluessel, b.version]));
  const r = await schreibenMehrere(
    pruefung.bereiche.map((b) => ({ schluessel: b.schluessel, json: b.json, erwartet: aktuell.get(b.schluessel) ?? 0 })),
    von,
    "import",
  );
  if (!r.ok) return { ok: false, meldungen: ["Import fehlgeschlagen (inzwischen woanders gespeichert) – bitte erneut"] };
  return { ok: true, bereiche: pruefung.bereiche.map((b) => b.schluessel) };
}

/** Sicherung prüfen (Format und jeder Bereich mit seinem Schema), ohne etwas zu schreiben. */
export function pruefeSicherung(
  sicherung: unknown,
): { ok: true; bereiche: { schluessel: string; name: string; json: string }[]; datum: string | null } | { ok: false; meldungen: string[] } {
  const s = sicherung as { art?: unknown; datum?: unknown; daten?: Record<string, unknown> } | null;
  const daten = s?.daten;
  if (typeof daten !== "object" || daten === null || Array.isArray(daten))
    return { ok: false, meldungen: ["Das ist keine Sicherung der Werkbank (Feld „daten“ fehlt)."] };
  if (s?.art !== undefined && s.art !== SICHERUNG_ART)
    return { ok: false, meldungen: [`Unbekannte Art „${String(s.art)}“ – erwartet wird „${SICHERUNG_ART}“.`] };
  const meldungen: string[] = [];
  const bereiche: { schluessel: string; name: string; json: string }[] = [];
  for (const b of BEREICHE) {
    const wert = daten[b.schluessel];
    if (wert === undefined) continue;
    const json = typeof wert === "string" ? wert : JSON.stringify(wert);
    const f = b.pruefe(json);
    if (f !== null) meldungen.push(`${b.name}: ${f}`);
    else bereiche.push({ schluessel: b.schluessel, name: b.name, json });
  }
  if (meldungen.length === 0 && bereiche.length === 0)
    meldungen.push("Die Sicherung enthält keinen bekannten Datenbereich.");
  if (meldungen.length > 0) return { ok: false, meldungen };
  return { ok: true, bereiche, datum: typeof s?.datum === "string" ? s.datum.slice(0, 10) : null };
}

/** Alle Bereiche als Sicherung der Werkbank (gleiches Format wie „Alles sichern“). */
export async function sicherung(datum: string): Promise<{
  art: string;
  version: number;
  datum: string;
  daten: Record<string, unknown>;
}> {
  const daten: Record<string, unknown> = {};
  for (const b of await alleBereiche()) daten[b.schluessel] = JSON.parse(b.json);
  return { art: SICHERUNG_ART, version: 1, datum, daten };
}

/** Rückgängig: früheren Stand als **neue** Version anhängen (der Verlauf bleibt vollständig). */
export async function zurueck(schluessel: string, version: number, erwartet: number, von: string): Promise<Schreiben> {
  const r = await query<{ json: string }>(
    "SELECT json FROM kalkulation_verlauf WHERE schluessel = $1 AND version = $2 ORDER BY nr DESC LIMIT 1",
    [schluessel, version],
  );
  if (r.rows[0] === undefined) return { ok: false, art: "unbekannt", meldung: `Version ${version} von ${schluessel}` };
  return schreiben(schluessel, r.rows[0].json, erwartet, von, `zurück auf v${version}`);
}

export async function verlauf(
  schluessel: string,
  anzahl = 50,
): Promise<{ version: number; zeit: string; von: string; anlass: string; groesse: number }[]> {
  const r = await query<{ version: number; zeit: Date; von: string; anlass: string; groesse: number }>(
    `SELECT version, zeit, von, anlass, length(json) AS groesse FROM kalkulation_verlauf
      WHERE schluessel = $1 ORDER BY nr DESC LIMIT $2`,
    [schluessel, anzahl],
  );
  return r.rows.map((z) => ({ ...z, zeit: z.zeit.toISOString() }));
}

// ---------------------------------------------------------------------------
// Dateien (Inhalt im S3-Speicher, Metadaten in Postgres)

const speicherKey = (id: string) => `kalkulation/dateien/${id}`;

export async function dateiSpeichern(
  id: string,
  daten: Uint8Array,
  name: string,
  typ: string,
  von: string,
  speicher: DateiSpeicher = s3DateiSpeicher,
): Promise<{ ok: true; datei: DateiKopf; neu: boolean } | { ok: false; meldung: string }> {
  if (!/^[0-9a-f]{64}$/.test(id)) return { ok: false, meldung: "Kennung ungültig" };
  if (daten.byteLength === 0) return { ok: false, meldung: "Datei ist leer" };
  if (daten.byteLength > DATEI_MAX) return { ok: false, meldung: "Datei ist größer als 50 MB" };
  const alt = await dateiKopf(id);
  if (alt !== null) return { ok: true, datei: alt, neu: false };
  await speicher.put(speicherKey(id), daten, "application/octet-stream");
  const r = await query<{ angelegt_am: Date }>(
    `INSERT INTO kalkulation_dateien (id, groesse, typ, name, speicher_key, von)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING RETURNING angelegt_am`,
    [id, daten.byteLength, typ.slice(0, 120), name.slice(0, 200), speicherKey(id), von.slice(0, 60)],
  );
  const kopf = await dateiKopf(id);
  return kopf === null
    ? { ok: false, meldung: "Datei nicht gespeichert" }
    : { ok: true, datei: kopf, neu: r.rows.length > 0 };
}

export async function dateiKopf(id: string): Promise<DateiKopf | null> {
  const r = await query<{ id: string; groesse: string; typ: string; name: string; angelegt_am: Date }>(
    "SELECT id, groesse::text, typ, name, angelegt_am FROM kalkulation_dateien WHERE id = $1",
    [id],
  );
  const z = r.rows[0];
  return z === undefined
    ? null
    : { id: z.id, groesse: Number(z.groesse), typ: z.typ, name: z.name, angelegtAm: z.angelegt_am.toISOString() };
}

export async function dateiLesen(
  id: string,
  speicher: DateiSpeicher = s3DateiSpeicher,
): Promise<(DateiKopf & { daten: Uint8Array }) | null> {
  const kopf = await dateiKopf(id);
  if (kopf === null) return null;
  const daten = await speicher.get(speicherKey(id));
  return daten === null ? null : { ...kopf, daten };
}

export async function dateienUmfang(): Promise<{ anzahl: number; bytes: number }> {
  const r = await query<{ n: string; b: string }>(
    "SELECT count(*)::text AS n, COALESCE(sum(groesse), 0)::text AS b FROM kalkulation_dateien",
  );
  return { anzahl: Number(r.rows[0]?.n ?? 0), bytes: Number(r.rows[0]?.b ?? 0) };
}
