import { XMLParser } from "fast-xml-parser";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { query } from "./db";
import { bucketName, getStorage } from "./storage";
import type { HistoryImport, HistoryOrder } from "./history";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

/**
 * Deterministic MIS dump ingestion. Raw XML is stored immutable and versioned;
 * derivations (JSONL + markdown) are pure transforms — no model involved.
 * The dump shape varies by MIS; extraction is best-effort over common shapes:
 * repeated <order>/<auftrag> elements with id-ish, date-ish, product-ish children.
 */
export function extractOrders(xml: string): HistoryOrder[] {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }
  const candidates = findOrderArrays(doc);
  return candidates.map((o, i) => normalizeOrder(o, i));
}

function findOrderArrays(node: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      if (
        value.length > 0 &&
        value.every((v) => typeof v === "object" && v !== null) &&
        value.some((v) => hasOrderKeys(v as Record<string, unknown>))
      ) {
        found.push(...(value as Record<string, unknown>[]));
      }
      value.forEach(visit);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  visit(node);
  return found;
}

function hasOrderKeys(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o).map((k) => k.toLowerCase());
  const idish = ["id", "orderid", "auftragid", "nummer", "number", "no", "nr", "belegnr"].some(
    (k) => keys.includes(k),
  );
  const dateish = ["date", "datum", "created", "erstellt"].some((k) => keys.includes(k));
  return idish || dateish;
}

function pick(obj: Record<string, unknown>, names: string[]): string | null {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) lower[k.toLowerCase()] = v;
  for (const n of names) {
    const v = lower[n];
    if (v !== undefined && v !== null && typeof v !== "object") return String(v);
  }
  return null;
}

function normalizeOrder(o: Record<string, unknown>, index: number): HistoryOrder {
  const id = pick(o, ["id", "orderid", "auftragid", "nummer", "number", "nr", "belegnr"]) ?? `row-${index + 1}`;
  const date = pick(o, ["date", "datum", "created", "erstellt"]) ?? "";
  const product =
    pick(o, ["product", "produkt", "title", "bezeichnung", "name", "artikel"]) ?? "";
  const qtyRaw = pick(o, ["quantity", "qty", "menge", "auflage", "stueck", "stück"]);
  const quantity = qtyRaw !== null && /^\d+/.test(qtyRaw) ? Number(qtyRaw.match(/^\d+/)![0]) : null;
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== null && typeof v !== "object") attributes[k] = String(v);
  }
  return { id, date, product, quantity, attributes };
}

export function ordersToJsonl(orders: HistoryOrder[]): string {
  return orders.map((o) => JSON.stringify(o)).join("\n");
}

export function ordersToMarkdown(orders: HistoryOrder[]): string {
  const lines = orders.map((o, i) => {
    const qty = o.quantity !== null ? `, ${o.quantity} pcs` : "";
    return `#${o.id} ${o.date} ${o.product}${qty}  (ref md:${i + 1})`;
  });
  return `# Order history\n\n${lines.join("\n")}\n`;
}

export async function importHistoryBundle(input: {
  identityId: string;
  xml: string;
  fileName: string;
}): Promise<{ import: HistoryImport; orders: HistoryOrder[] }> {
  const orders = extractOrders(input.xml);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rawKey = `history/${input.identityId}/${stamp}-${input.fileName}`;
  const jsonlKey = `${rawKey}.orders.jsonl`;
  const mdKey = `${rawKey}.orders.md`;
  const storage = getStorage();
  const put = (key: string, body: string, type: string) =>
    storage.send(
      new PutObjectCommand({ Bucket: bucketName(), Key: key, Body: body, ContentType: type }),
    );
  await put(rawKey, input.xml, "application/xml");
  await put(jsonlKey, ordersToJsonl(orders), "application/jsonl");
  await put(mdKey, ordersToMarkdown(orders), "text/markdown");
  const res = await query<HistoryImport>(
    `INSERT INTO history_imports (identity_id, raw_key, derived_keys, order_count)
     VALUES ($1, $2, $3, $4)
     RETURNING id, identity_id AS "identityId", raw_key AS "rawKey",
       derived_keys AS "derivedKeys", imported_at AS "importedAt", order_count::int AS "orderCount"`,
    [input.identityId, rawKey, [jsonlKey, mdKey], orders.length],
  );
  return { import: res.rows[0], orders };
}

export async function latestHistoryImport(
  identityId: string,
): Promise<(HistoryImport & { md: string; jsonl: string }) | null> {
  const res = await query<HistoryImport>(
    `SELECT id, identity_id AS "identityId", raw_key AS "rawKey",
       derived_keys AS "derivedKeys", imported_at AS "importedAt", order_count AS "orderCount"
     FROM history_imports WHERE identity_id = $1 ORDER BY imported_at DESC LIMIT 1`,
    [identityId],
  );
  const row = res.rows[0] as (HistoryImport & { derivedKeys: string[] }) | undefined;
  if (!row) return null;
  const storage = getStorage();
  const get = async (key: string) => {
    const out = await storage.send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
    if (!out.Body) throw new Error(`Missing object ${key}`);
    return Buffer.from(await out.Body.transformToByteArray()).toString("utf8");
  };
  const [jsonlKey, mdKey] = row.derivedKeys;
  return { ...row, jsonl: await get(jsonlKey), md: await get(mdKey) };
}
