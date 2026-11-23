/**
 * Absenden einer Personalisierung als Anfrage in druck-s.
 *
 * Drei Wege, ein Ergebnis (eine Anfrage mit Druck-PDF und Datentabelle):
 *  - Gast (Token-Link): Kontakt angeben, Code per E-Mail, danach Bestätigung. Wie die offene Anfrage:
 *    bekannte, freigeschaltete Kundin → an das Konto gebunden, sonst Interessent. Die Druckdaten entstehen
 *    erst NACH der Bestätigung (kein Rechenaufwand für nie bestätigte Anfragen) und immer serverseitig neu
 *    aus den gespeicherten Datensätzen und der Version des Entwurfs; Eingaben des Browsers zählen nicht.
 *  - Angemeldeter Kunde: direkt, an sein Konto gebunden.
 *  - Mitarbeiter im Namen eines Kunden: direkt, an dessen Konto gebunden.
 * Datensatzwerte werden nie geloggt.
 */
import { appendAudit } from "../auditLog";
import { query } from "../db";
import { confirmInquiry, createInquiry, InquiryError, sendInquiryCode, type ConfirmResult } from "../inquiry/intake";
import { validateContact } from "../inquiry/validate";
import { requestRef } from "../requestNumber";
import { appendEventTx } from "../requests/events";
import { createDraft, getRequest, submitDraft } from "../requests/store";
import { requireOpenDraft } from "../inquiry/intake";
import { notifyDirekt } from "./benachrichtigung";
import { PersFehler } from "./dateien";
import { erzeugeDruckdatenFuerAnfrage, pruefe, zaehle } from "./dienst";
import { bindeEntwurfAnAnfrage, holeEntwurf, holeVorlage, loescheEntwurf, type Entwurf, type VorlageDetail } from "./repo";
import type { Zugang } from "./zugang";
import type { Datensatz } from "./schema";
import { withTx } from "../db";

export const PRODUKT = "personalisierung";
const MAX_ANMERKUNG = 2000;

function bereinige(text: unknown): string {
  if (typeof text !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, MAX_ANMERKUNG);
}

/** Beschreibung der Anfrage: nur Zähler und Namen der Vorlage, nie Datensatzwerte. */
export function beschreibung(vorlageName: string, version: number, datensaetze: Datensatz[], anmerkung: string): string {
  const auflage = datensaetze.reduce((s, d) => s + d.auflage, 0);
  return [
    `Personalisierung: Vorlage „${vorlageName}“ (Version ${version})`,
    `Datensätze: ${datensaetze.length}, Auflage gesamt: ${auflage}`,
    `Druck-PDF und Datentabelle werden automatisch aus den Eingaben erzeugt und hängen an dieser Anfrage.`,
    ...(anmerkung ? ["", "Anmerkung:", anmerkung] : []),
  ].join("\n");
}

/** Entwurf des Aufrufers lesen und prüfen: gehört zur Vorlage, hat Datensätze, keine Fehler. */
async function ladeBereiteDaten(z: Zugang, entwurfId: unknown, token: string): Promise<{ entwurf: Entwurf; detail: VorlageDetail }> {
  const entwurf = typeof entwurfId === "string" ? await holeEntwurf(entwurfId, token) : null;
  if (!entwurf || entwurf.templateId !== z.detail.id) throw new PersFehler("Dieser Entwurf existiert nicht mehr. Bitte die Eingaben erneut machen.", 404, "nicht_gefunden");
  if (entwurf.datensaetze.length === 0) throw new PersFehler("Es sind noch keine Einträge vorhanden.", 400, "leer");
  // Immer mit der Version, an der der Entwurf hängt (laufende Entwürfe bleiben gültig).
  const detail = await holeVorlage(entwurf.templateId, entwurf.templateVersion);
  if (!detail) throw new PersFehler("Diese Vorlage gibt es nicht mehr.", 404, "nicht_gefunden");
  const meldungen = await pruefe(detail, entwurf.datensaetze);
  const fehler = meldungen.filter((m) => m.schwere === "fehler");
  if (fehler.length > 0) {
    const err = new PersFehler(`Es gibt noch ${fehler.length} Fehler in den Einträgen. Bitte zuerst korrigieren.`, 400, "pruefung");
    (err as PersFehler & { details?: unknown }).details = meldungen;
    throw err;
  }
  return { entwurf, detail };
}

export interface CodeVersand {
  anfrageId: string;
  sentTo: string;
  expiresInMinutes: number;
}

/** Gast: Anfrage anlegen (oder wiederverwenden) und den Code senden. */
export async function startGastAbsenden(z: Zugang, eingabe: { entwurfId: unknown; token: string; kontakt: unknown; anmerkung: unknown }): Promise<CodeVersand> {
  if (z.akteur.type !== "system") throw new PersFehler("Bitte den Direktweg verwenden.", 400, "direkt");
  const kontakt = validateContact(eingabe.kontakt);
  if (!kontakt.ok) throw new PersFehler("Bitte Name und eine gültige E-Mail-Adresse angeben.", 400, "kontakt");
  const { entwurf, detail } = await ladeBereiteDaten(z, eingabe.entwurfId, eingabe.token);
  const text = beschreibung(detail.vorlage.name, detail.aktuelleVersion, entwurf.datensaetze, bereinige(eingabe.anmerkung));
  let anfrageId: string | null = null;
  if (entwurf.requestId) {
    try {
      anfrageId = (await requireOpenDraft(entwurf.requestId)).id;
      await query("UPDATE requests SET free_text = $2, updated_at = now() WHERE id = $1 AND status = 'DRAFT'", [anfrageId, text]);
    } catch {
      anfrageId = null; // abgelaufen oder schon bestätigt: neu anlegen
    }
  }
  try {
    if (!anfrageId) {
      const inq = await createInquiry({ product: PRODUKT, description: text, reference: null, contact: kontakt.value }, { ip: z.ip });
      anfrageId = inq.id;
      await bindeEntwurfAnAnfrage(entwurf.id, anfrageId);
    }
    const sent = await sendInquiryCode(anfrageId, kontakt.value, { ip: z.ip });
    return { anfrageId, ...sent };
  } catch (e) {
    if (e instanceof InquiryError) {
      throw new PersFehler(e.message, e.status === 429 ? 429 : e.status === 403 ? 403 : e.status === 502 ? 400 : 400, e.code);
    }
    throw e;
  }
}

/** Gast: mit dem Code bestätigen; danach Druckdaten erzeugen, Entwurf löschen. */
export async function bestaetigeGastAbsenden(z: Zugang, eingabe: { entwurfId: unknown; token: string; anfrageId: unknown; code: string }): Promise<ConfirmResult & { seiten: number | null }> {
  const entwurf = typeof eingabe.entwurfId === "string" ? await holeEntwurf(eingabe.entwurfId, eingabe.token) : null;
  if (!entwurf || entwurf.templateId !== z.detail.id || !entwurf.requestId || entwurf.requestId !== eingabe.anfrageId) {
    throw new PersFehler("Dieser Entwurf existiert nicht mehr. Bitte die Eingaben erneut machen.", 404, "nicht_gefunden");
  }
  const detail = await holeVorlage(entwurf.templateId, entwurf.templateVersion);
  if (!detail) throw new PersFehler("Diese Vorlage gibt es nicht mehr.", 404, "nicht_gefunden");
  let seiten: number | null = null;
  try {
    const r = await confirmInquiry(entwurf.requestId, eingabe.code, { ip: z.ip }, {
      hinweis: `Personalisierung (Vorlage „${detail.vorlage.name}“, ${entwurf.datensaetze.length} Datensätze)`,
      nachBestaetigung: async (request) => {
        try {
          const ergebnis = await erzeugeDruckdatenFuerAnfrage(request.id, { templateId: detail.id, version: detail.aktuelleVersion, datensaetze: entwurf.datensaetze, actor: { type: "customer", id: request.customerId } });
          seiten = ergebnis.seiten;
          await loescheEntwurf(entwurf.id, eingabe.token);
        } catch (err) {
          await query("UPDATE requests SET free_text = free_text || $2 WHERE id = $1", [request.id, "\n\nAchtung: Das Druck-PDF konnte nicht automatisch erzeugt werden. Bitte beim Kunden nachfragen oder die Daten erneut anfordern."]);
          await appendAudit({ action: "pers_generated", actorType: "system", requestId: request.id, detail: { fehler: err instanceof Error ? err.name : "Fehler", templateId: detail.id } });
          throw err;
        }
      },
    });
    return { ...r, seiten };
  } catch (e) {
    if (e instanceof InquiryError) throw new PersFehler(e.message, e.status === 429 ? 429 : e.status === 404 || e.status === 409 || e.status === 410 || e.status === 403 ? (e.status as 404 | 409 | 403) : 400, e.code);
    throw e;
  }
}

export interface DirektErgebnis {
  anfrageId: string;
  nummer: string | null;
  seiten: number;
}

/**
 * Angemeldeter Kunde oder Mitarbeiter im Namen eines Kunden: ohne Code, die Anfrage gehört dem Kunden.
 * `fuerKundeId` ist für Mitarbeiter Pflicht und für Kunden nicht erlaubt.
 */
export async function sendeDirekt(z: Zugang, eingabe: { entwurfId: unknown; token: string; anmerkung: unknown; fuerKundeId?: unknown }): Promise<DirektErgebnis> {
  let kundeId: string;
  if (z.akteur.type === "customer") {
    if (eingabe.fuerKundeId) throw new PersFehler("Nicht erlaubt.", 403, "verboten");
    kundeId = z.akteur.id!;
  } else if (z.akteur.type === "staff") {
    if (typeof eingabe.fuerKundeId !== "string") throw new PersFehler("Bitte zuerst einen Kunden auswählen.", 400, "kunde");
    const k = await query<{ id: string; status: string }>(`SELECT id, status FROM "user" WHERE id = $1 AND role = 'customer'`, [eingabe.fuerKundeId]);
    if (!k.rows[0] || k.rows[0].status !== "customer") throw new PersFehler("Dieser Kunde ist nicht freigeschaltet.", 400, "kunde");
    kundeId = k.rows[0].id;
  } else {
    throw new PersFehler("Bitte den Weg mit Bestätigungscode verwenden.", 400, "gast");
  }
  const { entwurf, detail } = await ladeBereiteDaten(z, eingabe.entwurfId, eingabe.token);
  const text = beschreibung(detail.vorlage.name, detail.aktuelleVersion, entwurf.datensaetze, bereinige(eingabe.anmerkung));
  const anfrage = await createDraft({ productHint: PRODUKT, freeText: text, origin: "door_a", trust: "VERIFIED", customerId: kundeId });
  try {
    const erg = await erzeugeDruckdatenFuerAnfrage(anfrage.id, { templateId: detail.id, version: detail.aktuelleVersion, datensaetze: entwurf.datensaetze, actor: { type: z.akteur.type, id: z.akteur.id } });
    // Eingang: DRAFT → RECEIVED (Nummer), im Namen des Kunden bzw. des Mitarbeiters.
    await withTx((c) => appendEventTx(c, { requestId: anfrage.id, event: "submitted", actorType: z.akteur.type === "staff" ? "staff" : "customer", actorId: z.akteur.id, detail: { personalisierung: true, imNamenDesKunden: z.akteur.type === "staff" } }));
    void submitDraft;
    await loescheEntwurf(entwurf.id, eingabe.token);
    const fertig = await getRequest(anfrage.id);
    await appendAudit({ action: "submitted", actorType: z.akteur.type === "staff" ? "staff" : "customer", actorId: z.akteur.id, requestId: anfrage.id, ip: z.ip, detail: { personalisierung: true, records: entwurf.datensaetze.length } });
    await zaehle("pers_generated", z.ip, z.akteur, { requestId: anfrage.id });
    await notifyDirekt(fertig!, detail, entwurf.datensaetze.length, z.akteur.type === "staff");
    return { anfrageId: anfrage.id, nummer: fertig?.number ?? null, seiten: erg.seiten };
  } catch (e) {
    // Nichts Halbfertiges stehen lassen: der Entwurf der Anfrage wird entfernt, die Eingaben bleiben im Entwurf.
    await query("DELETE FROM requests WHERE id = $1 AND status = 'DRAFT'", [anfrage.id]);
    throw e;
  }
}

export { requestRef };
