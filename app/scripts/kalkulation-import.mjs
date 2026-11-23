#!/usr/bin/env node
/**
 * Importiert eine werkbank-sicherung (JSON aus der kalpri-Werkbank: „Alles sichern“) in die
 * Kalkulations-Stammdaten. Zeigt zuerst eine Vorschau und fragt nach; schreibt einen
 * Audit-Eintrag. Jeder Bereich wird als neue Version angehängt, frühere Stände bleiben im Verlauf.
 *
 *   node scripts/kalkulation-import.mjs <sicherung.json> [--ja] [--von "Name"]
 *
 * Braucht DATABASE_URL (wie die App) und die Entwicklungsabhängigkeiten (tsx) – gedacht für
 * Entwicklung und Betrieb von einem Rechner aus, nicht für den Container. Im Mitarbeiterbereich
 * geht dasselbe unter /staff/kalkulation/stammdaten.
 */
import fs from "node:fs";
import readline from "node:readline/promises";
import { register } from "tsx/esm/api";
import { register as registerCjs } from "tsx/cjs/api";

register();
registerCjs();

const args = process.argv.slice(2);
const datei = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--von");
const vonIdx = args.indexOf("--von");
const von = (vonIdx >= 0 ? args[vonIdx + 1] : undefined) ?? "skript";
if (!datei) {
  console.error('Aufruf: node scripts/kalkulation-import.mjs <sicherung.json> [--ja] [--von "Name"]');
  process.exit(1);
}

let sicherung;
try {
  sicherung = JSON.parse(fs.readFileSync(datei, "utf8"));
} catch (e) {
  console.error(`Datei nicht lesbar oder kein JSON: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

const { vorschauImport, uebernehmeImport, LISTEN_NAMEN } = await import("../lib/kalkulation/import.ts");
const { getPool } = await import("../lib/db.ts");

const text = (z) => Object.entries(z).map(([k, n]) => `${n} ${LISTEN_NAMEN[k] ?? k}`).join(", ") || "–";

try {
  const v = await vorschauImport(sicherung);
  if (!v.ok) {
    console.error("Sicherung ungültig:\n  " + v.meldungen.join("\n  "));
    process.exitCode = 1;
  } else {
    console.log(`Sicherung vom ${v.datum ?? "unbekanntem Datum"}:`);
    for (const b of v.bereiche) {
      console.log(`  ${b.name.padEnd(32)} ${b.status.padEnd(9)} heute: ${text(b.heute)}  →  neu: ${text(b.neu)}`);
    }
    if (v.bereiche.every((b) => b.status === "gleich")) {
      console.log("Nichts zu tun: alles unverändert.");
    } else {
      let ok = args.includes("--ja");
      if (!ok) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        ok = /^(j|ja|y|yes)$/i.test((await rl.question("Übernehmen? [j/N] ")).trim());
        rl.close();
      }
      if (!ok) {
        console.log("Abgebrochen.");
      } else {
        const r = await uebernehmeImport(sicherung, { pruefsumme: v.pruefsumme, von, akteur: { typ: "system", id: null }, quelle: "skript" });
        if (r.ok) console.log(`Übernommen: ${r.bereiche.join(", ")}`);
        else {
          console.error(r.meldungen.join("\n"));
          process.exitCode = 1;
        }
      }
    }
  }
} finally {
  await getPool().end();
}
