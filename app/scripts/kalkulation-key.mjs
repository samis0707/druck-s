#!/usr/bin/env node
/**
 * API-Schlüssel für den Maschinenzugriff auf /api/v1/kalkulation/… verwalten.
 *
 *   node scripts/kalkulation-key.mjs create "<Name>"     neuen Schlüssel anlegen (wird NUR hier einmal angezeigt)
 *   node scripts/kalkulation-key.mjs list                Schlüssel mit Präfix, Scope und letzter Nutzung
 *   node scripts/kalkulation-key.mjs revoke <id|präfix>  Schlüssel sperren
 *
 * Braucht DATABASE_URL. Gespeichert werden nur der SHA-256-Hash und das Präfix (kal_xxxxxxxx).
 * Scope ist immer „kalkulation“: lesen und kalkulieren, nie Stammdaten ändern.
 */
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const [cmd, arg] = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://dam:dam@localhost:5432/dam", max: 1 });

try {
  if (cmd === "create" && arg) {
    const key = `kal_${randomBytes(32).toString("hex")}`;
    const hash = createHash("sha256").update(key).digest("hex");
    const r = await pool.query(
      `INSERT INTO kalkulation_api_keys (name, key_hash, key_prefix, scopes, created_by) VALUES ($1, $2, $3, '{kalkulation}', 'skript') RETURNING id`,
      [arg.slice(0, 80), hash, key.slice(0, 12)],
    );
    await pool.query(
      `INSERT INTO audit_log (action, actor_type, detail) VALUES ('kalkulation_key_created', 'system', $1)`,
      [JSON.stringify({ id: r.rows[0].id, name: arg.slice(0, 80) })],
    );
    console.log(`Schlüssel angelegt (id ${r.rows[0].id}). Jetzt notieren – er wird nicht noch einmal angezeigt:\n\n  ${key}\n`);
  } else if (cmd === "list") {
    const r = await pool.query(
      "SELECT id, name, key_prefix, scopes, active, created_at, last_used_at FROM kalkulation_api_keys ORDER BY created_at",
    );
    for (const k of r.rows) {
      console.log(`${k.id}  ${k.key_prefix}…  ${k.active ? "aktiv  " : "gesperrt"}  ${k.scopes.join(",")}  ${k.name}  zuletzt: ${k.last_used_at?.toISOString() ?? "nie"}`);
    }
    if (r.rows.length === 0) console.log("Keine Schlüssel.");
  } else if (cmd === "revoke" && arg) {
    const r = await pool.query(
      "UPDATE kalkulation_api_keys SET active = false WHERE active AND (id::text = $1 OR key_prefix = $1) RETURNING id, name",
      [arg],
    );
    if (r.rowCount === 0) {
      console.error("Kein aktiver Schlüssel gefunden.");
      process.exitCode = 1;
    } else {
      for (const k of r.rows) {
        await pool.query(`INSERT INTO audit_log (action, actor_type, detail) VALUES ('kalkulation_key_revoked', 'system', $1)`, [
          JSON.stringify({ id: k.id, name: k.name }),
        ]);
        console.log(`Gesperrt: ${k.id} (${k.name})`);
      }
    }
  } else {
    console.error('Aufruf: node scripts/kalkulation-key.mjs create "<Name>" | list | revoke <id|präfix>');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
