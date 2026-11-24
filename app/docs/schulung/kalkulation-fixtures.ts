/**
 * Erzeugt docs/schulung/beispiele/kalkulation-fixtures.json: die Antworten der Kalkulations-Schnittstellen für
 * die Schulungs-Screenshots. Gerechnet wird mit der ECHTEN Engine und den Beispiel-Stammdaten
 * (scripts/kalkulation-beispieldaten.mjs, erfundene Beträge) — nichts davon ist ein echter Preis.
 *
 *   DATABASE_URL=postgres://dam:dam@localhost:5432/dam_hilfe node scripts/kalkulation-beispieldaten.mjs
 *   DATABASE_URL=postgres://dam:dam@localhost:5432/dam_hilfe npx tsx docs/schulung/kalkulation-fixtures.ts
 *
 * screenshots.cjs liest nur die JSON-Datei; die Datenbank wird beim Neuaufnehmen der Bilder nicht gebraucht.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ladeDaten } from "../../lib/kalkulation/daten";
import { STANDARD_PREIS_EINSTELLUNGEN, RICHTPREIS_HINWEIS } from "../../lib/kalkulation/richtpreis";
import { berechneIntern, berechneOeffentlich, oeffentlicheArtikel } from "../../lib/kalkulation/richtpreisService";
import { kalpriAnfrage } from "../../lib/kalkulation/staffApi";
import { shopFreigegeben } from "../../lib/kalkulation/schnittstelle";
import { PRODUCT_HINTS } from "../../lib/ui-text";
import { getPool } from "../../lib/db";

async function json(res: Response) {
  return res.json();
}

async function main() {
  const g = await ladeDaten();
  if (!g.ok) throw new Error("Keine Beispiel-Stammdaten in der Datenbank (scripts/kalkulation-beispieldaten.mjs ausführen).");
  const heute = "2026-11-09";
  const artikelListe = await json(await kalpriAnfrage({ methode: "GET", pfad: "/v1/artikel" }, heute));
  const erster = (artikelListe as { artikel: { id: string; titel: string }[] }).artikel[0];
  const fragen = await json(await kalpriAnfrage({ methode: "GET", pfad: `/v1/artikel/${erster.id}` }, heute));
  const art = g.daten.artikel.find((a) => a.id === erster.id)!;
  const auflagen = [100, 250, 500];
  const vorbelegung: Record<string, string> = {};
  for (const f of (fragen as { fragen: { schluessel: string; art: string; optionen: { wert: string }[] }[] }).fragen) {
    if (f.art === "auswahl" && f.optionen[0]) vorbelegung[f.schluessel] = f.optionen[0].wert;
  }
  const r = berechneIntern(g.daten, art, auflagen, vorbelegung, STANDARD_PREIS_EINSTELLUNGEN, { heute });
  if (!r.ok) throw new Error(r.meldung);
  const richtpreis = { ...r, hinweis: RICHTPREIS_HINWEIS, stichtag: heute };

  const zuordnung: Record<string, string[]> = {};
  const freigegeben = g.daten.artikel.filter(shopFreigegeben);
  if (freigegeben[0]) zuordnung["flyer"] = [freigegeben[0].id];
  if (freigegeben[1]) zuordnung["brochure"] = [freigegeben[1].id];
  const oeff = (await oeffentlicheArtikel(zuordnung)).body;
  const flyer = (oeff as { artikel: { id: string; fragen: { schluessel: string; art: string; optionen: { wert: string }[] }[] }[] }).artikel.find((a) => a.id === freigegeben[0]?.id);
  const oAntworten: Record<string, string> = {};
  for (const f of flyer?.fragen ?? []) if (f.art === "auswahl" && f.optionen[0]) oAntworten[f.schluessel] = f.optionen[0].wert;
  const oeffRechnung = (await berechneOeffentlich({ artikel: freigegeben[0].id, antworten: oAntworten, auflagen: [500] })).body;

  const out = {
    hinweis: "Erzeugt von docs/schulung/kalkulation-fixtures.ts — Beispieldaten, keine echten Preise.",
    artikelListe,
    erster,
    fragen,
    richtpreis,
    einstellungen: STANDARD_PREIS_EINSTELLUNGEN,
    kunden: {
      aktiv: true,
      zuordnung,
      produkte: PRODUCT_HINTS,
      artikel: g.daten.artikel.filter((a) => a.archiviert !== true).map((a) => ({ id: a.id, titel: a.titel, freigegeben: shopFreigegeben(a) })),
      stammdatenVorhanden: true,
    },
    oeffentlicheArtikel: oeff,
    oeffentlicheAntwort: oeffRechnung,
    ersterOeffentlicherArtikel: freigegeben[0]?.id,
  };
  writeFileSync(path.join(__dirname, "beispiele", "kalkulation-fixtures.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("geschrieben:", Object.keys(out).join(", "));
  await getPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
