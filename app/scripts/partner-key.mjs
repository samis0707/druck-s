#!/usr/bin/env node
/**
 * Partner der Partner-Schnittstelle verwalten (docs/partner-api.md).
 *
 *   node scripts/partner-key.mjs create <slug> "<Name>" --webhook-url <https-url> --file-host <host> [--file-host <host>]
 *   node scripts/partner-key.mjs rotate-key <slug>
 *   node scripts/partner-key.mjs rotate-webhook-secret <slug>
 *   node scripts/partner-key.mjs update <slug> [--name "<Name>"] [--webhook-url <url>|--no-webhook] [--file-host <host> …]
 *   node scripts/partner-key.mjs activate|deactivate <slug>
 *   node scripts/partner-key.mjs list
 *
 * Braucht DATABASE_URL und BETTER_AUTH_SECRET (wie die App; daraus wird der Schlüssel für das
 * Webhook-Secret abgeleitet, siehe lib/partners/secrets.ts). API-Key und Webhook-Secret werden NUR hier einmal ausgegeben; gespeichert
 * werden der SHA-256-Hash des Keys und das verschlüsselte Secret.
 */
import { createCipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const DEFAULT_AUTH_SECRET = "dev-secret-change-in-prod"; // wie lib/config.ts

export function newPartnerKey() {
  const key = `dmp_${randomBytes(32).toString("hex")}`;
  return { key, hash: createHash("sha256").update(key).digest("hex"), prefix: key.slice(0, 12) };
}

export function newWebhookSecret() {
  return `whsec_${randomBytes(32).toString("hex")}`;
}

/** Gleiches Verfahren wie lib/partners/secrets.ts (AES-256-GCM, Schlüssel per HKDF aus BETTER_AUTH_SECRET). */
export function encryptWebhookSecret(secret, authSecret) {
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(authSecret, "utf8"), Buffer.alloc(0), "druck-s/partner-webhook-secret/v1", 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function parseArgs(argv) {
  const positional = [];
  const flags = { fileHosts: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} braucht einen Wert`);
      i += 1;
      return v;
    };
    if (a === "--webhook-url") flags.webhookUrl = next();
    else if (a === "--no-webhook") flags.webhookUrl = null;
    else if (a === "--file-host") flags.fileHosts.push(next().trim().toLowerCase());
    else if (a === "--name") flags.name = next();
    else if (a === "--allow-http") flags.allowHttp = true;
    else if (a.startsWith("--")) throw new Error(`Unbekannte Option ${a}`);
    else positional.push(a);
  }
  return { positional, flags };
}

export function checkWebhookUrl(url, allowHttp = false) {
  const u = new URL(url);
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) {
    throw new Error("Webhook-URL muss https:// sein (lokal: --allow-http)");
  }
  return u.toString();
}

export function checkFileHost(host) {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    throw new Error(`Ungültiger Datei-Host: ${host} (nur Hostname, ohne https:// und Pfad)`);
  }
  return host;
}

function usage() {
  console.error(
    [
      "Verwendung:",
      '  partner-key.mjs create <slug> "<Name>" --webhook-url <url> --file-host <host> [--file-host <host>]',
      "  partner-key.mjs rotate-key <slug>",
      "  partner-key.mjs rotate-webhook-secret <slug>",
      '  partner-key.mjs update <slug> [--name "<Name>"] [--webhook-url <url>|--no-webhook] [--file-host <host> ...]',
      "  partner-key.mjs activate|deactivate <slug>",
      "  partner-key.mjs list",
    ].join("\n"),
  );
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [cmd, slug, name] = positional;
  if (!cmd) {
    usage();
    process.exit(2);
  }
  const authSecret = process.env.BETTER_AUTH_SECRET || DEFAULT_AUTH_SECRET;
  if (authSecret === DEFAULT_AUTH_SECRET) {
    console.warn("Achtung: BETTER_AUTH_SECRET ist nicht gesetzt — nur für lokale Entwicklung geeignet.");
  }
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://dam:dam@localhost:5432/dam",
  });
  try {
    if (cmd === "list") {
      const res = await pool.query(
        `SELECT slug, name, key_prefix, active, webhook_url IS NOT NULL AS webhook, file_hosts,
                (SELECT count(*) FROM partner_webhook_outbox o WHERE o.partner_id = p.id
                   AND o.delivered_at IS NULL AND o.failed_at IS NULL) AS pending,
                (SELECT count(*) FROM partner_webhook_outbox o WHERE o.partner_id = p.id
                   AND o.failed_at IS NOT NULL) AS failed
           FROM partners p ORDER BY slug`,
      );
      for (const r of res.rows) {
        console.log(
          `${r.slug}\t${r.name}\t${r.key_prefix}…\t${r.active ? "aktiv" : "inaktiv"}\twebhook=${r.webhook ? "ja" : "nein"}\thosts=${r.file_hosts.join(",") || "-"}\toffen=${r.pending}\taufgegeben=${r.failed}`,
        );
      }
      return;
    }
    if (!slug) {
      usage();
      process.exit(2);
    }

    if (cmd === "create") {
      if (!name) throw new Error("Name fehlt");
      if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) throw new Error("Slug: Kleinbuchstaben, Ziffern, Bindestrich");
      const webhookUrl = flags.webhookUrl ? checkWebhookUrl(flags.webhookUrl, flags.allowHttp) : null;
      const hosts = flags.fileHosts.map(checkFileHost);
      if (hosts.length === 0) throw new Error("Mindestens ein --file-host ist nötig");
      const k = newPartnerKey();
      const secret = webhookUrl ? newWebhookSecret() : null;
      await pool.query(
        `INSERT INTO partners (slug, name, key_hash, key_prefix, webhook_url, webhook_secret_enc, file_hosts)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [slug, name, k.hash, k.prefix, webhookUrl, secret ? encryptWebhookSecret(secret, authSecret) : null, hosts],
      );
      console.log(`Partner ${slug} angelegt. Die folgenden Werte werden nur jetzt angezeigt:`);
      console.log(`API-Key (beim Partner z. B. DRUCK_S_API_KEY):          ${k.key}`);
      if (secret) console.log(`Webhook-Secret (beim Partner z. B. DRUCK_S_WEBHOOK_SECRET): ${secret}`);
      return;
    }

    const found = await pool.query("SELECT id FROM partners WHERE slug = $1", [slug]);
    if (!found.rows[0]) throw new Error(`Partner ${slug} nicht gefunden`);

    if (cmd === "rotate-key") {
      const k = newPartnerKey();
      await pool.query(
        "UPDATE partners SET key_hash = $2, key_prefix = $3, key_rotated_at = now(), updated_at = now() WHERE slug = $1",
        [slug, k.hash, k.prefix],
      );
      console.log(`Neuer API-Key für ${slug} (der alte gilt ab sofort nicht mehr):`);
      console.log(k.key);
    } else if (cmd === "rotate-webhook-secret") {
      const secret = newWebhookSecret();
      await pool.query("UPDATE partners SET webhook_secret_enc = $2, updated_at = now() WHERE slug = $1", [
        slug,
        encryptWebhookSecret(secret, authSecret),
      ]);
      console.log(`Neues Webhook-Secret für ${slug} (gilt ab der nächsten Zustellung):`);
      console.log(secret);
    } else if (cmd === "update") {
      const sets = [];
      const values = [slug];
      if (flags.name) {
        values.push(flags.name);
        sets.push(`name = $${values.length}`);
      }
      if (flags.webhookUrl !== undefined) {
        values.push(flags.webhookUrl === null ? null : checkWebhookUrl(flags.webhookUrl, flags.allowHttp));
        sets.push(`webhook_url = $${values.length}`);
      }
      if (flags.fileHosts.length > 0) {
        values.push(flags.fileHosts.map(checkFileHost));
        sets.push(`file_hosts = $${values.length}`);
      }
      if (sets.length === 0) throw new Error("Nichts zu ändern");
      await pool.query(`UPDATE partners SET ${sets.join(", ")}, updated_at = now() WHERE slug = $1`, values);
      const s = await pool.query("SELECT webhook_url IS NOT NULL AND webhook_secret_enc IS NULL AS missing FROM partners WHERE slug = $1", [slug]);
      console.log(`Partner ${slug} aktualisiert.`);
      if (s.rows[0]?.missing) console.log("Hinweis: Webhook-URL ohne Secret — `rotate-webhook-secret` ausführen.");
    } else if (cmd === "activate" || cmd === "deactivate") {
      await pool.query("UPDATE partners SET active = $2, updated_at = now() WHERE slug = $1", [slug, cmd === "activate"]);
      console.log(`Partner ${slug} ${cmd === "activate" ? "aktiviert" : "deaktiviert"}.`);
    } else {
      usage();
      process.exit(2);
    }
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
