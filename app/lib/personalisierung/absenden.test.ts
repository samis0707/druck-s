/**
 * Absenden und Bestätigen (Postgres, DATABASE_URL; Objektspeicher, Session und Mail sind gemockt).
 * Geprüft über die Routen: Code, Neuberechnung serverseitig, Interessent vs. Konto, Token-Prüfung.
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
const mails: { to: string; subject: string; text: string }[] = [];
vi.mock("@/lib/mail", () => ({ sendMail: async (m: { to: string; subject: string; text: string }) => void mails.push({ to: m.to, subject: m.subject, text: m.text }) }));
vi.mock("@/lib/analyze/run", () => ({ analyzeRequest: async () => undefined }));
vi.mock("@/lib/assistantNote", () => ({ generateNote: async () => undefined }));

const sitzung: { user: null | { id: string; email: string; name: null; role: string; status: string; firm: null } } = { user: null };
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => sitzung.user,
  isStaff: (u: { role: string }) => u.role === "staff" || u.role === "admin",
}));
vi.mock("@/lib/guards", () => ({
  clientIp: () => "203.0.113.7",
  requireStaff: async () => ({ user: sitzung.user }),
}));

import { query } from "@/lib/db";
import { config } from "@/lib/config";
import { aktualisiereVorlage, erstelleLink, erstelleVorlage, legeEntwurfAn, speichereDatei, speichereEntwurf } from "./repo";
import { testDesign, testSchrift, testVorlage } from "./test-support";
import { speichereSchrift } from "./repo";
import { POST as absenden } from "@/app/api/personalisierung/z/[ref]/absenden/route";
import { POST as bestaetigen } from "@/app/api/personalisierung/z/[ref]/bestaetigen/route";

const tag = randomUUID().slice(0, 8);
let designId = "";
let staffId = "";
let kundeId = "";
let kundeEmail = "";
let templateId = "";
let token = "";

async function nutzer(rolle: string, status = "customer"): Promise<{ id: string; email: string }> {
  const id = `abs-${tag}-${rolle}-${randomUUID().slice(0, 6)}`;
  const email = `${id}@example.com`;
  await query(`INSERT INTO "user" (id, email, role, status, name) VALUES ($1, $2, $3, $4, $5)`, [id, email, rolle, status, "Test Person"]);
  return { id, email };
}

function req(body: unknown, entwurfToken?: string): Request {
  return new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", ...(entwurfToken ? { "x-entwurf-token": entwurfToken } : {}) }, body: JSON.stringify(body) });
}
const ctx = (ref: string) => ({ params: Promise.resolve({ ref }) });

async function entwurfMit(ref: { templateId: string }, werte: Record<string, string>[], opt: { auflage?: number } = {}) {
  const { entwurf, token: t } = await legeEntwurfAn(ref.templateId);
  await speichereEntwurf(entwurf.id, t, { datensaetze: werte.map((w) => ({ werte: w, auflage: opt.auflage ?? 1 })) });
  return { id: entwurf.id, token: t };
}

function letzterCode(an: string): string {
  const m = [...mails].reverse().find((x) => x.to === an && x.subject.startsWith("Ihr Bestätigungscode"));
  if (!m) throw new Error("keine Code-Mail");
  return m.subject.match(/(\d{6})/)![1];
}

beforeAll(async () => {
  designId = (await speichereDatei("design", "design.pdf", await testDesign(91, 61), null)).datei.id;
  await speichereSchrift(testSchrift("regular").bytes, { dateiname: "os.ttf", userId: null });
  await speichereSchrift(testSchrift("bold").bytes, { dateiname: "osb.ttf", userId: null });
  const staff = await nutzer("staff");
  staffId = staff.id;
  const k = await nutzer("customer");
  kundeId = k.id;
  kundeEmail = k.email;
  const d = await erstelleVorlage(testVorlage({ name: `Abs ${tag}`, design: { dateiId: designId, vorne: 1, hinten: 2, mitBeschnitt: true } }), { userId: staffId, status: "aktiv", sichtbarkeit: "oeffentlich" });
  templateId = d.id;
  token = (await erstelleLink(d.id, { userId: staffId })).token;
  sitzung.user = null;
});

afterAll(async () => {
  await query(`DELETE FROM requests WHERE free_text LIKE $1 OR prospect_email LIKE $2 OR customer_id LIKE $3`, [`%Abs ${tag}%`, `%${tag}%`, `abs-${tag}-%`]);
  await query(`DELETE FROM pers_templates WHERE name LIKE $1`, [`%${tag}%`]);
  await query(`DELETE FROM "user" WHERE id LIKE $1 OR email LIKE $2`, [`abs-${tag}-%`, `%${tag}%`]);
  await query(`DELETE FROM pers_fonts WHERE family = 'Open Sans'`);
});

const KONTAKT = (email: string) => ({ name: "Gerda Gast", email, organisation: "Verein", phone: null });

describe("Absenden als Gast (Token-Link, Code per E-Mail)", () => {
  it("Interessent: Code, falscher Code, Bestätigung, Druckdaten serverseitig, Entwurf gelöscht", async () => {
    const e = await entwurfMit({ templateId }, [{ name: "Anna Beispiel", telefon: "07131 1" }, { name: "Bernd Beispiel", telefon: "07131 2" }], { auflage: 5 });
    const email = `interessent-${tag}@example.com`;
    const r1 = await absenden(req({ entwurfId: e.id, kontakt: KONTAKT(email), anmerkung: "Bitte bis Freitag" }, e.token), ctx(token));
    expect(r1.status).toBe(202);
    const j1 = await r1.json();
    expect(j1).toMatchObject({ modus: "code" });
    expect(j1.sentTo).not.toContain("interessent"); // maskiert
    const anfrageId = j1.anfrageId as string;
    // noch nicht eingegangen, noch keine Dateien, Beschreibung ohne Datensatzwerte
    const vor = await query<{ status: string; free_text: string; n: string }>("SELECT status, free_text, (SELECT count(*)::text FROM request_files WHERE request_id = r.id) AS n FROM requests r WHERE id = $1", [anfrageId]);
    expect(vor.rows[0]).toMatchObject({ status: "DRAFT", n: "0" });
    expect(vor.rows[0].free_text).toContain("Datensätze: 2, Auflage gesamt: 10");
    expect(vor.rows[0].free_text).not.toContain("Anna");
    expect(vor.rows[0].free_text).toContain("Bitte bis Freitag");

    const falsch = await bestaetigen(req({ entwurfId: e.id, anfrageId, code: "000000" === letzterCode(email) ? "111111" : "000000" }, e.token), ctx(token));
    expect(falsch.status).toBe(400);
    expect((await falsch.json()).code).toBe("invalid_code");

    const ok = await bestaetigen(req({ entwurfId: e.id, anfrageId, code: letzterCode(email) }, e.token), ctx(token));
    expect(ok.status).toBe(200);
    const jo = await ok.json();
    expect(jo.nummer).toMatch(/^\d{6}-\d{3}$/);
    expect(jo.kunde).toBe(false);

    const rr = await query<{ status: string; origin: string; trust: string; customer_id: string | null; prospect_email: string | null }>("SELECT status, origin, trust, customer_id, prospect_email FROM requests WHERE id = $1", [anfrageId]);
    expect(rr.rows[0]).toMatchObject({ status: "RECEIVED", origin: "inquiry", trust: "VOUCHED", customer_id: null, prospect_email: email });
    const dateien = await query<{ file_name: string }>("SELECT file_name FROM request_files WHERE request_id = $1 ORDER BY file_name", [anfrageId]);
    expect(dateien.rows.map((d) => d.file_name.split(".").pop()).sort()).toEqual(["pdf", "xlsx"]);
    const out = await query<{ record_count: number; nutzen_count: number; template_version: number }>("SELECT record_count, nutzen_count, template_version FROM pers_request_outputs WHERE request_id = $1", [anfrageId]);
    expect(out.rows[0]).toMatchObject({ record_count: 2, nutzen_count: 10, template_version: 1 });
    expect((await query("SELECT 1 FROM pers_drafts WHERE id = $1", [e.id])).rows).toHaveLength(0);
    // Team-Hinweis mit Kennzeichen Personalisierung
    const notice = mails.find((m) => m.to === config.firmInbox && m.subject.includes(`Abs ${tag}`) === false && m.text.includes("Personalisierung"));
    expect(notice?.subject).toContain("(Personalisierung)");
    // Bestätigung ein zweites Mal geht nicht (Entwurf weg)
    const nochmal = await bestaetigen(req({ entwurfId: e.id, anfrageId, code: "123456" }, e.token), ctx(token));
    expect(nochmal.status).toBe(404);
  });

  it("bekannte Kunden-E-Mail: an das Konto gebunden", async () => {
    const e = await entwurfMit({ templateId }, [{ name: "Carla" }]);
    const r1 = await absenden(req({ entwurfId: e.id, kontakt: KONTAKT(kundeEmail) }, e.token), ctx(token));
    expect(r1.status).toBe(202);
    const { anfrageId } = await r1.json();
    const ok = await bestaetigen(req({ entwurfId: e.id, anfrageId, code: letzterCode(kundeEmail) }, e.token), ctx(token));
    expect(ok.status).toBe(200);
    expect((await ok.json()).kunde).toBe(true);
    const rr = await query<{ customer_id: string; trust: string; prospect_email: string | null }>("SELECT customer_id, trust, prospect_email FROM requests WHERE id = $1", [anfrageId]);
    expect(rr.rows[0]).toMatchObject({ customer_id: kundeId, trust: "VERIFIED", prospect_email: null });
  });

  it("prüft Token und Zugehörigkeit des Entwurfs; ohne Zugang keine Antwort auf Existenz", async () => {
    const e = await entwurfMit({ templateId }, [{ name: "Dora" }]);
    const kontakt = KONTAKT(`tok-${tag}@example.com`);
    expect((await absenden(req({ entwurfId: e.id, kontakt }, "f".repeat(64)), ctx(token))).status).toBe(404); // falsches Entwurfs-Token
    expect((await absenden(req({ entwurfId: e.id, kontakt }), ctx(token))).status).toBe(404); // ohne Token
    expect((await absenden(req({ entwurfId: e.id, kontakt }, e.token), ctx("0".repeat(64)))).status).toBe(404); // falscher Link
    expect((await absenden(req({ entwurfId: e.id, kontakt }, e.token), ctx("kein-token"))).status).toBe(404);
    expect((await absenden(req({ entwurfId: randomUUID(), kontakt }, e.token), ctx(token))).status).toBe(404);
    // Entwurf einer anderen Vorlage mit gültigem Link dieser Vorlage
    const andere = await erstelleVorlage(testVorlage({ name: `Abs2 ${tag}`, design: { dateiId: designId, vorne: 1, hinten: 2, mitBeschnitt: true } }), { userId: staffId, status: "aktiv", sichtbarkeit: "oeffentlich" });
    const fremd = await entwurfMit({ templateId: andere.id }, [{ name: "Emil" }]);
    expect((await absenden(req({ entwurfId: fremd.id, kontakt }, fremd.token), ctx(token))).status).toBe(404);
    // ungültiger Kontakt, leere Liste
    expect((await absenden(req({ entwurfId: e.id, kontakt: { name: "", email: "kaputt" } }, e.token), ctx(token))).status).toBe(400);
    const leer = await entwurfMit({ templateId }, []);
    expect((await absenden(req({ entwurfId: leer.id, kontakt }, leer.token), ctx(token))).status).toBe(400);
    // Bestätigen ohne vorheriges Absenden
    expect((await bestaetigen(req({ entwurfId: e.id, anfrageId: randomUUID(), code: "123456" }, e.token), ctx(token))).status).toBe(404);
  });

  it("rechnet serverseitig nach: Fehler in den Eingaben verhindern das Absenden, egal was der Browser meint", async () => {
    const e = await entwurfMit({ templateId }, [{ name: "" }]); // Pflichtfeld „name“ leer
    const r = await absenden(req({ entwurfId: e.id, kontakt: KONTAKT(`fehler-${tag}@example.com`), geprueft: true, ok: true }, e.token), ctx(token));
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.code).toBe("pruefung");
    expect(JSON.stringify(j.details)).toContain("pflicht_leer");
    const zu = await entwurfMit({ templateId }, [{ name: "x".repeat(41) }]); // länger als maxLaenge 40
    expect((await absenden(req({ entwurfId: zu.id, kontakt: KONTAKT(`fehler2-${tag}@example.com`) }, zu.token), ctx(token))).status).toBe(400);
  });

  it("laufende Entwürfe bleiben an ihrer Version, auch wenn danach neu veröffentlicht wurde", async () => {
    const d = await erstelleVorlage(testVorlage({ name: `Abs3 ${tag}`, design: { dateiId: designId, vorne: 1, hinten: 2, mitBeschnitt: true } }), { userId: staffId, status: "aktiv", sichtbarkeit: "oeffentlich" });
    const t = (await erstelleLink(d.id, { userId: staffId })).token;
    const e = await entwurfMit({ templateId: d.id }, [{ name: "Fritz" }]);
    await aktualisiereVorlage(d.id, { vorlage: { ...d.vorlage, beschreibung: "neu" } }, staffId); // Version 2
    const email = `version-${tag}@example.com`;
    const { anfrageId } = await (await absenden(req({ entwurfId: e.id, kontakt: KONTAKT(email) }, e.token), ctx(t))).json();
    expect((await bestaetigen(req({ entwurfId: e.id, anfrageId, code: letzterCode(email) }, e.token), ctx(t))).status).toBe(200);
    const out = await query<{ template_version: number }>("SELECT template_version FROM pers_request_outputs WHERE request_id = $1", [anfrageId]);
    expect(out.rows[0].template_version).toBe(1);
  });

  it("zweites Absenden desselben Entwurfs verwendet die Anfrage weiter (kein Stapel offener Anfragen)", async () => {
    const e = await entwurfMit({ templateId }, [{ name: "Gina" }]);
    const email = `zwei-${tag}@example.com`;
    const a = await (await absenden(req({ entwurfId: e.id, kontakt: KONTAKT(email) }, e.token), ctx(token))).json();
    const b = await (await absenden(req({ entwurfId: e.id, kontakt: KONTAKT(email) }, e.token), ctx(token))).json();
    expect(b.anfrageId).toBe(a.anfrageId);
  });
});

describe("Direkt absenden (Kunde mit Konto, Mitarbeiter für Kunden)", () => {
  it("Kunde: sofort eingegangen, an sein Konto gebunden; Gast-Weg gesperrt", async () => {
    sitzung.user = { id: kundeId, email: kundeEmail, name: null, role: "customer", status: "customer", firm: null };
    const e = await entwurfMit({ templateId }, [{ name: "Hanna" }]);
    const r = await absenden(req({ entwurfId: e.id, anmerkung: "danke" }, e.token), ctx(templateId));
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j.modus).toBe("direkt");
    expect(j.nummer).toMatch(/^\d{6}-\d{3}$/);
    const rr = await query<{ status: string; customer_id: string }>("SELECT status, customer_id FROM requests WHERE id = $1", [j.anfrageId]);
    expect(rr.rows[0]).toMatchObject({ status: "RECEIVED", customer_id: kundeId });
    // Kunde darf nicht im Namen eines anderen senden
    const e2 = await entwurfMit({ templateId }, [{ name: "Ida" }]);
    const fremd = await nutzer("customer");
    expect((await absenden(req({ entwurfId: e2.id, fuerKundeId: fremd.id }, e2.token), ctx(templateId))).status).toBe(403);
    // Bestätigen mit Code ist für Angemeldete nicht vorgesehen
    expect((await bestaetigen(req({ entwurfId: e2.id, anfrageId: randomUUID(), code: "123456" }, e2.token), ctx(templateId))).status).toBe(400);
    sitzung.user = null;
  });

  it("Mitarbeiter: im Namen eines Kunden; nur für freigeschaltete Kunden", async () => {
    sitzung.user = { id: staffId, email: "staff@example.com", name: null, role: "staff", status: "customer", firm: null };
    const e = await entwurfMit({ templateId }, [{ name: "Jan" }]);
    expect((await absenden(req({ entwurfId: e.id }, e.token), ctx(templateId))).status).toBe(400); // Kunde fehlt
    expect((await absenden(req({ entwurfId: e.id, fuerKundeId: staffId }, e.token), ctx(templateId))).status).toBe(400); // kein Kunde
    const interessent = await nutzer("customer", "prospect");
    expect((await absenden(req({ entwurfId: e.id, fuerKundeId: interessent.id }, e.token), ctx(templateId))).status).toBe(400);
    const r = await absenden(req({ entwurfId: e.id, fuerKundeId: kundeId }, e.token), ctx(templateId));
    expect(r.status).toBe(201);
    const j = await r.json();
    const rr = await query<{ customer_id: string; status: string }>("SELECT customer_id, status FROM requests WHERE id = $1", [j.anfrageId]);
    expect(rr.rows[0]).toMatchObject({ customer_id: kundeId, status: "RECEIVED" });
    const ev = await query<{ detail: { imNamenDesKunden?: boolean } }>("SELECT detail FROM request_events WHERE request_id = $1 AND event = 'submitted'", [j.anfrageId]);
    expect(ev.rows[0].detail.imNamenDesKunden).toBe(true);
    sitzung.user = null;
  });

  it("ohne Anmeldung gibt es für Vorlagen-IDs nur 401", async () => {
    const e = await entwurfMit({ templateId }, [{ name: "Kai" }]);
    expect((await absenden(req({ entwurfId: e.id }, e.token), ctx(templateId))).status).toBe(401);
  });
});
