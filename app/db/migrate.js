#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/* Minimal SQL migration runner (no extra deps): applies db/migrations/*.sql in order. */
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

async function appliedVersions(client) {
  const res = await client.query("SELECT version FROM schema_migrations");
  return new Set(res.rows.map((r) => r.version));
}

function splitSections(sql) {
  const marker = "--DOWN--";
  const idx = sql.indexOf(marker);
  if (idx === -1) return { up: sql, down: null };
  return { up: sql.slice(0, idx), down: sql.slice(idx + marker.length) };
}

async function up(pool, dir, files) {
  const client = await pool.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = await appliedVersions(client);
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip ${file}`);
        continue;
      }
      const { up: sql } = splitSections(
        fs.readFileSync(path.join(dir, file), "utf8"),
      );
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [
          file,
        ]);
        await client.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

async function down(pool, dir, files, target) {
  if (!files.includes(target)) throw new Error(`Unknown migration ${target}`);
  const client = await pool.connect();
  try {
    const applied = await appliedVersions(client);
    const idx = files.indexOf(target);
    const toRevert = files.slice(idx).filter((f) => applied.has(f)).reverse();
    for (const file of toRevert) {
      const { down: sql } = splitSections(
        fs.readFileSync(path.join(dir, file), "utf8"),
      );
      if (!sql || !sql.trim()) throw new Error(`No DOWN section in ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("DELETE FROM schema_migrations WHERE version = $1", [file]);
        await client.query("COMMIT");
        console.log(`reverted ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

async function main() {
  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://dam:dam@localhost:5432/dam",
  });
  try {
    const [cmd, target] = process.argv.slice(2);
    if (cmd === "down" && target) await down(pool, dir, files, target);
    else await up(pool, dir, files);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
