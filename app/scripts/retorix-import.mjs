#!/usr/bin/env node
/**
 * Importiert Vorlagen, Schriften und Farben aus einer retorix-Datenbank (Django/Postgres) in die
 * Personalisierung von druck-s. Bestellungen, Warenkörbe und Kunden werden NICHT übernommen.
 *
 *   RETORIX_DATABASE_URL=postgres://… RETORIX_S3_ENDPOINT_URL=… RETORIX_S3_ACCESS_KEY=… \
 *   RETORIX_S3_SECRET_KEY=… RETORIX_S3_BUCKET_NAME=… [RETORIX_S3_REGION_NAME=eu-central] \
 *   [RETORIX_S3_ADDRESSING_STYLE=virtual|path] node scripts/retorix-import.mjs [--trocken]
 *
 * Ziel: DATABASE_URL und S3_* von druck-s (wie die App). Importierte Vorlagen sind Entwürfe, nur für
 * Mitarbeiter sichtbar. Idempotent: jede Quelle bekommt eine import_source; erneute Läufe überspringen
 * Vorhandenes. --trocken liest und bildet ab, schreibt aber nichts (nur Bericht).
 */
import { randomUUID, createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";
import { PDFDocument } from "pdf-lib";
import { bilde, ersetzeDateiRefs } from "./retorix-mapping.mjs";

const trocken = process.argv.includes("--trocken");
const env = (n, d) => process.env[n] ?? d;
const MM = 72 / 25.4;

function s3(prefix, fallback = {}) {
  return new S3Client({
    region: env(`${prefix}REGION_NAME`, fallback.region ?? "us-east-1"),
    endpoint: env(`${prefix}ENDPOINT_URL`, fallback.endpoint),
    forcePathStyle: env(`${prefix}ADDRESSING_STYLE`, fallback.path ? "path" : "virtual") === "path",
    credentials: { accessKeyId: env(`${prefix}ACCESS_KEY`, fallback.key), secretAccessKey: env(`${prefix}SECRET_KEY`, fallback.secret) },
  });
}

async function holeObjekt(client, bucket, key) {
  const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await out.Body.transformToByteArray());
}

async function lies(db) {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    products: await q("SELECT id, code, name, type, short_description FROM shop_product ORDER BY id"),
    features: await q("SELECT id, product_id, design_file, template_file, distance_columns, distance_rows, paper_format_id FROM shop_personalisedprintfeature"),
    paper_formats: await q("SELECT id, name, width, height, distance_top, distance_bottom, distance_left, distance_right FROM shop_paperformat"),
    pages: await q("SELECT id, personalised_print_feature_id, pdf_page, page_number FROM shop_printproductpage"),
    fields: await q("SELECT id, name, coordinate_x, coordinate_y, is_required, width FROM shop_field"),
    text_fields: await q("SELECT field_ptr_id, page_id, content, line_spacing, remove_blank_lines, fill_bottom_up FROM shop_textfield"),
    barcode_fields: await q("SELECT field_ptr_id, page_id, barcode_type, barcode_quality, is_include_text, is_show_border, background_color, bar_color FROM shop_barcodefield"),
    vcard_fields: await q("SELECT field_ptr_id, page_id, barcode_quality, firstname, lastname, company, role, title, private_phone, phone, mobile, fax, street, postalcode, city, country, email, url, linkedin, xing, facebook, is_show_border, background_color, bar_color FROM shop_vcardfield"),
    free_text_qr_fields: await q("SELECT field_ptr_id, page_id, content, barcode_quality, is_show_border, background_color, bar_color FROM shop_freetextqrfield"),
    image_fields: await q("SELECT field_ptr_id, page_id, image FROM shop_imagefield"),
    fonts: await q("SELECT id, name, font_file FROM shop_fontfile ORDER BY id"),
    colors: await q("SELECT id, name, code_rgb, code_cmyk FROM shop_color ORDER BY id"),
  };
}

async function main() {
  const quellUrl = env("RETORIX_DATABASE_URL");
  if (!quellUrl) throw new Error("RETORIX_DATABASE_URL fehlt");
  const quelle = new pg.Pool({ connectionString: quellUrl, max: 2 });
  const medienBucket = env("RETORIX_S3_BUCKET_NAME");
  const medien = medienBucket ? s3("RETORIX_S3_") : null;
  const snapshot = await lies(quelle);

  // Design-Größen aus den PDFs lesen (Medien nötig)
  const dateiCache = new Map();
  const lade = async (key) => {
    if (!dateiCache.has(key)) dateiCache.set(key, await holeObjekt(medien, medienBucket, key));
    return dateiCache.get(key);
  };
  const designMasse = {};
  const probleme = [];
  for (const f of snapshot.features) {
    if (!f.design_file || !medien) continue;
    try {
      const doc = await PDFDocument.load(await lade(f.design_file), { updateMetadata: false });
      designMasse[f.id] = doc.getPages().map((p) => ({ breiteMm: p.getMediaBox().width / MM, hoeheMm: p.getMediaBox().height / MM }));
    } catch (e) {
      probleme.push({ art: "warnung", quelle: `retorix:feature:${f.id}`, text: `Design-PDF „${f.design_file}“ nicht lesbar (${e instanceof Error ? e.message : "Fehler"}).` });
    }
  }
  const ergebnis = bilde(snapshot, designMasse);
  ergebnis.bericht.push(...probleme);

  let ziel = null;
  let validiere = null;
  try {
    ({ parseVorlage: validiere } = await import("../lib/personalisierung/schema.ts"));
  } catch {
    console.warn("Hinweis: Schema-Prüfung übersprungen (TypeScript-Import nicht möglich); die App prüft beim Speichern/Aktivieren.");
  }
  const zaehler = { vorlagenNeu: 0, vorlagenVorhanden: 0, schriftenNeu: 0, farbenNeu: 0, dateienNeu: 0 };

  if (!trocken) {
    ziel = new pg.Pool({ connectionString: env("DATABASE_URL", "postgres://dam:dam@localhost:5432/dam"), max: 2 });
    const zielS3 = s3("S3_", { endpoint: env("S3_ENDPOINT", "http://localhost:9000"), key: "minioadmin", secret: "minioadmin", region: "us-east-1", path: env("S3_FORCE_PATH_STYLE", "true") === "true" });
    const zielBucket = env("S3_BUCKET", "dam");
    const dateiId = async (key, art, mime) => {
      const src = `retorix:file:${key}`;
      const vorhanden = await ziel.query("SELECT id FROM pers_files WHERE import_source = $1", [src]);
      if (vorhanden.rows[0]) return vorhanden.rows[0].id;
      const bytes = await lade(key);
      const skey = `personalisierung/dateien/${randomUUID()}`;
      await zielS3.send(new PutObjectCommand({ Bucket: zielBucket, Key: skey, Body: bytes, ContentType: mime }));
      let seiten = null, b = null, h = null;
      if (mime === "application/pdf") {
        const doc = await PDFDocument.load(bytes, { updateMetadata: false });
        seiten = doc.getPageCount();
        b = doc.getPage(0).getMediaBox().width / MM;
        h = doc.getPage(0).getMediaBox().height / MM;
      }
      const r = await ziel.query(
        `INSERT INTO pers_files (kind, storage_key, file_name, mime_type, size_bytes, sha256, pages, width_mm, height_mm, import_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [art, skey, key.split("/").pop().slice(0, 120), mime, bytes.length, createHash("sha256").update(bytes).digest("hex"), seiten, b, h, src],
      );
      zaehler.dateienNeu++;
      return r.rows[0].id;
    };
    for (const f of ergebnis.schriften) {
      if ((await ziel.query("SELECT 1 FROM pers_fonts WHERE import_source = $1 OR (family = $2 AND style = $3)", [f.quelle, f.familie, f.schnitt])).rows[0]) continue;
      if (!medien || !f.datei) continue;
      const bytes = await lade(f.datei);
      const skey = `personalisierung/schriften/${randomUUID()}`;
      await zielS3.send(new PutObjectCommand({ Bucket: zielBucket, Key: skey, Body: bytes, ContentType: "font/ttf" }));
      await ziel.query(
        `INSERT INTO pers_fonts (family, style, file_name, storage_key, size_bytes, sha256, import_source) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [f.familie, f.schnitt, f.datei.split("/").pop().slice(0, 120), skey, bytes.length, createHash("sha256").update(bytes).digest("hex"), f.quelle],
      );
      zaehler.schriftenNeu++;
    }
    for (const c of ergebnis.farben) {
      const r = await ziel.query(
        `INSERT INTO pers_colors (name, c, m, y, k, spot_name, import_source) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [c.name, ...c.cmyk, c.sonderfarbe, c.quelle],
      );
      zaehler.farbenNeu += r.rowCount ?? 0;
    }
    for (const v of ergebnis.vorlagen) {
      if ((await ziel.query("SELECT 1 FROM pers_templates WHERE import_source = $1", [v.quelle])).rows[0]) {
        zaehler.vorlagenVorhanden++;
        ergebnis.bericht.push({ art: "hinweis", quelle: v.quelle, text: `Vorlage „${v.vorlage.name}“ war schon importiert und wurde übersprungen.` });
        continue;
      }
      const ids = {};
      for (const key of v.dateien) {
        const mime = /\.png$/i.test(key) ? "image/png" : /\.jpe?g$/i.test(key) ? "image/jpeg" : "application/pdf";
        const art = mime === "application/pdf" ? "design" : "bild";
        ids[key] = await dateiId(key, art, mime);
      }
      const spec = ersetzeDateiRefs(v.vorlage, ids);
      if (validiere) {
        const p = validiere(spec);
        if (!p.ok) {
          ergebnis.bericht.push({ art: "fehler", quelle: v.quelle, text: `Vorlage „${v.vorlage.name}“ entspricht nicht dem Schema: ${p.fehler.map((f) => `${f.pfad}: ${f.text}`).join("; ")}` });
          continue;
        }
      }
      const client = await ziel.connect();
      try {
        await client.query("BEGIN");
        const t = await client.query("INSERT INTO pers_templates (name, import_source) VALUES ($1, $2) RETURNING id", [spec.name, v.quelle]);
        const namen = [...new Set(spec.felder.flatMap((f) => [f.farbe, f.hintergrund].filter(Boolean)))];
        const farben = (await client.query("SELECT name, jsonb_build_array(c::float, m::float, y::float, k::float) AS cmyk, spot_name AS sonderfarbe FROM pers_colors WHERE name = ANY($1)", [namen])).rows;
        await client.query("INSERT INTO pers_template_versions (template_id, version, spec, colors) VALUES ($1, 1, $2, $3)", [t.rows[0].id, JSON.stringify(validiere ? validiere(spec).vorlage : spec), JSON.stringify(farben)]);
        await client.query("COMMIT");
        zaehler.vorlagenNeu++;
      } catch (e) {
        await client.query("ROLLBACK");
        ergebnis.bericht.push({ art: "fehler", quelle: v.quelle, text: `Vorlage „${v.vorlage.name}“ konnte nicht gespeichert werden: ${e instanceof Error ? e.message : "Fehler"}` });
      } finally {
        client.release();
      }
    }
    await ziel.end();
  }
  await quelle.end();

  console.log(`${trocken ? "TROCKENLAUF – es wurde nichts geschrieben.\n" : ""}Vorlagen abbildbar: ${ergebnis.vorlagen.length}, Schriften: ${ergebnis.schriften.length}, Farben: ${ergebnis.farben.length}`);
  if (!trocken) console.log(`Neu: ${zaehler.vorlagenNeu} Vorlagen (${zaehler.vorlagenVorhanden} schon vorhanden), ${zaehler.schriftenNeu} Schriften, ${zaehler.farbenNeu} Farben, ${zaehler.dateienNeu} Dateien.`);
  for (const b of ergebnis.bericht.filter((x) => x.art !== "hinweis")) console.log(`[${b.art}] ${b.quelle}: ${b.text}`);
  console.log(`(${ergebnis.bericht.filter((x) => x.art === "hinweis").length} weitere Hinweise zur Prüfung im Editor)`);
  if (process.argv.includes("--bericht-voll")) for (const b of ergebnis.bericht.filter((x) => x.art === "hinweis")) console.log(`[hinweis] ${b.quelle}: ${b.text}`);
}

main().catch((e) => {
  console.error("Import fehlgeschlagen:", e instanceof Error ? e.message : e);
  process.exit(1);
});
