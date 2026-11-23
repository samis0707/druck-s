import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

/**
 * Kalkulation (Richtpreis): Zugriffsschutz, optimistische Sperre, öffentlicher Endpunkt und
 * Snapshots, mit den Route-Handlern direkt gegen die lokale Postgres-Datenbank
 * (DATABASE_URL, mit `node db/migrate.js` befüllt). Kein Dev-Server, kein MinIO.
 */
let sitzung: { id: string; email: string; name: string | null; role: string; status: string; firm: string | null } | null = null;
vi.mock("@/lib/auth/session", async (orig) => {
  const echt = await orig<typeof import("@/lib/auth/session")>();
  return { ...echt, getSessionUser: async () => sitzung };
});

import { config } from "@/lib/config";
import { query } from "@/lib/db";
import { beispielSicherung } from "@/lib/kalkulation/beispieldaten";
import { datenZwischenspeicherLeeren } from "@/lib/kalkulation/daten";
import { abrufZaehlerLeeren } from "@/lib/kalkulation/begrenzung";
import { legeKeyAn, sperreKey } from "@/lib/kalkulation/keys";
import { berechneUndSpeichere, ladeSnapshots } from "@/lib/kalkulation/richtpreisService";
import { importieren, schreiben } from "@/lib/kalkulation/store";
import { GET as staffGet, POST as staffPost, PUT as staffPut } from "@/app/api/staff/kalkulation/[...pfad]/route";
import { GET as keyStatus } from "@/app/api/v1/kalkulation/status/route";
import { GET as keyArtikel } from "@/app/api/v1/kalkulation/artikel/route";
import { POST as keyKalkulieren } from "@/app/api/v1/kalkulation/artikel/[id]/kalkulieren/route";
import { GET as richtpreisArtikel } from "@/app/api/v1/richtpreis/artikel/route";
import { POST as richtpreisPost } from "@/app/api/v1/richtpreis/route";
import { GET as werkbankGet } from "@/app/staff/kalkulation/werkbank/[[...pfad]]/route";

const BASE = "http://localhost";
const STAFF = { id: "u-staff", email: "staff@example.com", name: "Sabine Staff", role: "staff", status: "customer", firm: null };
const KUNDE = { id: "u-kunde", email: "kunde@example.com", name: null, role: "customer", status: "customer", firm: null };

const req = (pfad: string, init: RequestInit & { ip?: string } = {}) => {
  const { ip, ...rest } = init;
  return new Request(`${BASE}${pfad}`, { ...rest, headers: { ...(ip ? { "x-forwarded-for": ip } : {}), ...(rest.headers as Record<string, string> | undefined) } });
};
const json = (pfad: string, methode: string, body: unknown, headers: Record<string, string> = {}) =>
  req(pfad, { method: methode, body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
const ctxPfad = (pfad: string) => ({ params: Promise.resolve({ pfad: pfad.split("/").filter(Boolean) }) });
const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });
let ipZaehler = 0;
const neueIp = () => `10.99.${Math.floor(ipZaehler / 250)}.${(ipZaehler++ % 250) + 1}`;

beforeAll(async () => {
  await query("TRUNCATE kalkulation_bereiche, kalkulation_verlauf, kalkulation_dateien, kalkulation_api_keys");
  await query("DELETE FROM app_settings WHERE key = 'kalkulation.preis'");
  const r = await importieren(beispielSicherung("2026-11-23"), "test", true);
  expect(r.ok).toBe(true);
  datenZwischenspeicherLeeren();
});

afterAll(async () => {
  await query("DELETE FROM audit_log WHERE action IN ('richtpreis_requested', 'richtpreis_saved', 'kalkulation_einstellungen_geaendert') AND (ip LIKE '10.99.%' OR ip IS NULL)");
});

beforeEach(() => {
  sitzung = null;
  abrufZaehlerLeeren();
});

describe("Mitarbeiter-Schnittstelle: Rollenprüfung", () => {
  const faelle: [string, () => Promise<Response>][] = [
    ["GET /v1/status", () => staffGet(req("/api/staff/kalkulation/v1/status"), ctxPfad("v1/status"))],
    ["GET /v1/artikel", () => staffGet(req("/api/staff/kalkulation/v1/artikel"), ctxPfad("v1/artikel"))],
    ["GET /v1/werkbank/daten", () => staffGet(req("/api/staff/kalkulation/v1/werkbank/daten"), ctxPfad("v1/werkbank/daten"))],
    ["GET /v1/werkbank/sicherung", () => staffGet(req("/api/staff/kalkulation/v1/werkbank/sicherung"), ctxPfad("v1/werkbank/sicherung"))],
    ["PUT /v1/werkbank/daten/x", () => staffPut(json("/api/staff/kalkulation/v1/werkbank/daten/werkbank.vorlagen.v1", "PUT", { json: "{}", version: 0 }), ctxPfad("v1/werkbank/daten/werkbank.vorlagen.v1"))],
    ["POST /v1/artikel/A/richtpreis", () => staffPost(json("/api/staff/kalkulation/v1/artikel/A-FLYER/richtpreis", "POST", { auflagen: [100] }), ctxPfad("v1/artikel/A-FLYER/richtpreis"))],
    ["GET /einstellungen", () => staffGet(req("/api/staff/kalkulation/einstellungen"), ctxPfad("einstellungen"))],
    ["PUT /einstellungen", () => staffPut(json("/api/staff/kalkulation/einstellungen", "PUT", { gewinnProzent: 50 }), ctxPfad("einstellungen"))],
    ["POST /import/vorschau", () => staffPost(json("/api/staff/kalkulation/import/vorschau", "POST", { sicherung: beispielSicherung("2026-11-23") }), ctxPfad("import/vorschau"))],
    ["POST /import", () => staffPost(json("/api/staff/kalkulation/import", "POST", { sicherung: beispielSicherung("2026-11-23"), pruefsumme: "x", bestaetigt: true }), ctxPfad("import"))],
    ["GET /stand", () => staffGet(req("/api/staff/kalkulation/stand"), ctxPfad("stand"))],
  ];

  it.each(faelle)("weist anonyme Aufrufe ab: %s", async (_n, aufruf) => {
    sitzung = null;
    expect((await aufruf()).status).toBe(401);
  });

  it.each(faelle)("weist Kunden ab: %s", async (_n, aufruf) => {
    sitzung = KUNDE;
    expect((await aufruf()).status).toBe(403);
  });

  it("lässt Mitarbeiter lesen", async () => {
    sitzung = STAFF;
    const r = await staffGet(req("/api/staff/kalkulation/v1/artikel"), ctxPfad("v1/artikel"));
    expect(r.status).toBe(200);
    const b = (await r.json()) as { artikel: { id: string }[] };
    expect(b.artikel.map((a) => a.id)).toContain("A-FLYER");
  });

  it("lehnt schreibende Aufrufe von fremder Herkunft ab (CSRF)", async () => {
    sitzung = STAFF;
    const r = await staffPut(json("/api/staff/kalkulation/einstellungen", "PUT", { gewinnProzent: 50 }, { origin: "https://boese.example" }), ctxPfad("einstellungen"));
    expect(r.status).toBe(403);
    const ok = await staffPut(json("/api/staff/kalkulation/einstellungen", "PUT", { gewinnProzent: 10 }, { origin: config.appBaseUrl }), ctxPfad("einstellungen"));
    expect(ok.status).toBe(200);
  });

  it("liefert die Werkbank nur an Mitarbeiter", async () => {
    const ctx = { params: Promise.resolve({ pfad: undefined }) };
    sitzung = null;
    const anonym = await werkbankGet(req("/staff/kalkulation/werkbank/", { headers: { accept: "text/html" } }), ctx);
    expect(anonym.status).toBe(307);
    expect(anonym.headers.get("location")).toContain("/staff/login");
    expect((await werkbankGet(req("/staff/kalkulation/werkbank/assets/x.js"), { params: Promise.resolve({ pfad: ["assets", "x.js"] }) })).status).toBe(401);
    sitzung = KUNDE;
    expect((await werkbankGet(req("/staff/kalkulation/werkbank/"), ctx)).status).toBe(403);
    sitzung = STAFF;
    const seite = await werkbankGet(req("/staff/kalkulation/werkbank/"), ctx);
    expect(seite.status).toBe(200);
    expect(await seite.text()).toContain('<div id="root">');
    expect(seite.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect((await werkbankGet(req("/x"), { params: Promise.resolve({ pfad: ["..", "..", "package.json"] }) })).status).toBe(404);
  });
});

describe("Maschinen-Schnittstelle: API-Schlüssel mit Scope", () => {
  let gut: string;
  let fremd: string;
  let gesperrt: string;
  beforeAll(async () => {
    gut = (await legeKeyAn("Test gut")).key;
    fremd = (await legeKeyAn("Test fremder Scope", ["anderes"])).key;
    const g = await legeKeyAn("Test gesperrt");
    gesperrt = g.key;
    await sperreKey(g.id);
  });
  const mit = (k: string) => ({ authorization: `Bearer ${k}` });

  it("verlangt einen gültigen Schlüssel", async () => {
    expect((await keyStatus(req("/api/v1/kalkulation/status"))).status).toBe(401);
    expect((await keyStatus(req("/api/v1/kalkulation/status", { headers: mit("kal_" + "0".repeat(64)) }))).status).toBe(401);
    expect((await keyStatus(req("/api/v1/kalkulation/status", { headers: { authorization: "Bearer murks" } }))).status).toBe(401);
    expect((await keyStatus(req("/api/v1/kalkulation/status", { headers: mit(gesperrt) }))).status).toBe(401);
  });

  it("lässt eine Mitarbeiter-Sitzung ohne Schlüssel nicht durch", async () => {
    sitzung = STAFF;
    expect((await keyArtikel(req("/api/v1/kalkulation/artikel"))).status).toBe(401);
    sitzung = KUNDE;
    expect((await keyArtikel(req("/api/v1/kalkulation/artikel"))).status).toBe(401);
  });

  it("prüft den Scope", async () => {
    const r = await keyArtikel(req("/api/v1/kalkulation/artikel", { headers: mit(fremd) }));
    expect(r.status).toBe(403);
  });

  it("liefert mit passendem Scope Artikel und Kosten", async () => {
    const a = await keyArtikel(req("/api/v1/kalkulation/artikel", { headers: mit(gut) }));
    expect(a.status).toBe(200);
    const k = await keyKalkulieren(json("/api/v1/kalkulation/artikel/A-FLYER/kalkulieren", "POST", { auflagen: [100, 1000], antworten: {} }, mit(gut)), ctxId("A-FLYER"));
    expect(k.status).toBe(200);
    const b = (await k.json()) as { art: string; auflagen: { kostenZehntelcent: number }[] };
    expect(b.art).toBe("kosten");
    expect(b.auflagen[0].kostenZehntelcent).toBeGreaterThan(0);
    const schlecht = await keyKalkulieren(json("/api/v1/kalkulation/artikel/A-FLYER/kalkulieren", "POST", { auflagen: [] }, mit(gut)), ctxId("A-FLYER"));
    expect(schlecht.status).toBe(400);
  });

  it("speichert nur gehasht", async () => {
    const r = await query<{ key_hash: string; key_prefix: string }>("SELECT key_hash, key_prefix FROM kalkulation_api_keys WHERE name = 'Test gut'");
    expect(r.rows[0].key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(gut).not.toContain(r.rows[0].key_hash);
    expect(gut.startsWith(r.rows[0].key_prefix)).toBe(true);
  });
});

describe("Stammdaten: optimistische Sperre und Verlauf", () => {
  const SCHLUESSEL = "werkbank.vorlagen.v1";
  const put = (version: number, text: string) =>
    staffPut(json(`/api/staff/kalkulation/v1/werkbank/daten/${SCHLUESSEL}`, "PUT", { json: text, version }), ctxPfad(`v1/werkbank/daten/${SCHLUESSEL}`));

  it("antwortet bei veralteter Version mit 409 und ändert nichts", async () => {
    sitzung = STAFF;
    const eins = await put(0, '{"a":1}');
    expect(eins.status).toBe(200);
    expect(((await eins.json()) as { version: number }).version).toBe(1);
    const alt = await put(0, '{"a":2}');
    expect(alt.status).toBe(409);
    expect(((await alt.json()) as { version: number }).version).toBe(1);
    const zwei = await put(1, '{"a":2}');
    expect(((await zwei.json()) as { version: number }).version).toBe(2);
    const r = await query<{ json: string }>("SELECT json FROM kalkulation_bereiche WHERE schluessel = $1", [SCHLUESSEL]);
    expect(r.rows[0].json).toBe('{"a":2}');
  });

  it("lässt bei gleichzeitigem Schreiben genau einen gewinnen", async () => {
    sitzung = STAFF;
    const aktuell = (await query<{ version: number }>("SELECT version FROM kalkulation_bereiche WHERE schluessel = $1", [SCHLUESSEL])).rows[0].version;
    const antworten = await Promise.all([put(aktuell, '{"b":1}'), put(aktuell, '{"b":2}'), put(aktuell, '{"b":3}')]);
    expect(antworten.map((a) => a.status).sort()).toEqual([200, 409, 409]);
  });

  it("gleicher Inhalt erzeugt keine neue Version; ungültiger Inhalt wird mit 422 abgelehnt", async () => {
    sitzung = STAFF;
    const v = (await query<{ version: number; json: string }>("SELECT version, json FROM kalkulation_bereiche WHERE schluessel = $1", [SCHLUESSEL])).rows[0];
    const gleich = await put(v.version, v.json);
    expect(((await gleich.json()) as { version: number }).version).toBe(v.version);
    const schlecht = await put(v.version, "kein json");
    expect(schlecht.status).toBe(422);
    const material = await staffPut(json("/api/staff/kalkulation/v1/werkbank/daten/werkbank.material.v1", "PUT", { json: '{"version":1,"materialien":"x"}', version: 1 }), ctxPfad("v1/werkbank/daten/werkbank.material.v1"));
    expect(material.status).toBe(422);
    const unbekannt = await staffPut(json("/api/staff/kalkulation/v1/werkbank/daten/gibt.es.nicht", "PUT", { json: "{}", version: 0 }), ctxPfad("v1/werkbank/daten/gibt.es.nicht"));
    expect(unbekannt.status).toBe(404);
  });

  it("hängt jeden Stand an den Verlauf an; der Verlauf ist unveränderlich", async () => {
    const n = (await query<{ n: string }>("SELECT count(*)::text AS n FROM kalkulation_verlauf WHERE schluessel = $1", [SCHLUESSEL])).rows[0].n;
    expect(Number(n)).toBeGreaterThanOrEqual(3);
    await expect(query("UPDATE kalkulation_verlauf SET json = 'x' WHERE schluessel = $1", [SCHLUESSEL])).rejects.toThrow(/nur anhängend/);
    await expect(query("DELETE FROM kalkulation_verlauf WHERE schluessel = $1", [SCHLUESSEL])).rejects.toThrow(/nur anhängend/);
  });

  it("stellt einen früheren Stand als neue Version wieder her", async () => {
    sitzung = STAFF;
    const v = (await query<{ version: number }>("SELECT version FROM kalkulation_bereiche WHERE schluessel = $1", [SCHLUESSEL])).rows[0].version;
    const r = await staffPost(json(`/api/staff/kalkulation/v1/werkbank/zurueck/${SCHLUESSEL}`, "POST", { version: 1, aktuell: v }), ctxPfad(`v1/werkbank/zurueck/${SCHLUESSEL}`));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { version: number }).version).toBe(v + 1);
    const j = (await query<{ json: string }>("SELECT json FROM kalkulation_bereiche WHERE schluessel = $1", [SCHLUESSEL])).rows[0].json;
    expect(j).toBe('{"a":1}');
    const veraltet = await staffPost(json(`/api/staff/kalkulation/v1/werkbank/zurueck/${SCHLUESSEL}`, "POST", { version: 1, aktuell: v }), ctxPfad(`v1/werkbank/zurueck/${SCHLUESSEL}`));
    expect(veraltet.status).toBe(409);
  });

  it("exportiert und importiert die werkbank-sicherung in beide Richtungen", async () => {
    sitzung = STAFF;
    const s = await staffGet(req("/api/staff/kalkulation/v1/werkbank/sicherung"), ctxPfad("v1/werkbank/sicherung"));
    const sicherung = (await s.json()) as { art: string; version: number; daten: Record<string, unknown> };
    expect(sicherung.art).toBe("werkbank-sicherung");
    expect(Object.keys(sicherung.daten)).toEqual(expect.arrayContaining(["werkbank.material.v1", "werkbank.produktion.v1", "werkbank.artikel.v1"]));
    // Vorschau: unverändert
    const vor = await staffPost(json("/api/staff/kalkulation/import/vorschau", "POST", { sicherung }), ctxPfad("import/vorschau"));
    const v = (await vor.json()) as { pruefsumme: string; bereiche: { status: string }[] };
    expect(v.bereiche.every((b) => b.status === "gleich" || b.status === "geaendert")).toBe(true);
    // Import ohne Bestätigung wird abgelehnt, mit falscher Prüfsumme ebenso
    expect((await staffPost(json("/api/staff/kalkulation/import", "POST", { sicherung }), ctxPfad("import"))).status).toBe(400);
    expect((await staffPost(json("/api/staff/kalkulation/import", "POST", { sicherung, pruefsumme: "falsch", bestaetigt: true }), ctxPfad("import"))).status).toBe(422);
    const ok = await staffPost(json("/api/staff/kalkulation/import", "POST", { sicherung, pruefsumme: v.pruefsumme, bestaetigt: true }), ctxPfad("import"));
    expect(ok.status).toBe(200);
    const audit = await query("SELECT 1 FROM audit_log WHERE action = 'kalkulation_stammdaten_import' AND actor_id = $1", [STAFF.id]);
    expect(audit.rowCount).toBeGreaterThan(0);
    // Kaputte Sicherung
    const kaputt = await staffPost(json("/api/staff/kalkulation/import/vorschau", "POST", { sicherung: { art: "werkbank-sicherung", daten: { "werkbank.material.v1": { version: 1, materialien: "x" } } } }), ctxPfad("import/vorschau"));
    expect(kaputt.status).toBe(422);
    const fremd = await staffPost(json("/api/staff/kalkulation/import/vorschau", "POST", { sicherung: { art: "etwas-anderes", daten: {} } }), ctxPfad("import/vorschau"));
    expect(fremd.status).toBe(422);
  });

  it("lässt sich ohne Datenverlust per Store-Funktion schreiben", async () => {
    const v = (await query<{ version: number }>("SELECT version FROM kalkulation_bereiche WHERE schluessel = $1", [SCHLUESSEL])).rows[0].version;
    expect(await schreiben(SCHLUESSEL, '{"c":1}', v + 5, "test")).toMatchObject({ ok: false, art: "konflikt" });
  });
});

describe("Öffentlicher Richtpreis", () => {
  const post = (body: unknown, ip = neueIp()) => richtpreisPost(json("/api/v1/richtpreis", "POST", body, { "x-forwarded-for": ip }));
  const antwortenFlyer = { endformat: "1", "teil:T1:woraus": "0", "teil:T1:druck": "0" };

  it("listet nur freigegebene Artikel ohne interne Angaben", async () => {
    const r = await richtpreisArtikel(req("/api/v1/richtpreis/artikel", { ip: neueIp() }));
    expect(r.status).toBe(200);
    const text = JSON.stringify(await r.json());
    const b = JSON.parse(text) as { artikel: { id: string; fragen: { schluessel: string }[] }[] };
    expect(b.artikel.map((a) => a.id).sort()).toEqual(["A-FLYER", "A-VISITENKARTE"]);
    expect(text).not.toMatch(/A-PLAKAT|Interne Notiz|beschreibung|kunde|stundensatz|zehntelcent|:wer/i);
    expect(b.artikel.find((a) => a.id === "A-FLYER")!.fragen.map((f) => f.schluessel)).toEqual(expect.arrayContaining(["endformat", "teil:T1:woraus", "teil:T1:druck"]));
  });

  it("rechnet einen Richtpreis als Spanne, ohne Kosten preiszugeben", async () => {
    const r = await post({ artikel: "A-FLYER", auflagen: [100, 1000], antworten: antwortenFlyer });
    expect(r.status).toBe(200);
    const text = JSON.stringify(await r.json());
    const b = JSON.parse(text) as { kennzeichnung: string; auflagen: { status: string; netto: { vonCent: number; richtpreisCent: number; bisCent: number }; brutto: { richtpreisCent: number }; mwstProzent: number }[] };
    expect(b.kennzeichnung).toBe("unverbindlicher Richtpreis");
    expect(b.auflagen).toHaveLength(2);
    for (const a of b.auflagen) {
      expect(a.status).toBe("preis");
      expect(a.netto.vonCent).toBeLessThanOrEqual(a.netto.richtpreisCent);
      expect(a.netto.bisCent).toBeGreaterThanOrEqual(a.netto.richtpreisCent);
      expect(a.brutto.richtpreisCent).toBeGreaterThan(a.netto.richtpreisCent);
    }
    expect(text).not.toMatch(/kosten|stundensatz|rechenweg|hinweise/i);
  });

  it("gibt bei unbeantworteten Fragen „Preis auf Anfrage“ statt eines Preises", async () => {
    const r = await post({ artikel: "A-FLYER", auflagen: [100], antworten: { endformat: "1" } });
    expect(r.status).toBe(200);
    const b = (await r.json()) as { auflagen: { status: string; gruende: string[] }[] };
    expect(b.auflagen[0].status).toBe("auf_anfrage");
    expect(b.auflagen[0].gruende.join(" ")).toMatch(/Angaben fehlen/);
    expect(JSON.stringify(b)).not.toMatch(/Cent/);
  });

  it("validiert streng mit deutschen Fehlermeldungen", async () => {
    const fall = async (body: unknown, status: number, text: RegExp) => {
      const r = await post(body);
      expect(r.status).toBe(status);
      expect(JSON.stringify(await r.json())).toMatch(text);
    };
    await fall({ artikel: "A-FLYER" }, 400, /Auflagen fehlen/);
    await fall({ artikel: "A-FLYER", auflagen: [] }, 400, /Mindestens eine Auflage/);
    await fall({ artikel: "A-FLYER", auflagen: [1, 2, 3, 4, 5, 6, 7] }, 400, /Höchstens 6 Auflagen/);
    await fall({ artikel: "A-FLYER", auflagen: [0] }, 400, /Auflage mindestens 1/);
    await fall({ artikel: "A-FLYER", auflagen: [1.5] }, 400, /ganze Zahl/);
    await fall({ artikel: "A-FLYER", auflagen: [2_000_000] }, 400, /höchstens 1\.000\.000/);
    await fall({ artikel: "A-FLYER", auflagen: [10], extra: 1 }, 400, /Unbekanntes Feld/);
    await fall({ auflagen: [10] }, 400, /Artikel fehlt/);
    await fall([], 400, /JSON-Objekt/);
    await fall({ artikel: "A-FLYER", auflagen: [10], antworten: { endformat: "99" } }, 400, /Diese Auswahl gibt es nicht/);
    await fall({ artikel: "A-FLYER", auflagen: [10], antworten: { gibtsnicht: "1" } }, 400, /Diese Frage gibt es für den Artikel nicht/);
    await fall({ artikel: "A-FLYER", auflagen: [10], antworten: { "teil:T1:wer": "0" } }, 400, /Diese Frage gibt es/);
    await fall({ artikel: "A-FLYER", auflagen: [10], antworten: { endformat: { breiteMm: 1, hoeheMm: 1 } } }, 400, /Breite mindestens 10 mm/);
    await fall({ artikel: "A-PLAKAT", auflagen: [10] }, 404, /gibt es nicht/);
    await fall({ artikel: "A-GIBTS-NICHT", auflagen: [10] }, 404, /gibt es nicht/);
  });

  it("weist ungültiges JSON und zu große Rümpfe ab", async () => {
    const kaputt = await richtpreisPost(req("/api/v1/richtpreis", { method: "POST", body: "{nicht json", ip: neueIp() }));
    expect(kaputt.status).toBe(400);
    expect(JSON.stringify(await kaputt.json())).toMatch(/kein gültiges JSON/);
    const gross = await richtpreisPost(req("/api/v1/richtpreis", { method: "POST", body: JSON.stringify({ artikel: "x".repeat(70_000), auflagen: [1] }), ip: neueIp() }));
    expect(gross.status).toBe(413);
  });

  it("begrenzt Berechnungen je IP-Adresse und Stunde", async () => {
    const alt = config.richtpreis.perIpPerHour;
    config.richtpreis.perIpPerHour = 3;
    try {
      const ip = neueIp();
      const body = { artikel: "A-VISITENKARTE", auflagen: [250], antworten: { "teil:T1:druck": "0" } };
      for (let i = 0; i < 3; i++) expect((await post(body, ip)).status).toBe(200);
      const zuViele = await post(body, ip);
      expect(zuViele.status).toBe(429);
      expect(zuViele.headers.get("retry-after")).toBe("3600");
      expect(JSON.stringify(await zuViele.json())).toMatch(/Zu viele Berechnungen/);
      expect((await post(body, neueIp())).status).toBe(200); // andere Adresse ist frei
    } finally {
      config.richtpreis.perIpPerHour = alt;
    }
  });

  it("begrenzt Abrufe der Artikelliste und speichert keine Personendaten außer der IP für die Zählung", async () => {
    const alt = config.richtpreis.artikelPerIpPerHour;
    config.richtpreis.artikelPerIpPerHour = 2;
    try {
      const ip = neueIp();
      expect((await richtpreisArtikel(req("/api/v1/richtpreis/artikel", { ip }))).status).toBe(200);
      expect((await richtpreisArtikel(req("/api/v1/richtpreis/artikel", { ip }))).status).toBe(200);
      expect((await richtpreisArtikel(req("/api/v1/richtpreis/artikel", { ip }))).status).toBe(429);
    } finally {
      config.richtpreis.artikelPerIpPerHour = alt;
    }
    const z = await query<{ detail: unknown; user_agent: string | null }>("SELECT detail, user_agent FROM audit_log WHERE action = 'richtpreis_requested' LIMIT 1");
    expect(z.rows[0].detail).toEqual({});
    expect(z.rows[0].user_agent).toBeNull();
  });
});

describe("Preis-Einstellungen und Snapshots", () => {
  it("wirken auf den öffentlichen Richtpreis und werden mit dem Snapshot festgehalten", async () => {
    sitzung = STAFF;
    const body = { artikel: "A-VISITENKARTE", auflagen: [500], antworten: { "teil:T1:druck": "0" } };
    const rechne = async () => {
      const r = await richtpreisPost(json("/api/v1/richtpreis", "POST", body, { "x-forwarded-for": neueIp() }));
      return ((await r.json()) as { auflagen: { netto: { richtpreisCent: number } }[] }).auflagen[0].netto.richtpreisCent;
    };
    await staffPut(json("/api/staff/kalkulation/einstellungen", "PUT", { gemeinkostenProzent: 0, gewinnProzent: 0, mindestpreisCent: 0, rundungSchrittCent: 1, rundungRichtung: "kaufmaennisch" }), ctxPfad("einstellungen"));
    const niedrig = await rechne();
    await staffPut(json("/api/staff/kalkulation/einstellungen", "PUT", { gemeinkostenProzent: 100, gewinnProzent: 100, mindestpreisCent: 0, rundungSchrittCent: 1, rundungRichtung: "kaufmaennisch" }), ctxPfad("einstellungen"));
    const hoch = await rechne();
    expect(hoch).toBeGreaterThan(niedrig * 3.5); // (1+100%)·(1+100%) = 4-fach
    const ungueltig = await staffPut(json("/api/staff/kalkulation/einstellungen", "PUT", { gewinnProzent: -5 }), ctxPfad("einstellungen"));
    expect(ungueltig.status).toBe(400);
    // Snapshot an einer Anfrage
    const anfrage = await query<{ id: string }>(`INSERT INTO requests (trust, origin, product_hint, free_text) VALUES ('VOUCHED', 'inquiry', 'flyer', 'Test Kalkulation') RETURNING id`);
    const id = anfrage.rows[0].id;
    try {
      const s = await berechneUndSpeichere(id, "A-VISITENKARTE", { "teil:T1:druck": "0" }, [100, 500]);
      expect(s.ok).toBe(true);
      const post = await staffPost(json(`/api/staff/kalkulation/anfragen/${id}/richtpreis`, "POST", { artikel: "A-VISITENKARTE", auflagen: [250], antworten: { "teil:T1:druck": "0" } }), ctxPfad(`anfragen/${id}/richtpreis`));
      expect(post.status).toBe(201);
      const liste = await ladeSnapshots(id);
      expect(liste).toHaveLength(2);
      expect(liste[0].preisEinstellungen.gewinnProzent).toBe(100);
      expect(liste[0].kalpriHerkunft).toMatchObject({ commit: expect.any(String) });
      expect(liste[0].artikelTitel).toBe("Visitenkarten");
      const abfrage = await staffGet(req(`/api/staff/kalkulation/anfragen/${id}/richtpreis`), ctxPfad(`anfragen/${id}/richtpreis`));
      expect(((await abfrage.json()) as { richtpreise: unknown[] }).richtpreise).toHaveLength(2);
      sitzung = KUNDE;
      expect((await staffGet(req(`/api/staff/kalkulation/anfragen/${id}/richtpreis`), ctxPfad(`anfragen/${id}/richtpreis`))).status).toBe(403);
      sitzung = STAFF;
      expect((await staffPost(json(`/api/staff/kalkulation/anfragen/${id}/richtpreis`, "POST", { artikel: "A-VISITENKARTE", auflagen: [] }), ctxPfad(`anfragen/${id}/richtpreis`))).status).toBe(400);
    } finally {
      await query("DELETE FROM requests WHERE id = $1", [id]); // request_quotes folgt per ON DELETE CASCADE
    }
    const rest = await query("SELECT 1 FROM request_quotes WHERE request_id = $1", [id]);
    expect(rest.rowCount).toBe(0);
  });

  it("rechnet Ad-hoc mit Rechenweg für Mitarbeiter", async () => {
    sitzung = STAFF;
    const r = await staffPost(json("/api/staff/kalkulation/v1/artikel/A-FLYER/richtpreis", "POST", { auflagen: [100, 250], antworten: { endformat: "1", "teil:T1:woraus": "0", "teil:T1:druck": "0", "teil:T1:wer": "0" } }), ctxPfad("v1/artikel/A-FLYER/richtpreis"));
    expect(r.status).toBe(200);
    const b = (await r.json()) as { auflagen: { kostenZehntelcent: number; richtpreis: { status: string } }[]; zeilen: { zeilen: { rechenweg: string[] }[] }[]; offen: string[] };
    expect(b.auflagen).toHaveLength(2);
    expect(b.auflagen[0].richtpreis.status).toBe("preis");
    expect(b.zeilen[0].zeilen.length).toBeGreaterThan(0);
    expect(b.offen).toEqual([]);
    const zuViele = await staffPost(json("/api/staff/kalkulation/v1/artikel/A-FLYER/richtpreis", "POST", { auflagen: [1, 2, 3, 4, 5, 6, 7] }), ctxPfad("v1/artikel/A-FLYER/richtpreis"));
    expect(zuViele.status).toBe(400);
  });
});
