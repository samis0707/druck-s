/**
 * OpenAPI-Teile der Kalkulation (Richtpreis ohne Login und Maschinen-Schnittstelle mit
 * API-Schlüssel). lib/openapi.ts hängt sie an; tests/openapi.test.ts hält sie mit den Routen
 * unter app/api/v1 zusammen.
 */
import { MAX_AUFLAGEN } from "./richtpreis";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown, example?: unknown) => ({
  "application/json": { schema, ...(example === undefined ? {} : { example }) },
});
const richtpreisFehler = (description: string, code: string, message: string) => ({
  description,
  content: json(ref("Error"), { error: message, code }),
});
const kalkFehler = (description: string, message: string) => ({
  description,
  content: json(ref("KalkulationFehler"), { fehler: message }),
});
const keyAntworten = {
  "401": { description: "Schlüssel fehlt oder ist falsch.", content: json(ref("Error"), { error: "Gültiger API-Schlüssel erforderlich" }) },
  "403": { description: "Dem Schlüssel fehlt der Scope `kalkulation`.", content: json(ref("Error"), { error: "Scope „kalkulation“ fehlt" }) },
  "409": kalkFehler("Noch keine Stammdaten in der Datenbank.", "Noch keine Stammdaten vorhanden"),
};
const idParam = { name: "id", in: "path", required: true, description: "Kennung des Artikels bzw. der Kalkulation.", schema: { type: "string", maxLength: 80 } };
const key = [{ kalkulationKey: [] }];

export const kalkulationTags = [
  {
    name: "Richtpreis",
    description:
      "Unverbindlicher Richtpreis (Preis-Spanne) für freigegebene Artikel. Ohne Anmeldung, begrenzt je IP-Adresse. Bei unvollständigen Angaben gibt es keinen Preis, sondern „Preis auf Anfrage“.",
  },
  {
    name: "Kalkulation",
    description:
      "Kosten-Kalkulation (Zehntelcent, ohne Gewinn) für Maschinen-Zugriffe mit API-Schlüssel `kal_<64 hex>` und Scope `kalkulation`. Den Schlüssel legt die Druckerei an: `node scripts/kalkulation-key.mjs create \"<Name>\"`.",
  },
];

export const kalkulationSecuritySchemes = {
  kalkulationKey: { type: "http", scheme: "bearer", bearerFormat: "kal_<64 hex>", description: "API-Schlüssel der Kalkulation (Scope `kalkulation`)." },
};

export const kalkulationPaths = {
  "/api/v1/richtpreis/artikel": {
    get: {
      tags: ["Richtpreis"],
      operationId: "listRichtpreisArtikel",
      summary: "Artikel und Fragen für den Richtpreis",
      description: "Nur für den Shop freigegebene Artikel, jeweils mit den Fragen in kundenverständlicher Form und den Produkten der Anfrage (`produkte`), denen die Druckerei sie zugeordnet hat. Solange die Druckerei „Richtpreis für Kunden anzeigen“ nicht eingeschaltet hat, antwortet die Schnittstelle mit `{ aktiv: false, artikel: [] }` (Status 200). Die `wert`-Angaben der Auswahl gehören in `antworten` von `POST /api/v1/richtpreis`; ein Format wird in Millimetern angegeben.",
      responses: {
        "200": { description: "Freigegebene Artikel.", content: json(ref("RichtpreisArtikelListe")) },
        "429": richtpreisFehler("Zu viele Abrufe von dieser Adresse.", "zu_viele_anfragen", "Zu viele Abrufe von dieser Adresse, bitte später erneut versuchen."),
        "503": richtpreisFehler("Noch keine Stammdaten.", "nicht_verfuegbar", "Der Richtpreis-Rechner ist gerade nicht verfügbar."),
      },
    },
  },
  "/api/v1/richtpreis": {
    post: {
      tags: ["Richtpreis"],
      operationId: "createRichtpreis",
      summary: "Richtpreis berechnen",
      description: `Rechnet für 1–${MAX_AUFLAGEN} Auflagen eine Preis-Spanne (netto und brutto, in Cent). Ist eine Frage unbeantwortet oder lässt sich der Preis nicht sicher bestimmen, lautet das Ergebnis der Auflage \`auf_anfrage\` mit Gründen. Die Antwort enthält keine Kosten. Das Ergebnis ist ein **unverbindlicher Richtpreis**.`,
      requestBody: { required: true, content: json(ref("RichtpreisAnfrage"), { artikel: "A-0001", auflagen: [100, 500], antworten: { endformat: "0", "teil:t1:druck": "druck:2" } }) },
      responses: {
        "200": { description: "Ergebnis je Auflage.", content: json(ref("RichtpreisAntwort")) },
        "400": richtpreisFehler("Anfrage oder Antworten ungültig (`ungueltig`, `ungueltiges_json`).", "ungueltig", "Die Anfrage ist ungültig."),
        "403": richtpreisFehler("Der Richtpreis für Kunden ist (noch) nicht eingeschaltet.", "nicht_aktiv", "Der Richtpreis ist derzeit nicht aktiv."),
        "404": richtpreisFehler("Artikel unbekannt oder nicht freigegeben.", "nicht_gefunden", "Diesen Artikel gibt es nicht."),
        "413": richtpreisFehler("Anfrage zu groß (höchstens 64 KB).", "zu_gross", "Die Anfrage ist zu groß."),
        "422": richtpreisFehler("Der Artikel lässt sich so nicht berechnen.", "nicht_berechenbar", "Dieser Artikel lässt sich so nicht berechnen."),
        "429": richtpreisFehler("Zu viele Berechnungen je IP-Adresse und Stunde. `Retry-After` nennt die Wartezeit.", "zu_viele_anfragen", "Zu viele Berechnungen von dieser Adresse, bitte später erneut versuchen."),
        "503": richtpreisFehler("Noch keine Stammdaten.", "nicht_verfuegbar", "Der Richtpreis-Rechner ist gerade nicht verfügbar."),
      },
    },
  },
  "/api/v1/kalkulation/status": {
    get: {
      tags: ["Kalkulation"],
      operationId: "getKalkulationStatus",
      summary: "Stand der Stammdaten",
      security: key,
      responses: { "200": { description: "Version und Anzahl der Einträge.", content: json({ type: "object" }) }, "401": keyAntworten["401"], "403": keyAntworten["403"] },
    },
  },
  "/api/v1/kalkulation/artikel": {
    get: {
      tags: ["Kalkulation"],
      operationId: "listKalkulationArtikel",
      summary: "Artikel",
      security: key,
      responses: { "200": { description: "Alle Artikel (id, titel, einheit).", content: json({ type: "object" }) }, ...keyAntworten },
    },
  },
  "/api/v1/kalkulation/artikel/{id}": {
    get: {
      tags: ["Kalkulation"],
      operationId: "getKalkulationArtikel",
      summary: "Artikel mit Fragen",
      description: "Mit den noch zu beantwortenden `fragen` (Schlüssel, Titel, Art, Optionen).",
      security: key,
      parameters: [idParam],
      responses: { "200": { description: "Artikel.", content: json({ type: "object" }) }, "404": kalkFehler("Artikel unbekannt.", "Artikel A-0001 nicht gefunden"), ...keyAntworten },
    },
  },
  "/api/v1/kalkulation/artikel/{id}/kalkulieren": {
    post: {
      tags: ["Kalkulation"],
      operationId: "kalkuliereKalkulationArtikel",
      summary: "Artikel kalkulieren (Kosten)",
      description: "Kosten je Auflage in Zehntelcent, ohne Gewinn. `offen` nennt unbeantwortete Fragen, `vollstaendig=false` fehlende Preise: dann sind die Kosten nur vorläufig.",
      security: key,
      parameters: [idParam],
      requestBody: { required: true, content: json(ref("KalkulationKalkulieren"), { auflagen: [250, 1000], antworten: { endformat: "0" } }) },
      responses: {
        "200": { description: "Kosten je Auflage.", content: json({ type: "object" }) },
        "400": kalkFehler("Anfrage ungültig.", "Anfrage ungültig"),
        "404": kalkFehler("Artikel unbekannt.", "Artikel A-0001 nicht gefunden"),
        "413": kalkFehler("Anfrage zu groß (höchstens 64 KB).", "Anfrage zu groß"),
        "422": kalkFehler("Artikel lässt sich so nicht kalkulieren.", "Artikel lässt sich so nicht kalkulieren"),
        ...keyAntworten,
      },
    },
  },
  "/api/v1/kalkulation/kalkulationen": {
    get: {
      tags: ["Kalkulation"],
      operationId: "listKalkulationen",
      summary: "Kalkulationen",
      security: key,
      responses: { "200": { description: "Gespeicherte Kalkulationen mit Kosten je Auflage.", content: json({ type: "object" }) }, ...keyAntworten },
    },
  },
  "/api/v1/kalkulation/kalkulationen/{id}": {
    get: {
      tags: ["Kalkulation"],
      operationId: "getKalkulation",
      summary: "Kalkulation mit Schritten",
      description: "Schritte mit Name, Menge und Kosten; keine Stundensätze.",
      security: key,
      parameters: [idParam],
      responses: { "200": { description: "Kalkulation.", content: json({ type: "object" }) }, "404": kalkFehler("Kalkulation unbekannt.", "Kalkulation K-0001 nicht gefunden"), ...keyAntworten },
    },
  },
  "/api/v1/kalkulation/taetigkeiten": {
    get: {
      tags: ["Kalkulation"],
      operationId: "listKalkulationTaetigkeiten",
      summary: "Tätigkeiten (Arbeitsschritte)",
      security: key,
      responses: { "200": { description: "Arbeitsschritte mit Einheit und Maschinen.", content: json({ type: "object" }) }, ...keyAntworten },
    },
  },
};

const betrag = (beschr: string) => ({ type: "integer", description: beschr });
const spanne = (einheit: string) => ({
  type: "object",
  required: ["vonCent", "richtpreisCent", "bisCent"],
  description: `Spanne in Cent (${einheit}).`,
  properties: { vonCent: betrag("Untere Grenze"), richtpreisCent: betrag("Richtpreis (Mitte)"), bisCent: betrag("Obere Grenze") },
});

export const kalkulationSchemas = {
  KalkulationFehler: {
    type: "object",
    required: ["fehler"],
    properties: { fehler: { type: "string" }, details: {} },
  },
  KalkulationKalkulieren: {
    type: "object",
    required: ["auflagen"],
    additionalProperties: false,
    properties: {
      auflagen: { type: "array", minItems: 1, maxItems: 10, items: { type: "integer", minimum: 1, maximum: 10000000 } },
      antworten: {
        type: "object",
        description: "Antworten auf die Fragen des Artikels. Auswahl: Wert der Option; Format: `{breiteUm, hoeheUm}` in Mikrometern.",
        additionalProperties: { oneOf: [{ type: "string", maxLength: 200 }, { type: "object", required: ["breiteUm", "hoeheUm"], properties: { breiteUm: { type: "integer" }, hoeheUm: { type: "integer" } } }] },
      },
    },
  },
  RichtpreisFrage: {
    type: "object",
    required: ["schluessel", "titel", "art", "optionen"],
    properties: {
      schluessel: { type: "string" },
      titel: { type: "string", example: "Endformat" },
      art: { type: "string", enum: ["auswahl", "zahl", "text", "format"] },
      einheit: { type: "string", enum: ["mm"], description: "Bei `format`: Eingabe in Millimetern." },
      optionen: { type: "array", items: { type: "object", required: ["wert", "text"], properties: { wert: { type: "string" }, text: { type: "string" } } } },
    },
  },
  RichtpreisArtikelListe: {
    type: "object",
    required: ["aktiv", "artikel"],
    properties: {
      aktiv: { type: "boolean", description: "false: der Richtpreis ist ausgeschaltet; `artikel` ist dann leer." },
      maxAuflagen: { type: "integer", example: MAX_AUFLAGEN },
      artikel: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "titel", "einheit", "fragen"],
          properties: { id: { type: "string" }, titel: { type: "string" }, einheit: { type: "string" }, text: { type: ["string", "null"] }, produkte: { type: "array", items: { type: "string" }, description: "Produkte der Anfrage (`GET /api/v1/products`), zu denen der Artikel gehört." }, fragen: { type: "array", items: ref("RichtpreisFrage") } },
        },
      },
    },
  },
  RichtpreisAnfrage: {
    type: "object",
    required: ["artikel", "auflagen"],
    additionalProperties: false,
    properties: {
      artikel: { type: "string", maxLength: 80 },
      auflagen: { type: "array", minItems: 1, maxItems: MAX_AUFLAGEN, items: { type: "integer", minimum: 1, maximum: 1000000 } },
      antworten: {
        type: "object",
        description: "Schlüssel der Frage → Antwort. Alle Fragen des Artikels beantworten, sonst „Preis auf Anfrage“.",
        additionalProperties: { oneOf: [{ type: "string", maxLength: 200 }, { type: "object", required: ["breiteMm", "hoeheMm"], additionalProperties: false, properties: { breiteMm: { type: "integer", minimum: 10, maximum: 3000 }, hoeheMm: { type: "integer", minimum: 10, maximum: 3000 } } }] },
      },
    },
  },
  RichtpreisAuflage: {
    oneOf: [
      {
        type: "object",
        required: ["auflage", "status", "netto", "brutto", "mwstProzent"],
        properties: {
          auflage: { type: "integer" },
          status: { type: "string", enum: ["preis"] },
          netto: spanne("netto"),
          brutto: spanne("brutto"),
          mwstProzent: { type: "number", example: 19 },
          jeStueckNettoZehntelcent: betrag("Netto-Richtpreis je Stück in Zehntelcent"),
          je1000NettoCent: betrag("Netto-Richtpreis je 1.000 Stück in Cent"),
        },
      },
      {
        type: "object",
        required: ["auflage", "status", "kennzeichnung", "gruende"],
        properties: {
          auflage: { type: "integer" },
          status: { type: "string", enum: ["auf_anfrage"] },
          kennzeichnung: { type: "string", enum: ["Preis auf Anfrage"] },
          gruende: { type: "array", items: { type: "string" } },
        },
      },
    ],
  },
  RichtpreisAntwort: {
    type: "object",
    required: ["artikel", "kennzeichnung", "hinweis", "waehrung", "auflagen"],
    properties: {
      artikel: { type: "object", properties: { id: { type: "string" }, titel: { type: "string" } } },
      kennzeichnung: { type: "string", enum: ["unverbindlicher Richtpreis"] },
      hinweis: { type: "string" },
      waehrung: { type: "string", enum: ["EUR"] },
      auflagen: { type: "array", items: ref("RichtpreisAuflage") },
    },
  },
};
