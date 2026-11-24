/**
 * Härtung (Postgres, DATABASE_URL; Objektspeicher, Session und Mail gemockt): Sweeps, Fristen, Anonymisierung,
 * Rate-Limits (unknown-Eimer, je Entwurf/IP/Nutzer), Link-Verschlüsselung, Tabellen-/Datensatzgrenzen.
 */
import { randomUUID } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const geloescht: string[] = [];
const speicher = new Map<string, Buffer>();
vi.mock("@/lib/storageFiles", async (orig) => {
  const echt = await orig<typeof import("@/lib/storageFiles")>();
  return {
    ...echt,
    putRequestFile: async (key: string, bytes: Buffer) => void speicher.set(key, Buffer.from(bytes)),
    getRequestFile: async (key: string) => {
      const b = speicher.get(key);
      if (!b) throw new Error("nicht da");
      return b;
    },
  };
});
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ send: async (cmd: { input?: { Key?: string } }) => void geloescht.push(cmd.input?.Key ?? "") }),
  bucketName: () => "test",
}));
vi.mock("@/lib/clamav", () => ({ scanBuffer: async () => ({ status: "CLEAN" }) }));
vi.mock("@/lib/mail", () => ({ sendMail: async () => undefined }));
vi.mock("@/lib/analyze/run", () => ({ analyzeRequest: async () => undefined }));
vi.mock("@/lib/assistantNote", () => ({ generateNote: async () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => null, isStaff: () => false }));
vi.mock("@/lib/guards", () => ({ clientIp: () => "203.0.113.55", requireStaff: async () => ({ user: null }) }));

import { config } from "@/lib/config";
import { query } from "@/lib/db";
import { anonymisiereAudit, laufeSweeps, sweepPersonalisierungAufbewahrung } from "@/lib/aufbewahrung";
import { addFile, createDraft } from "@/lib/requests/store";
import { begrenzeJeEntwurf, begrenzeJeIp, begrenzeJeNutzer, normalisiereDatensaetze } from "./dienst";
import { holeEntwurf, holeLinkToken, erstelleLink, erstelleVorlage, legeEntwurfAn, listeLinks, speichereDatei, speichereEntwurf, sweepAbgelaufeneEntwuerfe, widerrufeLink } from "./repo";
import { leseXlsx, TabellenFehler, TABELLEN_GRENZEN } from "./tabelle";
import { parseDatensatz } from "./schema";
import { testDesign, testVorlage } from "./test-support";
import { POST as absenden } from "@/app/api/personalisierung/z/[ref]/absenden/route";
import { PUT as speichern } from "@/app/api/personalisierung/z/[ref]/entwuerfe/[id]/route";

const tag = randomUUID().slice(0, 8);
let templateId = "";
let templateId2 = "";
let linkToken = "";

beforeAll(async () => {
  const designId = (await speichereDatei("design", "design.pdf", await testDesign(91, 61), null)).datei.id;
  const mk = async (name: string) =>
    (await erstelleVorlage(testVorlage({ name: `${name} ${tag}`, design: { dateiId: designId, vorne: 1, hinten: 2, mitBeschnitt: true } }), { userId: null, status: "aktiv", sichtbarkeit: "oeffentlich" })).id;
  templateId = await mk("Haertung A");
  templateId2 = await mk("Haertung B");
});

afterAll(async () => {
  await query(`DELETE FROM requests WHERE free_text LIKE $1`, [`%${tag}%`]);
  await query(`DELETE FROM pers_templates WHERE name LIKE $1`, [`%${tag}%`]);
  await query(`DELETE FROM audit_log WHERE detail->>'tag' = $1`, [tag]);
});

describe("Entwürfe: absolute Höchstdauer", () => {
  it("verlängert gleitend, aber nie über 72 h seit der Anlage; der Sweep löscht zu alte Entwürfe", async () => {
    expect(config.personalisierung.draftMaxHours).toBe(72);
    const { entwurf, token } = await legeEntwurfAn(templateId);
    // vor 71 h angelegt: Speichern verlängert um höchstens bis created_at + 72 h (also ca. 1 h)
    await query("UPDATE pers_drafts SET created_at = now() - interval '71 hours' WHERE id = $1", [entwurf.id]);
    const neu = await speichereEntwurf(entwurf.id, token, { datensaetze: [{ werte: { name: "A" }, auflage: 1 }] });
    const rest = new Date(neu!.expiresAt).getTime() - Date.now();
    expect(rest).toBeGreaterThan(30 * 60_000);
    expect(rest).toBeLessThan(75 * 60_000); // nicht 24 h
    // vor 73 h angelegt: nicht mehr lesbar (Ablauf) und der Sweep entfernt die Zeile auch bei gleitend verlängertem expires_at
    await query("UPDATE pers_drafts SET created_at = now() - interval '73 hours', expires_at = now() + interval '20 hours' WHERE id = $1", [entwurf.id]);
    await sweepAbgelaufeneEntwuerfe();
    expect((await query("SELECT 1 FROM pers_drafts WHERE id = $1", [entwurf.id])).rows).toHaveLength(0);
    expect(await holeEntwurf(entwurf.id, token)).toBeNull();
  });

  it("neue Entwürfe laufen nach der gleitenden Frist ab (24 h), nicht erst nach 72 h", async () => {
    const { entwurf } = await legeEntwurfAn(templateId);
    const rest = new Date(entwurf.expiresAt).getTime() - Date.now();
    expect(rest).toBeLessThanOrEqual(24 * 3600_000 + 5000);
  });
});

describe("Sweeps im Takt: abgebrochene Gast-Anfragen", () => {
  it("laufeSweeps löscht abgelaufene DRAFT-Anfragen samt Kontaktdaten und Dateien, nicht eingegangene", async () => {
    const alt = await createDraft({ productHint: "personalisierung", freeText: `Gast ${tag}`, origin: "door_a", trust: "VOUCHED" });
    await query("UPDATE requests SET inquiry_contact = $2, created_at = now() - interval '3 hours' WHERE id = $1", [alt.id, JSON.stringify({ name: "Gerda", email: `g-${tag}@example.com` })]);
    const datei = await addFile(alt.id, { fileName: "x.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.4") });
    const frisch = await createDraft({ productHint: "personalisierung", freeText: `Frisch ${tag}`, origin: "door_a", trust: "VOUCHED" });
    const eingegangen = await createDraft({ productHint: "personalisierung", freeText: `Eingegangen ${tag}`, origin: "door_a", trust: "VOUCHED" });
    await query("UPDATE requests SET status = 'RECEIVED', created_at = now() - interval '3 hours' WHERE id = $1", [eingegangen.id]);
    await laufeSweeps();
    expect((await query("SELECT 1 FROM requests WHERE id = $1", [alt.id])).rows).toHaveLength(0);
    expect(geloescht).toContain(datei.storageKey);
    expect((await query("SELECT 1 FROM requests WHERE id = $1", [frisch.id])).rows).toHaveLength(1);
    expect((await query("SELECT 1 FROM requests WHERE id = $1", [eingegangen.id])).rows).toHaveLength(1);
  });
});

describe("Audit-Log: Anonymisierung nach Frist", () => {
  it("entfernt IP, User-Agent und E-Mail nach 90 Tagen; neuere Einträge und Freigaben bleiben", async () => {
    const ein = async (action: string, alter: string, extra: Record<string, unknown> = {}) =>
      (
        await query<{ id: string }>(
          `INSERT INTO audit_log (action, actor_type, ip, user_agent, detail, created_at) VALUES ($1, 'system', '198.51.100.9', 'UA/1', $2, now() - $3::interval) RETURNING id`,
          [action, JSON.stringify({ tag, email: "x@example.com", behalten: 1, ...extra }), alter],
        )
      ).rows[0].id;
    const alt = await ein("inquiry_code_issued", "100 days");
    const neu = await ein("inquiry_code_issued", "10 days");
    const freigabe = await ein("approved", "400 days");
    const n = await anonymisiereAudit(90);
    expect(n).toBeGreaterThanOrEqual(1);
    const zeile = async (id: string) => (await query<{ ip: string | null; user_agent: string | null; detail: Record<string, unknown> }>("SELECT ip, user_agent, detail FROM audit_log WHERE id = $1", [id])).rows[0];
    expect(await zeile(alt)).toMatchObject({ ip: null, user_agent: null, detail: { tag, behalten: 1 } });
    expect((await zeile(alt)).detail.email).toBeUndefined();
    expect(await zeile(neu)).toMatchObject({ ip: "198.51.100.9", detail: { email: "x@example.com" } });
    expect(await zeile(freigabe)).toMatchObject({ ip: "198.51.100.9" });
    // 0 = aus
    const nochmal = await ein("inquiry_code_issued", "500 days");
    expect(await anonymisiereAudit(0)).toBe(0);
    expect((await zeile(nochmal)).ip).toBe("198.51.100.9");
  });
});

describe("Aufbewahrung der Druckdaten nach Versand/Abschluss", () => {
  async function anfrageMitDruckdaten(status: string, eventVorTagen: number | null) {
    const r = await createDraft({ productHint: "personalisierung", freeText: `Aufbewahrung ${tag}`, origin: "door_a", trust: "VOUCHED" });
    const pdf = await addFile(r.id, { fileName: "druck.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.4") });
    const xlsx = await addFile(r.id, { fileName: "daten.xlsx", mimeType: "application/octet-stream", bytes: Buffer.from("PK") });
    await query(
      `INSERT INTO pers_request_outputs (request_id, template_id, template_version, pdf_file_id, data_file_id, mode, record_count, nutzen_count, page_count)
       VALUES ($1, $2, 1, $3, $4, 'einzeln', 1, 1, 1)`,
      [r.id, templateId, pdf.id, xlsx.id],
    );
    await query("UPDATE requests SET status = $2 WHERE id = $1", [r.id, status]);
    if (eventVorTagen !== null) {
      await query(`INSERT INTO request_events (request_id, event, actor_type, created_at) VALUES ($1, $2, 'staff', now() - make_interval(days => $3))`, [r.id, status === "SHIPPED" ? "shipped" : "withdrawn", eventVorTagen]);
    }
    return { id: r.id, pdf, xlsx };
  }
  const vorhanden = async (id: string) => (await query("SELECT 1 FROM request_files WHERE id = $1", [id])).rows.length === 1;

  it("Standard AUS (0): nichts wird gelöscht", async () => {
    expect(config.personalisierung.dataRetentionDays).toBe(0);
    expect(config.personalisierung.pdfRetentionDays).toBe(0);
    const a = await anfrageMitDruckdaten("SHIPPED", 400);
    expect(await sweepPersonalisierungAufbewahrung()).toEqual({ tabellen: 0, pdfs: 0 });
    expect(await vorhanden(a.xlsx.id)).toBe(true);
  });

  it("löscht Tabelle und PDF getrennt nach der Frist, nur für versendete/zurückgezogene Anfragen", async () => {
    const alt = await anfrageMitDruckdaten("SHIPPED", 40);
    const jung = await anfrageMitDruckdaten("SHIPPED", 3);
    const offen = await anfrageMitDruckdaten("IN_PROGRESS", null);
    const zurueck = await anfrageMitDruckdaten("WITHDRAWN", 40);
    // nur die Datentabelle nach 30 Tagen
    const r1 = await sweepPersonalisierungAufbewahrung({ dataTage: 30, pdfTage: 0 });
    expect(r1.tabellen).toBeGreaterThanOrEqual(2);
    expect(r1.pdfs).toBe(0);
    expect(await vorhanden(alt.xlsx.id)).toBe(false);
    expect(geloescht).toContain(alt.xlsx.storageKey);
    expect(await vorhanden(alt.pdf.id)).toBe(true);
    expect(await vorhanden(zurueck.xlsx.id)).toBe(false);
    expect(await vorhanden(jung.xlsx.id)).toBe(true);
    expect(await vorhanden(offen.xlsx.id)).toBe(true);
    // Ausgabe-Datensatz bleibt, die Verknüpfung ist leer
    const o = await query<{ data_file_id: string | null; pdf_file_id: string | null }>("SELECT data_file_id, pdf_file_id FROM pers_request_outputs WHERE request_id = $1", [alt.id]);
    expect(o.rows[0]).toMatchObject({ data_file_id: null, pdf_file_id: alt.pdf.id });
    // dann das PDF
    const r2 = await sweepPersonalisierungAufbewahrung({ dataTage: 0, pdfTage: 30 });
    expect(r2.pdfs).toBeGreaterThanOrEqual(2);
    expect(await vorhanden(alt.pdf.id)).toBe(false);
    expect(await vorhanden(jung.pdf.id)).toBe(true);
    expect((await query("SELECT 1 FROM requests WHERE id = $1", [alt.id])).rows).toHaveLength(1);
  });
});

describe("Rate-Limits", () => {
  it("IP „unknown“ zählt in einem gemeinsamen Eimer statt ohne Grenze", async () => {
    await query("DELETE FROM audit_log WHERE action = 'pers_check' AND ip = 'unknown'");
    for (let i = 0; i < 3; i++) await query("INSERT INTO audit_log (action, actor_type, ip, detail) VALUES ('pers_check', 'system', 'unknown', $1)", [JSON.stringify({ tag })]);
    await expect(begrenzeJeIp("pers_check", "unknown", 3)).rejects.toMatchObject({ status: 429 });
    await expect(begrenzeJeIp("pers_check", null, 3)).rejects.toMatchObject({ status: 429 });
    await expect(begrenzeJeIp("pers_check", "unknown", 4)).resolves.toBeUndefined();
    await expect(begrenzeJeIp("pers_check", "unknown", 0)).resolves.toBeUndefined();
    await query("DELETE FROM audit_log WHERE action = 'pers_check' AND ip = 'unknown'");
  });

  it("IPv6 je /64: Zählschlüssel gleich für alle Adressen eines Anschlusses", async () => {
    const netz = "2001:db8:77:1::/64";
    for (let i = 0; i < 2; i++) await query("INSERT INTO audit_log (action, actor_type, ip, detail) VALUES ('pers_table', 'system', $1, $2)", [netz, JSON.stringify({ tag })]);
    await expect(begrenzeJeIp("pers_table", netz, 2)).rejects.toMatchObject({ status: 429 });
  });

  it("je Entwurf und je Nutzer", async () => {
    const id = randomUUID();
    for (let i = 0; i < 2; i++) await query("INSERT INTO audit_log (action, actor_type, actor_id, detail) VALUES ('pers_submit', 'customer', 'u-haertung', $1)", [JSON.stringify({ tag, entwurfId: id })]);
    await expect(begrenzeJeEntwurf("pers_submit", id, 2)).rejects.toMatchObject({ status: 429 });
    await expect(begrenzeJeEntwurf("pers_submit", id, 3)).resolves.toBeUndefined();
    await expect(begrenzeJeEntwurf("pers_submit", null, 1)).resolves.toBeUndefined();
    await expect(begrenzeJeNutzer("pers_submit", "u-haertung", 2)).rejects.toMatchObject({ status: 429 });
    await expect(begrenzeJeNutzer("pers_submit", "u-haertung", 50)).resolves.toBeUndefined();
    await query("DELETE FROM audit_log WHERE actor_id::text = 'u-haertung'");
  });

  it("Entwurf-PUT ist je Entwurf begrenzt (im Speicher)", async () => {
    const alt = config.personalisierung.savesPerDraftPerHour;
    config.personalisierung.savesPerDraftPerHour = 2;
    try {
      const { entwurf, token } = await legeEntwurfAn(templateId);
      const link = await erstelleLink(templateId, { userId: null });
      const put = async (): Promise<Response> =>
        (await speichern(
          new Request("http://localhost/x", { method: "PUT", headers: { "content-type": "application/json", "x-entwurf-token": token }, body: JSON.stringify({ datensaetze: [] }) }),
          { params: Promise.resolve({ ref: link.token, id: entwurf.id }) },
        ))!;
      expect((await put()).status).toBe(200);
      expect((await put()).status).toBe(200);
      const dritter = await put();
      expect(dritter.status).toBe(429);
      expect(dritter.headers.get("retry-after")).toBe("3600");
    } finally {
      config.personalisierung.savesPerDraftPerHour = alt;
    }
  });
});

describe("Absenden: Grenze vor der teuren Prüfung", () => {
  it("je Entwurf: nach dem Limit 429, ohne dass die Prüfung läuft", async () => {
    const alt = config.personalisierung.submitsPerDraftPerHour;
    config.personalisierung.submitsPerDraftPerHour = 2;
    try {
      const { token: ref } = await erstelleLink(templateId, { userId: null });
      const entwurfId = randomUUID();
      const los = async () =>
        (await absenden(
          new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", "x-entwurf-token": "a".repeat(64) }, body: JSON.stringify({ entwurfId, kontakt: { name: "A", email: "a@example.com" } }) }),
          { params: Promise.resolve({ ref }) },
        ))!;
      expect((await los()).status).toBe(404); // Entwurf gibt es nicht (nach dem Zählen)
      expect((await los()).status).toBe(404);
      const r = await los();
      expect(r.status).toBe(429);
      expect((await r.json()).code).toBe("rate_limited");
    } finally {
      config.personalisierung.submitsPerDraftPerHour = alt;
    }
  });
});

describe("Stabile Kundenlinks", () => {
  it("derselbe Link lässt sich erneut abrufen; Prüfung läuft weiter über den Hash; ältere Links nicht anzeigbar", async () => {
    const { link, token } = await erstelleLink(templateId, { userId: null, label: `Stabil ${tag}` });
    linkToken = token;
    const zeile = await query<{ token_hash: string; token_enc: string }>("SELECT token_hash, token_enc FROM pers_access_links WHERE id = $1", [link.id]);
    expect(zeile.rows[0].token_enc).toMatch(/^v1:/);
    expect(zeile.rows[0].token_enc).not.toContain(token);
    expect(await holeLinkToken(link.id, templateId)).toBe(token);
    expect(await holeLinkToken(link.id, templateId)).toBe(token); // jedes Mal derselbe
    expect((await listeLinks(templateId)).find((l) => l.id === link.id)?.kopierbar).toBe(true);
    // gehört zu einer anderen Vorlage: nicht abrufbar / nicht widerrufbar
    expect(await holeLinkToken(link.id, templateId2)).toBeNull();
    expect(await widerrufeLink(link.id, templateId2)).toBe(false);
    // Altbestand ohne token_enc: bleibt gültig, ist aber nicht anzeigbar
    await query("UPDATE pers_access_links SET token_enc = NULL WHERE id = $1", [link.id]);
    expect(await holeLinkToken(link.id, templateId)).toBeNull();
    expect((await listeLinks(templateId)).find((l) => l.id === link.id)?.kopierbar).toBe(false);
    // widerrufen: nicht mehr abrufbar
    const zweiter = await erstelleLink(templateId, { userId: null });
    expect(await widerrufeLink(zweiter.link.id, templateId)).toBe(true);
    expect(await holeLinkToken(zweiter.link.id, templateId)).toBeNull();
    void linkToken;
  });
});

describe("Ressourcengrenzen", () => {
  it("DatensatzSchema begrenzt die Zahl der Werte (vor der zod-Prüfung)", () => {
    const viele = Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`k${i}`, "x"]));
    expect(parseDatensatz({ werte: viele, auflage: 1 }).success).toBe(false);
    const ok = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, "x"]));
    expect(parseDatensatz({ werte: ok, auflage: 1 }).success).toBe(true);
    expect(parseDatensatz({ werte: { a: "x".repeat(2001) } }).success).toBe(false);
    const gross = Object.fromEntries(Array.from({ length: 50_000 }, (_, i) => [`k${i}`, "x"]));
    expect(() => normalisiereDatensaetze([{ werte: gross }])).toThrow(/ungültig/);
  });

  it("XLSX: entpackte Größe ist auf 15 MB gesenkt", () => {
    expect(TABELLEN_GRENZEN.maxEntpackt).toBe(15 * 1024 * 1024);
    const gross = zipSync({ "xl/workbook.xml": strToU8("<workbook/>"), "xl/worksheets/sheet1.xml": new Uint8Array(16 * 1024 * 1024) });
    expect(() => leseXlsx(gross)).toThrow(/entpackt zu groß/);
  });

  it("XLSX: zu viele Zeilen und Spalten werden vor dem Parsen abgelehnt", () => {
    const mk = (blatt: string) =>
      zipSync({
        "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="a" r:id="rId1"/></sheets></workbook>'),
        "xl/worksheets/sheet1.xml": strToU8(blatt),
      });
    const dimZeilen = mk(`<worksheet><dimension ref="A1:B${TABELLEN_GRENZEN.maxZeilen * 2 + 5}"/><sheetData/></worksheet>`);
    expect(() => leseXlsx(dimZeilen)).toThrow(TabellenFehler);
    expect(() => leseXlsx(dimZeilen)).toThrow(/zu viele Zeilen/);
    const dimSpalten = mk(`<worksheet><dimension ref="A1:ZZ3"/><sheetData/></worksheet>`);
    expect(() => leseXlsx(dimSpalten)).toThrow(/zu viele Spalten/);
    const zeilen = "<row r=\"1\"><c r=\"A1\"><v>1</v></c></row>".repeat(TABELLEN_GRENZEN.maxZeilen * 2 + 1);
    expect(() => leseXlsx(mk(`<worksheet><sheetData>${zeilen}</sheetData></worksheet>`))).toThrow(/zu viele Zeilen/);
  });
});
