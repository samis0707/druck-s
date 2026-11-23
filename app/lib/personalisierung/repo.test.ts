/**
 * Datenbank-Tests der Personalisierung (Postgres, DATABASE_URL; Objektspeicher und Session sind gemockt).
 * Lokal: DATABASE_URL=postgres://dam:dam@localhost:5432/dam_pers node db/migrate.js && vitest run lib/personalisierung
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ send: async () => ({}) }), bucketName: () => "test" }));
vi.mock("@/lib/clamav", () => ({ scanBuffer: async () => ({ status: "CLEAN" }) }));

const sitzung: { user: null | { id: string; email: string; name: null; role: string; status: string; firm: null } } = { user: null };
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => sitzung.user,
  isStaff: (u: { role: string }) => u.role === "staff" || u.role === "admin",
}));

import { query } from "@/lib/db";
import { createDraft } from "@/lib/requests/store";
import { erzeugeDruckdatenFuerAnfrage } from "./dienst";
import {
  aktualisiereVorlage,
  archiviereVorlage,
  erstelleLink,
  erstelleVorlage,
  holeEntwurf,
  holeVorlage,
  legeEntwurfAn,
  listeFarben,
  loeseLinkAuf,
  loescheFarbe,
  loescheSchrift,
  speichereDatei,
  speichereEntwurf,
  speichereFarbe,
  speichereSchrift,
  setzeKunden,
  sweepAbgelaufeneEntwuerfe,
  vorlagenFuerKunde,
  widerrufeLink,
} from "./repo";
import { testDesign, testSchrift, testVorlage } from "./test-support";
import { PersFehler } from "./dateien";

const tag = randomUUID().slice(0, 8);
let designId = "";
let userStaff = "";
let kundeA = "";
let kundeB = "";

async function neueVorlage(extra: Record<string, unknown> = {}, opt: { status?: "aktiv" | "entwurf"; sichtbarkeit?: "mitarbeiter" | "kunden" | "oeffentlich" } = {}) {
  const v = testVorlage({ name: `Karte ${tag}`, design: { dateiId: designId, vorne: 1, hinten: 2, mitBeschnitt: true }, ...extra });
  return erstelleVorlage(v, { userId: userStaff, ...opt });
}

async function user(rolle: string): Promise<string> {
  const id = `pers-${tag}-${rolle}-${randomUUID().slice(0, 6)}`;
  await query(`INSERT INTO "user" (id, email, role, status) VALUES ($1, $2, $3, 'customer')`, [id, `${id}@example.com`, rolle]);
  return id;
}

beforeAll(async () => {
  designId = (await speichereDatei("design", "design.pdf", await testDesign(91, 61), null)).datei.id;
  userStaff = await user("staff");
  kundeA = await user("customer");
  kundeB = await user("customer");
});

afterAll(async () => {
  await query(`DELETE FROM pers_templates WHERE name LIKE $1`, [`%${tag}%`]);
  await query(`DELETE FROM "user" WHERE id LIKE $1`, [`pers-${tag}-%`]);
  await query(`DELETE FROM pers_colors WHERE name LIKE $1`, [`%${tag}%`]);
  await query(`DELETE FROM pers_fonts WHERE family LIKE $1 OR family = 'Open Sans'`, [`%${tag}%`]);
});

describe("Dateien, Schriften, Farben", () => {
  it("lehnt ungültige Uploads ab", async () => {
    await expect(speichereDatei("design", "x.pdf", new TextEncoder().encode("kein pdf"), null)).rejects.toThrow(/kein PDF/);
    await expect(speichereDatei("bild", "x.png", new Uint8Array([1, 2, 3]), null)).rejects.toThrow(/PNG/);
    await expect(speichereSchrift(new Uint8Array([1, 2, 3, 4, 5]), { dateiname: "x.ttf", userId: null })).rejects.toThrow(/TTF/);
  });

  it("speichert Schriften je Familie/Schnitt und schützt verwendete vor dem Löschen", async () => {
    const s = await speichereSchrift(testSchrift("regular").bytes, { dateiname: "os.ttf", familie: `Test ${tag}`, userId: null });
    expect(s).toMatchObject({ familie: `Test ${tag}`, schnitt: "regular" });
    const v = await neueVorlage({ felder: [{ typ: "text", id: "t", x: 1, y: 1, breite: 20, hoehe: 5, vorlage: "{{name}}", schrift: { familie: `Test ${tag}` } }], design: { dateiId: designId, vorne: 1, hinten: null, mitBeschnitt: true } });
    await expect(loescheSchrift(s.id)).rejects.toMatchObject({ code: "in_verwendung" });
    await archiviereVorlage(v.id);
    await query("DELETE FROM pers_templates WHERE id = $1", [v.id]);
    await expect(loescheSchrift(s.id)).resolves.toBe(true);
  });

  it("verwaltet Farben und verhindert Dubletten", async () => {
    const f = await speichereFarbe({ name: `Rot ${tag}`, cmyk: [0, 100, 100, 0], sonderfarbe: "HKS 13" });
    expect(f.cmyk).toEqual([0, 100, 100, 0]);
    await expect(speichereFarbe({ name: `Rot ${tag}`, cmyk: [0, 0, 0, 0] })).rejects.toMatchObject({ code: "doppelt" });
    await expect(speichereFarbe({ name: "x", cmyk: [0, 0, 0, 101] })).rejects.toBeInstanceOf(PersFehler);
    expect((await listeFarben()).some((x) => x.id === f.id)).toBe(true);
    await expect(loescheFarbe(f.id)).resolves.toBe(true);
  });
});

describe("Versionierung", () => {
  it("ändert Entwürfe an Ort, aktive Vorlagen versioniert; Gast-Entwürfe bleiben an ihrer Version", async () => {
    const d = await neueVorlage();
    expect(d.aktuelleVersion).toBe(1);
    const e1 = await aktualisiereVorlage(d.id, { vorlage: { ...d.vorlage, beschreibung: "a" } }, userStaff);
    expect(e1!.aktuelleVersion).toBe(1); // Entwurf: in place
    await expect(aktualisiereVorlage(d.id, { status: "aktiv", vorlage: { ...d.vorlage, variablen: [], felder: [] } }, userStaff)).rejects.toMatchObject({ code: "nicht_aktivierbar" });
    const akt = await aktualisiereVorlage(d.id, { status: "aktiv", sichtbarkeit: "oeffentlich" }, userStaff);
    expect(akt!.status).toBe("aktiv");
    const { entwurf } = await legeEntwurfAn(d.id);
    expect(entwurf.templateVersion).toBe(1);
    const v2 = await aktualisiereVorlage(d.id, { vorlage: { ...d.vorlage, name: `Karte neu ${tag}`, endformat: { breite: 90, hoehe: 50 } } }, userStaff);
    expect(v2!.aktuelleVersion).toBe(2);
    expect((await holeVorlage(d.id, 1))!.vorlage.endformat.breite).toBe(85); // alte Version unverändert
    expect((await holeVorlage(d.id))!.vorlage.endformat.breite).toBe(90);
    // der Entwurf verweist weiter auf Version 1
    const spaeter = await query<{ template_version: number }>("SELECT template_version FROM pers_drafts WHERE id = $1", [entwurf.id]);
    expect(spaeter.rows[0].template_version).toBe(1);
    // Version 1 darf der Sweep nicht entfernen, solange der Entwurf lebt
    await sweepAbgelaufeneEntwuerfe();
    expect(await holeVorlage(d.id, 1)).not.toBeNull();
  });

  it("friert Farben je Version ein", async () => {
    const f = await speichereFarbe({ name: `Blau ${tag}`, cmyk: [100, 50, 0, 0] });
    const d = await neueVorlage({ felder: [{ typ: "text", id: "t", x: 1, y: 1, breite: 20, hoehe: 5, vorlage: "{{name}}", farbe: `Blau ${tag}` }], design: { dateiId: designId, vorne: 1, hinten: null, mitBeschnitt: true } });
    await speichereFarbe({ name: `Blau ${tag}`, cmyk: [0, 0, 0, 0] }, f.id);
    expect((await holeVorlage(d.id))!.farben[0].cmyk).toEqual([100, 50, 0, 0]);
  });
});

describe("Zugriff", () => {
  it("speichert nur den Hash des Link-Tokens und löst nur aktive, öffentliche Vorlagen auf", async () => {
    const d = await neueVorlage({}, { status: "aktiv", sichtbarkeit: "oeffentlich" });
    const { link, token } = await erstelleLink(d.id, { label: "Messe", userId: userStaff });
    const zeilen = await query<{ token_hash: string }>("SELECT token_hash FROM pers_access_links WHERE id = $1", [link.id]);
    expect(zeilen.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(zeilen.rows[0].token_hash).not.toBe(token);
    expect((await loeseLinkAuf(token))!.vorlage.id).toBe(d.id);
    expect(await loeseLinkAuf("0".repeat(64))).toBeNull();
    expect(await loeseLinkAuf("kurz")).toBeNull();
    // nicht mehr öffentlich -> kein Zugriff
    await aktualisiereVorlage(d.id, { sichtbarkeit: "mitarbeiter" }, userStaff);
    expect(await loeseLinkAuf(token)).toBeNull();
    await aktualisiereVorlage(d.id, { sichtbarkeit: "oeffentlich" }, userStaff);
    expect(await loeseLinkAuf(token)).not.toBeNull();
    // abgelaufen
    await query("UPDATE pers_access_links SET expires_at = now() - interval '1 minute' WHERE id = $1", [link.id]);
    expect(await loeseLinkAuf(token)).toBeNull();
    await query("UPDATE pers_access_links SET expires_at = NULL WHERE id = $1", [link.id]);
    // widerrufen
    await widerrufeLink(link.id);
    expect(await loeseLinkAuf(token)).toBeNull();
    // archiviert
    const { token: t2 } = await erstelleLink(d.id, { userId: userStaff });
    await archiviereVorlage(d.id);
    expect(await loeseLinkAuf(t2)).toBeNull();
  });

  it("zeigt Kunden nur öffentliche und zugeordnete aktive Vorlagen", async () => {
    const zugeordnet = await neueVorlage({ name: `Nur A ${tag}` }, { status: "aktiv", sichtbarkeit: "kunden" });
    const intern = await neueVorlage({ name: `Intern ${tag}` }, { status: "aktiv", sichtbarkeit: "mitarbeiter" });
    await setzeKunden(zugeordnet.id, [kundeA]);
    const a = (await vorlagenFuerKunde(kundeA)).map((v) => v.id);
    const b = (await vorlagenFuerKunde(kundeB)).map((v) => v.id);
    expect(a).toContain(zugeordnet.id);
    expect(b).not.toContain(zugeordnet.id);
    expect(a).not.toContain(intern.id);
    await expect(setzeKunden(zugeordnet.id, ["gibt-es-nicht"])).rejects.toMatchObject({ code: "kunde" });
  });
});

describe("Gast-Entwürfe", () => {
  it("verlangt das Token, läuft ab und wird gelöscht", async () => {
    const d = await neueVorlage({}, { status: "aktiv", sichtbarkeit: "oeffentlich" });
    const { entwurf, token } = await legeEntwurfAn(d.id);
    expect(await holeEntwurf(entwurf.id, "f".repeat(64))).toBeNull();
    expect(await holeEntwurf(entwurf.id, token)).not.toBeNull();
    const gespeichert = await speichereEntwurf(entwurf.id, token, { datensaetze: [{ werte: { name: "Anna" }, auflage: 3 }] });
    expect(gespeichert!.datensaetze).toHaveLength(1);
    expect(await speichereEntwurf(entwurf.id, "f".repeat(64), { datensaetze: [] })).toBeNull();
    await expect(speichereEntwurf(entwurf.id, token, { datensaetze: "kaputt" })).rejects.toBeInstanceOf(PersFehler);
    // Inaktive Vorlage: kein neuer Entwurf
    await aktualisiereVorlage(d.id, { status: "entwurf" }, userStaff);
    await expect(legeEntwurfAn(d.id)).rejects.toMatchObject({ status: 404 });
    // Ablauf
    await query("UPDATE pers_drafts SET expires_at = now() - interval '1 minute' WHERE id = $1", [entwurf.id]);
    expect(await holeEntwurf(entwurf.id, token)).toBeNull();
    expect(await sweepAbgelaufeneEntwuerfe()).toBeGreaterThanOrEqual(1);
    const rest = await query("SELECT 1 FROM pers_drafts WHERE id = $1", [entwurf.id]);
    expect(rest.rows).toHaveLength(0);
  });
});

describe("Druckdaten an einer Anfrage", () => {
  it("legt PDF und Datentabelle als request_files ab und verknüpft sie", async () => {
    await speichereSchrift(testSchrift("regular").bytes, { dateiname: "os.ttf", familie: "Open Sans", schnitt: "regular", userId: null });
    await speichereSchrift(testSchrift("bold").bytes, { dateiname: "osb.ttf", familie: "Open Sans", schnitt: "bold", userId: null });
    const d = await neueVorlage({}, { status: "aktiv", sichtbarkeit: "oeffentlich" });
    const anfrage = await createDraft({ productHint: "business-card", freeText: "Test", origin: "door_a", trust: "VOUCHED", prospectEmail: `${tag}@example.com` });
    const daten = [{ werte: { name: "Anna Beispiel", funktion: "Leitung", telefon: "07071 1", email: "a@b.de", ean: "4006381333931" }, auflage: 30 }];
    const r = await erzeugeDruckdatenFuerAnfrage(anfrage.id, { templateId: d.id, datensaetze: daten });
    expect(r.seiten).toBe(4); // 30 Nutzen = 2 Bögen, je Vorder- und Rückseite
    const dateien = await query<{ file_name: string; mime_type: string }>("SELECT file_name, mime_type FROM request_files WHERE request_id = $1 ORDER BY file_name", [anfrage.id]);
    expect(dateien.rows.map((x) => x.mime_type)).toEqual(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/pdf"]);
    const verkn = await query("SELECT template_version, page_count FROM pers_request_outputs WHERE request_id = $1", [anfrage.id]);
    expect(verkn.rows[0]).toMatchObject({ template_version: 1, page_count: 4 });
    // fehlerhafte Daten: nichts wird abgelegt
    await expect(erzeugeDruckdatenFuerAnfrage(anfrage.id, { templateId: d.id, datensaetze: [{ werte: { name: "" }, auflage: 1 }] })).rejects.toMatchObject({ code: "pruefung" });
    expect((await query("SELECT 1 FROM request_files WHERE request_id = $1", [anfrage.id])).rows).toHaveLength(2);
    await query("DELETE FROM requests WHERE id = $1", [anfrage.id]);
  });
});

describe("Routen: Rollen und Zugang", () => {
  const ctx = (o: { ref: string; id?: string }) => ({ params: Promise.resolve(o as { ref: string; id: string }) });
  const json = (body: unknown) => new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("Staff-Routen: 401 ohne Sitzung, 403 für Kunden, 200 für Mitarbeiter", async () => {
    const { GET } = await import("@/app/api/personalisierung/staff/vorlagen/route");
    sitzung.user = null;
    expect((await GET(new Request("http://x/api"))).status).toBe(401);
    sitzung.user = { id: kundeA, email: "a@example.com", name: null, role: "customer", status: "customer", firm: null };
    expect((await GET(new Request("http://x/api"))).status).toBe(403);
    sitzung.user = { id: userStaff, email: "s@example.com", name: null, role: "staff", status: "customer", firm: null };
    expect((await GET(new Request("http://x/api"))).status).toBe(200);
    const farben = await import("@/app/api/personalisierung/staff/farben/route");
    sitzung.user = { id: kundeA, email: "a@example.com", name: null, role: "customer", status: "customer", firm: null };
    expect((await farben.POST(json({ name: "x", cmyk: [0, 0, 0, 0] }))).status).toBe(403);
  });

  it("öffentlicher Zugang per Token liefert nur die Kundenansicht; ungültige Token geben 404", async () => {
    const d = await neueVorlage({}, { status: "aktiv", sichtbarkeit: "oeffentlich" });
    const { token } = await erstelleLink(d.id, { userId: userStaff });
    const { GET } = await import("@/app/api/personalisierung/z/[ref]/route");
    sitzung.user = null;
    const ok = await GET(new Request("http://x/api"), ctx({ ref: token }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.name).toContain("Karte");
    expect(body).not.toHaveProperty("felder");
    expect(JSON.stringify(body)).not.toContain(designId);
    expect((await GET(new Request("http://x/api"), ctx({ ref: "a".repeat(64) }))).status).toBe(404);
    // Vorlagen-ID ohne Anmeldung: 401, kein Zugang für Gäste
    expect((await GET(new Request("http://x/api"), ctx({ ref: d.id }))).status).toBe(401);
    // Kunde ohne Zuordnung bei kunden-Sichtbarkeit: 404
    await aktualisiereVorlage(d.id, { sichtbarkeit: "kunden" }, userStaff);
    sitzung.user = { id: kundeB, email: "b@example.com", name: null, role: "customer", status: "customer", firm: null };
    expect((await GET(new Request("http://x/api"), ctx({ ref: d.id }))).status).toBe(404);
    await setzeKunden(d.id, [kundeB]);
    expect((await GET(new Request("http://x/api"), ctx({ ref: d.id }))).status).toBe(200);
    sitzung.user = null;
  });

  it("Gast-Vorschau und Prüfung funktionieren, Rate-Limit greift", async () => {
    await speichereSchrift(testSchrift("regular").bytes, { dateiname: "os.ttf", familie: "Open Sans", schnitt: "regular", userId: null });
    await speichereSchrift(testSchrift("bold").bytes, { dateiname: "osb.ttf", familie: "Open Sans", schnitt: "bold", userId: null });
    const d = await neueVorlage({}, { status: "aktiv", sichtbarkeit: "oeffentlich" });
    const { token } = await erstelleLink(d.id, { userId: userStaff });
    sitzung.user = null;
    const pruefen = await import("@/app/api/personalisierung/z/[ref]/pruefen/route");
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    const req = (body: unknown) => new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
    const r = await pruefen.POST(req({ datensaetze: [{ werte: { name: "" } }] }), ctx({ ref: token }));
    const b = await r.json();
    expect(b.ok).toBe(false);
    expect(b.meldungen[0].code).toBe("pflicht_leer");
    const vorschau = await import("@/app/api/personalisierung/z/[ref]/vorschau/route");
    const pdf = await vorschau.POST(req({}), ctx({ ref: token }));
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    // Rate-Limit: Zähler künstlich hochsetzen
    await query(`INSERT INTO audit_log (action, actor_type, ip) SELECT 'pers_preview', 'system', $1 FROM generate_series(1, 200)`, [ip]);
    expect((await vorschau.POST(req({}), ctx({ ref: token }))).status).toBe(429);
    // zu viele Datensätze
    const viele = Array.from({ length: 2001 }, () => ({ werte: { name: "x" } }));
    expect((await pruefen.POST(req({ datensaetze: viele }), ctx({ ref: token }))).status).toBe(413);
    await query("DELETE FROM audit_log WHERE ip = $1", [ip]);
  });

  it("Tabellen-Upload ordnet Spalten zu und erhält führende Nullen", async () => {
    const d = await neueVorlage({}, { status: "aktiv", sichtbarkeit: "oeffentlich" });
    const { token } = await erstelleLink(d.id, { userId: userStaff });
    sitzung.user = null;
    const { POST } = await import("@/app/api/personalisierung/z/[ref]/tabelle/route");
    const form = new FormData();
    form.set("datei", new File(["Name;Telefon;Anzahl;Egal\nAnna;00491234;5;x\n"], "daten.csv", { type: "text/csv" }));
    const r = await POST(new Request("http://x/api", { method: "POST", body: form, headers: { "x-forwarded-for": "198.51.100.7" } }), ctx({ ref: token }));
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.datensaetze[0]).toMatchObject({ auflage: 5, werte: { name: "Anna", telefon: "00491234" } });
    expect(b.zuordnung.unbenutzt).toEqual([3]);
    expect(b.zuordnung.fehlend.map((f: { schluessel: string }) => f.schluessel)).toContain("email");
    const kaputt = new FormData();
    kaputt.set("datei", new File(["PK\u0003\u0004kaputt"], "x.xlsx"));
    expect((await POST(new Request("http://x/api", { method: "POST", body: kaputt }), ctx({ ref: token }))).status).toBe(400);
    await query("DELETE FROM audit_log WHERE ip = '198.51.100.7'");
  });
});
