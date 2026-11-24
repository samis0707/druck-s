/**
 * Aus kalpri/apps/schnittstelle/src/werkbank-api.ts portiert (Postgres statt SQLite, daher async;
 * Pfade, Rümpfe und Statuscodes unverändert).
 * T168: Endpunkte für die Werkbank (Daten lesen und speichern über die Datenbank).
 *
 *   GET  /v1/werkbank/daten                 alle Bereiche mit Version
 *   PUT  /v1/werkbank/daten/{schluessel}    { json, version, von? } → neue Version | 409 Konflikt
 *   GET  /v1/werkbank/sicherung             alles als Sicherung (wie „Alles sichern“)
 *   GET  /v1/werkbank/verlauf/{schluessel}  frühere Stände (ohne Inhalt)
 *   POST /v1/werkbank/import                { sicherung, ersetzen? } – nur in leere Datenbank
 *   POST /v1/werkbank/zurueck/{schluessel}  { version, aktuell } – früheren Stand als neue Version
 *   POST /v1/werkbank/ergaenzung/lieferantendaten  { datei, zuordnung?, nurVorschau? } (T174)
 *   POST /v1/werkbank/ergaenzung/datensammlung  { datei, nurVorschau? } (T175, Material + Produktion)
 */
import {
  ergaenzungEinspielen,
  lagerAlsJson,
  lagerAusJson,
  lieferantendatenEinspielen,
  produktionAlsJson,
  produktionAusJson,
} from '@druck/resources';
import { z } from 'zod/v3';
import type { Antwort } from './schnittstelle';
import * as db from './store';

const SchreibenSchema = z
  .object({
    json: z.string({ required_error: 'json fehlt' }),
    version: z.number().int().min(0),
    von: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

const ZurueckSchema = z
  .object({
    version: z.number().int().min(1),
    aktuell: z.number().int().min(1),
    von: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

const ImportSchema = z
  .object({ sicherung: z.unknown(), ersetzen: z.boolean().optional() })
  .strict();

const MATERIAL = 'werkbank.material.v1';
const PRODUKTION = 'werkbank.produktion.v1';

const ErgaenzungRumpfSchema = z
  .object({
    datei: z.unknown(),
    nurVorschau: z.boolean().optional(),
    von: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

const LieferantendatenRumpfSchema = z
  .object({
    datei: z.unknown(),
    zuordnung: z
      .object({
        hauspapier: z.record(z.string().max(120)).optional(),
        positionen: z.record(z.string().max(40)).optional(),
      })
      .strict()
      .optional(),
    nurVorschau: z.boolean().optional(),
    von: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

const fehler = (status: number, meldung: string, mehr?: Record<string, unknown>): Antwort => ({
  status,
  body: { fehler: meldung, ...(mehr ?? {}) },
});

/** Antwort für /v1/werkbank/…; null = nicht zuständig. */
export async function werkbankAnfrage(
  a: { methode: string; pfad: string; rumpf?: unknown },
  heute: string,
  /** Wer schreibt (Mitarbeiter); ersetzt das „von“ der Werkbank im Verlauf. */
  wer: string,
): Promise<Antwort | null> {
  const teile = a.pfad.split('/').filter((t) => t !== '');
  if (teile[0] !== 'v1' || teile[1] !== 'werkbank') return null;
  const [, , was, schluessel] = teile;

  if (was === 'daten' && schluessel === undefined && a.methode === 'GET')
    return { status: 200, body: { bereiche: await db.alleBereiche() } };

  if (was === 'daten' && schluessel !== undefined && a.methode === 'PUT') {
    const r = SchreibenSchema.safeParse(a.rumpf);
    if (!r.success)
      return fehler(400, 'Rumpf ungültig', { details: r.error.issues.map((i) => i.message) });
    const s = await db.schreiben(
      decodeURIComponent(schluessel),
      r.data.json,
      r.data.version,
      wer,
    );
    if (s.ok) return { status: 200, body: { version: s.version } };
    if (s.art === 'konflikt')
      return fehler(409, 'Inzwischen woanders gespeichert – bitte neu laden', {
        version: s.version,
      });
    if (s.art === 'unbekannt') return fehler(404, `Unbekannter Bereich: ${s.meldung}`);
    return fehler(422, s.meldung);
  }

  if (was === 'sicherung' && a.methode === 'GET') return { status: 200, body: await db.sicherung(heute) };

  if (was === 'verlauf' && schluessel !== undefined && a.methode === 'GET')
    return { status: 200, body: { verlauf: await db.verlauf(decodeURIComponent(schluessel)) } };

  if (was === 'zurueck' && schluessel !== undefined && a.methode === 'POST') {
    const r = ZurueckSchema.safeParse(a.rumpf);
    if (!r.success) return fehler(400, 'Rumpf ungültig');
    const z = await db.zurueck(
      decodeURIComponent(schluessel),
      r.data.version,
      r.data.aktuell,
      wer,
    );
    if (z.ok) return { status: 200, body: { version: z.version } };
    if (z.art === 'konflikt')
      return fehler(409, 'Inzwischen woanders gespeichert – Rückgängig nicht möglich', {
        version: z.version,
      });
    if (z.art === 'unbekannt') return fehler(404, `Unbekannt: ${z.meldung}`);
    return fehler(422, z.meldung);
  }

  if (was === 'ergaenzung' && schluessel === 'lieferantendaten' && a.methode === 'POST') {
    const r = LieferantendatenRumpfSchema.safeParse(a.rumpf);
    if (!r.success) return fehler(400, 'Rumpf ungültig');
    const bereich = (await db.alleBereiche()).find((b) => b.schluessel === MATERIAL);
    if (bereich === undefined) return fehler(409, 'Noch kein Material in der Datenbank');
    const lager = lagerAusJson(bereich.json);
    if (!lager.ok) return fehler(422, 'Material in der Datenbank ungültig');
    const e = lieferantendatenEinspielen(lager.wert, r.data.datei, r.data.zuordnung ?? {});
    if (!e.ok) return fehler(422, 'Lieferantendaten ungültig', { details: e.fehler });
    const antwort = {
      vorschau: e.vorschau,
      geaendert: e.geaendert,
      versionVorher: bereich.version,
    };
    if (r.data.nurVorschau === true || !e.geaendert)
      return { status: 200, body: { ...antwort, versionNachher: bereich.version } };
    const lieferant = (r.data.datei as { lieferant: string }).lieferant;
    const s = await db.schreiben(
      MATERIAL,
      lagerAlsJson(e.lager),
      bereich.version,
      wer,
      `Lieferantendaten ${lieferant}`,
    );
    if (s.ok) return { status: 200, body: { ...antwort, versionNachher: s.version } };
    if (s.art === 'konflikt')
      return fehler(409, 'Inzwischen woanders gespeichert – bitte erneut', { version: s.version });
    return fehler(422, s.meldung);
  }

  if (was === 'ergaenzung' && schluessel === 'datensammlung' && a.methode === 'POST') {
    const r = ErgaenzungRumpfSchema.safeParse(a.rumpf);
    if (!r.success) return fehler(400, 'Rumpf ungültig');
    const alle = await db.alleBereiche();
    const bm = alle.find((b) => b.schluessel === MATERIAL);
    const bp = alle.find((b) => b.schluessel === PRODUKTION);
    if (bm === undefined || bp === undefined)
      return fehler(409, 'Material oder Produktion fehlen in der Datenbank');
    const lager = lagerAusJson(bm.json);
    const produktion = produktionAusJson(bp.json);
    if (!lager.ok || !produktion.ok) return fehler(422, 'Daten in der Datenbank ungültig');
    const e = ergaenzungEinspielen(lager.wert, produktion.wert, r.data.datei);
    if (!e.ok) return fehler(422, 'Ergänzung ungültig', { details: e.fehler });
    const vorher = { [MATERIAL]: bm.version, [PRODUKTION]: bp.version };
    const antwort = { vorschau: e.vorschau, geaendert: e.geaendert, versionenVorher: vorher };
    if (r.data.nurVorschau === true || !e.geaendert)
      return { status: 200, body: { ...antwort, versionenNachher: vorher } };
    const titel = (r.data.datei as { titel: string }).titel;
    const s = await db.schreibenMehrere(
      [
        ...(e.lagerGeaendert
          ? [{ schluessel: MATERIAL, json: lagerAlsJson(e.lager), erwartet: bm.version }]
          : []),
        ...(e.produktionGeaendert
          ? [
              {
                schluessel: PRODUKTION,
                json: produktionAlsJson(e.produktion),
                erwartet: bp.version,
              },
            ]
          : []),
      ],
      wer,
      `Ergänzung ${titel}`.slice(0, 200),
    );
    if (s.ok)
      return { status: 200, body: { ...antwort, versionenNachher: { ...vorher, ...s.versionen } } };
    if (s.art === 'konflikt')
      return fehler(409, 'Inzwischen woanders gespeichert – bitte erneut', { version: s.version });
    return fehler(422, s.meldung);
  }

  if (was === 'import' && a.methode === 'POST') {
    const r = ImportSchema.safeParse(a.rumpf);
    if (!r.success) return fehler(400, 'Rumpf ungültig');
    const i = await db.importieren(r.data.sicherung, wer, r.data.ersetzen === true);
    return i.ok
      ? { status: 200, body: { importiert: i.bereiche } }
      : fehler(422, 'Import abgelehnt', { details: i.meldungen });
  }

  return fehler(404, 'Unbekannter Pfad');
}
