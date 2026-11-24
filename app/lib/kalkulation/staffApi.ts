/**
 * Mitarbeiter-Schnittstelle der Kalkulation: /api/staff/kalkulation/<pfad>. Die Pfade unter /v1
 * entsprechen dem Vertrag der kalpri-Schnittstelle, sodass die eingebettete Werkbank unverändert
 * dagegen synchronisieren kann (Adresse = /api/staff/kalkulation, Anmeldung = Sitzungs-Cookie).
 *
 *   /v1/werkbank/…                     Stammdaten-Sync der Werkbank (daten, sicherung, verlauf, import, …)
 *   /v1/werkbank/dateien[/{sha256}]    Stammdaten-Dateien (Inhalt im S3-Speicher)
 *   /v1/status|artikel|kalkulationen|taetigkeiten   wie die kalpri-Schnittstelle
 *   POST /v1/artikel/{id}/richtpreis   Ad-hoc-Kalkulation mit Richtpreis und Rechenweg
 *   GET|PUT /einstellungen             Preis-Einstellungen
 *   POST /import/vorschau|/import      Import einer werkbank-sicherung mit Vorschau
 *   GET /stand                         Stand der Stammdaten (Version, Änderung, Anzahl je Bereich)
 *   GET|POST /anfragen/{id}/richtpreis Richtpreis-Snapshots einer Anfrage lesen bzw. anlegen
 *
 * Jede Anfrage braucht eine Mitarbeiter-Sitzung (requireStaff); schreibende Anfragen prüfen
 * zusätzlich den Ursprung (CSRF).
 */
import { createHash } from "node:crypto";
import { z } from "zod/v3";
import { appendAudit } from "../auditLog";
import { clientIp, requireStaff } from "../guards";
import { query } from "../db";
import { bereich } from "./bereiche";
import { ladeDaten } from "./daten";
import { ladePreisEinstellungen, speicherePreisEinstellungen } from "./einstellungen";
import { kundenRichtpreisAktiv, ladeZuordnung, setzeKundenRichtpreisAktiv, speichereZuordnung } from "./kundenRichtpreis";
import { PRODUCT_HINTS } from "../ui-text";
import { RUMPF_MAX, RUMPF_MAX_WERKBANK, gleicherUrsprung, kalkJson, leseJson, leseRumpf } from "./http";
import { uebernehmeImport, vorschauImport, zaehlungen } from "./import";
import { RICHTPREIS_HINWEIS } from "./richtpreis";
import { berechneIntern, berechneUndSpeichere, ladeSnapshots } from "./richtpreisService";
import { API_VERSION, KalkulierenSchema, anfrage, shopFreigegeben } from "./schnittstelle";
import { DATEI_MAX, alleBereiche, dateiLesen, dateiSpeichern, dateienUmfang } from "./store";
import { werkbankAnfrage } from "./werkbank-api";
import { heuteIso } from "./zeit";

const SnapshotSchema = KalkulierenSchema.extend({ artikel: z.string().min(1).max(80) });

type Mitarbeiter = { id: string; email: string; name: string | null };
const wer = (u: Mitarbeiter) => (u.name?.trim() || u.email).slice(0, 60);

function antwort(a: { status: number; body: unknown }) {
  return kalkJson(a.body, a.status);
}
const fehler = (status: number, meldung: string, details?: unknown) =>
  kalkJson(details === undefined ? { fehler: meldung } : { fehler: meldung, details }, status);

export async function staffKalkulation(req: Request, teile: string[]): Promise<Response> {
  const g = await requireStaff(req);
  if (!("user" in g) || !g.user) return g.error ?? kalkJson({ error: "Authentication required" }, 401);
  const user = g.user;
  const methode = req.method.toUpperCase();
  if (methode !== "GET" && methode !== "HEAD" && !gleicherUrsprung(req)) return fehler(403, "Anfrage von fremder Herkunft abgelehnt");

  const pfad = "/" + teile.join("/");
  const heute = heuteIso();

  // --- Einstellungen und Import (eigene Pfade, kein kalpri-Vertrag) -------------------------
  if (teile[0] === "einstellungen" && teile.length === 1) {
    if (methode === "GET") return kalkJson({ einstellungen: await ladePreisEinstellungen() });
    if (methode === "PUT") {
      const j = await leseJson(req);
      if (!j.ok) return fehler(j.status, j.meldung);
      const r = await speicherePreisEinstellungen(j.wert, wer(user));
      if (!r.ok) return fehler(400, "Einstellungen ungültig", r.fehler);
      await appendAudit({ action: "kalkulation_einstellungen_geaendert", actorType: "staff", actorId: user.id, ip: clientIp(req), detail: { einstellungen: r.wert } });
      return kalkJson({ einstellungen: r.wert });
    }
  }
  // Richtpreis für Kunden: Schalter und Zuordnung Produkt → Artikel
  if (teile[0] === "einstellungen" && teile[1] === "kunden" && teile.length === 2) {
    if (methode === "GET") {
      const g = await ladeDaten();
      return kalkJson({
        aktiv: await kundenRichtpreisAktiv(),
        zuordnung: await ladeZuordnung(),
        produkte: PRODUCT_HINTS,
        artikel: g.ok ? g.daten.artikel.filter((a) => a.archiviert !== true).map((a) => ({ id: a.id, titel: a.titel, freigegeben: shopFreigegeben(a) })) : [],
        stammdatenVorhanden: g.ok,
      });
    }
    if (methode === "PUT") {
      const j = await leseJson(req);
      if (!j.ok) return fehler(j.status, j.meldung);
      const b = (j.wert ?? {}) as { aktiv?: unknown; zuordnung?: unknown };
      if (b.aktiv !== undefined && typeof b.aktiv !== "boolean") return fehler(400, "„aktiv“ muss true oder false sein");
      const vorher = { aktiv: await kundenRichtpreisAktiv(), zuordnung: await ladeZuordnung() };
      if (b.zuordnung !== undefined) {
        const z = await speichereZuordnung(b.zuordnung, wer(user));
        if (!z.ok) return fehler(400, "Zuordnung ungültig", z.fehler);
      }
      if (typeof b.aktiv === "boolean") await setzeKundenRichtpreisAktiv(b.aktiv, wer(user));
      const nachher = { aktiv: await kundenRichtpreisAktiv(), zuordnung: await ladeZuordnung() };
      await appendAudit({ action: "kalkulation_kunden_richtpreis_geaendert", actorType: "staff", actorId: user.id, ip: clientIp(req), detail: { vorher, nachher } });
      return kalkJson(nachher);
    }
  }
  if (teile[0] === "import" && methode === "POST" && (teile.length === 1 || (teile.length === 2 && teile[1] === "vorschau"))) {
    const j = await leseJson(req, RUMPF_MAX_WERKBANK);
    if (!j.ok) return fehler(j.status, j.meldung);
    const b = (j.wert ?? {}) as { sicherung?: unknown; pruefsumme?: unknown; bestaetigt?: unknown };
    if (teile.length === 2) {
      const v = await vorschauImport(b.sicherung);
      return v.ok ? kalkJson(v) : kalkJson({ fehler: "Sicherung ungültig", details: v.meldungen }, 422);
    }
    if (b.bestaetigt !== true || typeof b.pruefsumme !== "string") return fehler(400, "Import muss bestätigt werden (Vorschau zuerst)");
    const r = await uebernehmeImport(b.sicherung, { pruefsumme: b.pruefsumme, von: wer(user), akteur: { typ: "staff", id: user.id }, ip: clientIp(req), quelle: "oberflaeche" });
    return r.ok ? kalkJson({ importiert: r.bereiche }) : kalkJson({ fehler: "Import abgelehnt", details: r.meldungen }, 422);
  }

  if (teile[0] === "stand" && teile.length === 1 && methode === "GET") {
    const bereiche = await alleBereiche();
    return kalkJson({
      bereiche: bereiche.map((b) => ({
        schluessel: b.schluessel,
        name: bereich(b.schluessel)?.name ?? b.schluessel,
        version: b.version,
        geaendertAm: b.geaendertAm,
        geaendertVon: b.geaendertVon,
        zaehlungen: zaehlungen(b.json),
      })),
      dateien: await dateienUmfang(),
    });
  }

  if (teile[0] === "anfragen" && teile[2] === "richtpreis" && teile.length === 3) {
    const requestId = teile[1];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return fehler(404, "Anfrage nicht gefunden");
    if (methode === "GET") return kalkJson({ richtpreise: await ladeSnapshots(requestId) });
    if (methode === "POST") {
      const j = await leseJson(req);
      if (!j.ok) return fehler(j.status, j.meldung);
      const e = SnapshotSchema.safeParse(j.wert);
      if (!e.success) return fehler(400, "Anfrage ungültig", e.error.issues.map((i) => ({ pfad: i.path.join("."), meldung: i.message })));
      const exists = await query("SELECT 1 FROM requests WHERE id = $1", [requestId]);
      if (exists.rowCount === 0) return fehler(404, "Anfrage nicht gefunden");
      const r = await berechneUndSpeichere(requestId, e.data.artikel, e.data.antworten ?? {}, e.data.auflagen);
      if (!r.ok) return fehler(r.status, r.meldung);
      await appendAudit({ action: "richtpreis_saved", actorType: "staff", actorId: user.id, requestId, ip: clientIp(req), detail: { artikel: e.data.artikel, auflagen: e.data.auflagen } });
      return kalkJson({ richtpreis: r.snapshot }, 201);
    }
    return fehler(405, "Methode nicht erlaubt");
  }

  if (teile[0] !== "v1") return fehler(404, "Unbekannter Pfad");

  // --- Dateien --------------------------------------------------------------------------------
  if (teile[1] === "werkbank" && teile[2] === "dateien") {
    if (methode === "POST" && teile.length === 3) {
      const url = new URL(req.url);
      const name = (url.searchParams.get("name") ?? "").trim().slice(0, 200);
      const typ = (url.searchParams.get("typ") ?? "").trim().slice(0, 120) || "application/octet-stream";
      if (name === "") return fehler(400, "Dateiname fehlt (?name=…)");
      const r = await leseRumpf(req, DATEI_MAX);
      if (!r.ok) return fehler(413, "Datei ist größer als 50 MB");
      const id = createHash("sha256").update(r.bytes).digest("hex");
      try {
        const s = await dateiSpeichern(id, r.bytes, name, typ, wer(user));
        if (!s.ok) return fehler(400, s.meldung);
        return kalkJson({ datei: s.datei, neu: s.neu }, s.neu ? 201 : 200);
      } catch (err) {
        console.error("[kalkulation] Datei speichern fehlgeschlagen:", err instanceof Error ? err.message : err);
        return fehler(503, "Dateispeicher nicht erreichbar");
      }
    }
    const m = /^[0-9a-f]{64}$/.exec(teile[3] ?? "");
    if (methode === "GET" && teile.length === 4 && m) {
      try {
        const d = await dateiLesen(m[0]);
        if (!d) return fehler(404, "Datei nicht gefunden");
        // immer als Download, nie als aktiver Inhalt (die Werkbank setzt den Typ für Vorschauen selbst)
        return new Response(Buffer.from(d.daten), {
          headers: {
            "content-type": "application/octet-stream",
            "content-length": String(d.daten.byteLength),
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.name)}`,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        });
      } catch {
        return fehler(503, "Dateispeicher nicht erreichbar");
      }
    }
    return fehler(404, "Unbekannter Pfad");
  }

  // --- Werkbank-Sync --------------------------------------------------------------------------
  if (teile[1] === "werkbank") {
    const j = methode === "GET" ? { ok: true as const, wert: undefined } : await leseJson(req, RUMPF_MAX_WERKBANK);
    if (!j.ok) return fehler(j.status, j.meldung);
    const a = { methode, pfad, rumpf: j.wert };
    const w = await werkbankAnfrage(a, heute, wer(user));
    if (w === null) return fehler(404, "Unbekannter Pfad");
    if (w.status === 200 && methode === "POST") {
      const art = teile[2] === "zurueck" ? "kalkulation_stammdaten_zurueck" : teile[2] === "import" || teile[2] === "ergaenzung" ? "kalkulation_stammdaten_import" : null;
      if (art) await appendAudit({ action: art, actorType: "staff", actorId: user.id, ip: clientIp(req), detail: { pfad: teile.slice(2).join("/"), quelle: "werkbank" } });
    }
    return antwort(w);
  }

  // --- Ad-hoc-Richtpreis ----------------------------------------------------------------------
  if (methode === "POST" && teile[1] === "artikel" && teile[3] === "richtpreis" && teile.length === 4) {
    const j = await leseJson(req);
    if (!j.ok) return fehler(j.status, j.meldung);
    const e = KalkulierenSchema.safeParse(j.wert);
    if (!e.success) return fehler(400, "Anfrage ungültig", e.error.issues.map((i) => ({ pfad: i.path.join("."), meldung: i.message })));
    if (e.data.auflagen.length > 6) return fehler(400, "Höchstens 6 Auflagen");
    const d = await ladeDaten();
    if (!d.ok) return fehler(d.leer ? 409 : 503, d.leer ? "Noch keine Stammdaten – bitte zuerst importieren" : "Stammdaten unvollständig", d.fehler);
    const art = d.daten.artikel.find((x) => x.id === teile[2]);
    if (!art) return fehler(404, `Artikel ${teile[2]} nicht gefunden`);
    const r = berechneIntern(d.daten, art, e.data.auflagen, e.data.antworten ?? {}, await ladePreisEinstellungen(), { heute });
    if (!r.ok) return fehler(r.status, r.meldung, r.details);
    return kalkJson({ ...r, hinweis: RICHTPREIS_HINWEIS, stichtag: heute });
  }

  // --- Lesen und Kalkulieren wie die kalpri-Schnittstelle -------------------------------------
  const rumpf = methode === "POST" ? await leseJson(req, RUMPF_MAX) : { ok: true as const, wert: undefined };
  if (!rumpf.ok) return fehler(rumpf.status, rumpf.meldung);
  return kalpriAnfrage({ methode, pfad, rumpf: rumpf.wert }, heute);
}

/** Gemeinsam mit der Schlüssel-Schnittstelle: Pfad /v1/… gegen die Stammdaten beantworten. */
export async function kalpriAnfrage(a: { methode: string; pfad: string; rumpf?: unknown }, heute: string): Promise<Response> {
  const d = await ladeDaten();
  if (!d.ok) {
    return a.pfad === "/v1/status"
      ? kalkJson({ version: API_VERSION, datenbank: d.leer ? "leer" : "unvollständig", details: d.fehler })
      : fehler(d.leer ? 409 : 503, d.leer ? "Noch keine Stammdaten vorhanden" : "Stammdaten unvollständig", d.fehler);
  }
  return antwort(anfrage(d.daten, a, heute));
}
