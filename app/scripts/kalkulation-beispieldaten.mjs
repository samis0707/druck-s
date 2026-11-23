#!/usr/bin/env node
/**
 * Lädt Beispiel-Stammdaten (kalpri-Beispiel-Lager und -Produktion mit Preisen, drei Artikel, zwei
 * davon für den Shop freigegeben) in die lokale Datenbank, damit man den Richtpreis ausprobieren
 * kann. NUR für Entwicklung – nicht Teil der Migrationen.
 *
 *   DATABASE_URL=postgres://dam:dam@localhost:5432/dam node scripts/kalkulation-beispieldaten.mjs [--ersetzen]
 *
 * Ohne --ersetzen wird nur in eine leere Kalkulations-Datenbank geschrieben. Verweigert die
 * Arbeit gegen eine Datenbank, die nicht auf localhost liegt (Schutz vor Produktion), außer mit
 * --nicht-lokal. Braucht die Entwicklungsabhängigkeiten (tsx).
 */
import { register } from "tsx/esm/api";
import { register as registerCjs } from "tsx/cjs/api";

register();
registerCjs();

const args = process.argv.slice(2);
const url = process.env.DATABASE_URL ?? "postgres://dam:dam@localhost:5432/dam";
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  /* ungültige URL: unten abgelehnt */
}
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && !args.includes("--nicht-lokal")) {
  console.error(`Abbruch: ${host || "DATABASE_URL"} ist keine lokale Datenbank. Beispieldaten gehören nicht in die Produktion.`);
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && !args.includes("--nicht-lokal")) {
  console.error("Abbruch: NODE_ENV=production.");
  process.exit(1);
}

const { beispielSicherung } = await import("../lib/kalkulation/beispieldaten.ts");
const { importieren } = await import("../lib/kalkulation/store.ts");
const { getPool } = await import("../lib/db.ts");

try {
  const heute = new Date().toISOString().slice(0, 10);
  const r = await importieren(beispielSicherung(heute), "beispieldaten", args.includes("--ersetzen"));
  if (!r.ok) {
    console.error(r.meldungen.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Beispieldaten geladen: ${r.bereiche.join(", ")}`);
    console.log("Probieren: GET /api/v1/richtpreis/artikel, Mitarbeiterbereich /staff/kalkulation");
  }
} finally {
  await getPool().end();
}
