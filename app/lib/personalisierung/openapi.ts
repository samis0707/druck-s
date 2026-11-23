/**
 * OpenAPI-Beschreibung der öffentlichen Personalisierungs-Routen (/api/personalisierung/z/…): Vorlage per Link
 * ansehen, Eingaben prüfen und als PDF ansehen, Tabelle einlesen, Zwischenstand, Absenden mit E-Mail-Code.
 * Die Staff-Routen (/api/personalisierung/staff/…) sind nicht öffentlich und stehen hier bewusst nicht.
 */
const err = (description: string, code: string, message: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: message, code } } },
});
const notFound = err("Link ungültig, widerrufen oder abgelaufen, oder der Entwurf gibt es nicht mehr. Alles Ungültige antwortet gleich.", "nicht_gefunden", "Diese Vorlage gibt es nicht oder der Zugang ist nicht mehr gültig.");
const limit = err("Zu viele Anfragen von dieser Adresse in einer Stunde (PERS_*_PER_IP_PER_HOUR).", "rate_limited", "Zu viele Anfragen von dieser Adresse, bitte später erneut versuchen.");
const ref = { name: "ref", in: "path", required: true, description: "Zugriffs-Token aus dem öffentlichen Link (64 Hex-Zeichen) oder Vorlagen-ID (angemeldete Kunden, Mitarbeiter).", schema: { type: "string" } };
const entwurfId = { name: "id", in: "path", required: true, description: "Entwurfs-ID.", schema: { type: "string", format: "uuid" } };
const entwurfToken = { name: "x-entwurf-token", in: "header", required: true, description: "Entwurfs-Token aus der Antwort von „Entwurf anlegen“.", schema: { type: "string" } };
const json = (schema: unknown) => ({ required: true, content: { "application/json": { schema } } });
const ok = (description: string, schema?: unknown) => ({ description, ...(schema ? { content: { "application/json": { schema } } } : {}) });
const datensatz = { type: "object", required: ["werte"], properties: { werte: { type: "object", additionalProperties: { type: "string", maxLength: 2000 } }, auflage: { type: "integer", minimum: 1, maximum: 100000, default: 1 } } };

export const persTags = [
  {
    name: "Personalisierung",
    description:
      "Personalisierte Druckdaten (Visitenkarten, Namensschilder …) per Link, ohne Konto. Eingaben werden höchstens 24 Stunden zwischengespeichert; Schriftdateien werden nie ausgeliefert, Vorschauen entstehen serverseitig als PDF.",
  },
];

export const persPaths = {
  "/api/personalisierung/z/{ref}": {
    get: {
      tags: ["Personalisierung"],
      operationId: "getPersonalisierungVorlage",
      summary: "Vorlage ansehen",
      description: "Name, Format, Beschreibung und die Eingaben (Variablen) der Vorlage. Mit `?entwurf=<id>` und Entwurfs-Token die Version, an der der Entwurf hängt.",
      parameters: [ref],
      responses: { "200": ok("Kundenansicht der Vorlage."), "404": notFound },
    },
  },
  "/api/personalisierung/z/{ref}/vorschau": {
    post: {
      tags: ["Personalisierung"],
      operationId: "previewPersonalisierung",
      summary: "Vorschau als PDF",
      description: "Ein Datensatz als PDF (Vorder- und Rückseite). Ohne `datensatz` mit den Beispielwerten. Mit `?format=json` als Base64 plus Meldungen.",
      parameters: [ref],
      requestBody: json({ type: "object", properties: { datensatz } }),
      responses: { "200": { description: "PDF.", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } }, "404": notFound, "429": limit },
    },
  },
  "/api/personalisierung/z/{ref}/pruefen": {
    post: {
      tags: ["Personalisierung"],
      operationId: "checkPersonalisierung",
      summary: "Eingaben prüfen",
      description: "Pflichtfelder, Länge, Textpassung, Barcode-Inhalt. Meldungen auf Deutsch, je Datensatz (ab 1) und Variable.",
      parameters: [ref],
      requestBody: json({ type: "object", required: ["datensaetze"], properties: { datensaetze: { type: "array", maxItems: 2000, items: datensatz } } }),
      responses: { "200": ok("`{ ok, meldungen[] }`."), "404": notFound, "413": err("Mehr Datensätze oder Nutzen als erlaubt.", "zu_viele", "Es sind höchstens 2000 Datensätze erlaubt."), "429": limit },
    },
  },
  "/api/personalisierung/z/{ref}/tabelle": {
    post: {
      tags: ["Personalisierung"],
      operationId: "readPersonalisierungTable",
      summary: "Tabelle einlesen",
      description: "Excel (.xlsx) oder CSV als `multipart/form-data` (`datei`, optional `zuordnung` als JSON). Spalten werden automatisch zugeordnet; die Antwort enthält die Zuordnung zur Bestätigung. Es wird nichts gespeichert.",
      parameters: [ref],
      requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["datei"], properties: { datei: { type: "string", format: "binary" }, zuordnung: { type: "string" } } } } } },
      responses: { "200": ok("Kopfzeile, Zuordnung, Datensätze, Hinweise."), "400": err("Datei nicht lesbar.", "tabelle", "Die Tabelle konnte nicht gelesen werden."), "404": notFound, "413": err("Datei zu groß oder zu viele Zeilen.", "zu_gross", "Die Datei ist zu groß."), "429": limit },
    },
  },
  "/api/personalisierung/z/{ref}/beispiel": {
    get: {
      tags: ["Personalisierung"],
      operationId: "getPersonalisierungSampleTable",
      summary: "Beispieltabelle",
      description: "Beispieltabelle mit den richtigen Spaltenköpfen. `?format=csv` oder Excel (Standard).",
      parameters: [ref],
      responses: { "200": { description: "Datei.", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }, "404": notFound },
    },
  },
  "/api/personalisierung/z/{ref}/entwuerfe": {
    post: {
      tags: ["Personalisierung"],
      operationId: "createPersonalisierungDraft",
      summary: "Entwurf anlegen",
      description: "Zwischenstand der Eingaben. Die Antwort enthält das Entwurfs-Token genau einmal. Entwürfe werden nach `PERS_DRAFT_TTL_HOURS` (Standard 24) ohne Änderung gelöscht.",
      parameters: [ref],
      responses: { "201": ok("`{ id, token, version, expiresAt }`."), "404": notFound, "429": limit },
    },
  },
  "/api/personalisierung/z/{ref}/entwuerfe/{id}": {
    get: { tags: ["Personalisierung"], operationId: "getPersonalisierungDraft", summary: "Entwurf lesen", parameters: [ref, entwurfId, entwurfToken], responses: { "200": ok("Entwurf mit Datensätzen."), "404": notFound } },
    put: {
      tags: ["Personalisierung"],
      operationId: "savePersonalisierungDraft",
      summary: "Entwurf speichern",
      description: "Ersetzt die Datensätze und verlängert die Lebensdauer.",
      parameters: [ref, entwurfId, entwurfToken],
      requestBody: json({ type: "object", properties: { datensaetze: { type: "array", items: datensatz } } }),
      responses: { "200": ok("Gespeicherter Entwurf."), "404": notFound },
    },
    delete: { tags: ["Personalisierung"], operationId: "deletePersonalisierungDraft", summary: "Entwurf löschen", parameters: [ref, entwurfId, entwurfToken], responses: { "200": ok("`{ geloescht: true }`."), "404": notFound } },
  },
  "/api/personalisierung/z/{ref}/absenden": {
    post: {
      tags: ["Personalisierung"],
      operationId: "submitPersonalisierung",
      summary: "Absenden",
      description:
        "Header `x-entwurf-token`. Gast (Token-Link): mit `kontakt` wird ein Code an die E-Mail-Adresse gesendet (202, `modus: code`). Angemeldete Kunden und Mitarbeiter (mit `fuerKundeId`) gehen direkt ein (201). Die Druckdaten werden serverseitig aus dem gespeicherten Entwurf erzeugt.",
      parameters: [ref, entwurfToken],
      requestBody: json({
        type: "object",
        required: ["entwurfId"],
        properties: {
          entwurfId: { type: "string", format: "uuid" },
          kontakt: { type: "object", properties: { name: { type: "string" }, email: { type: "string", format: "email" }, organisation: { type: "string", nullable: true } } },
          anmerkung: { type: "string", maxLength: 2000 },
          fuerKundeId: { type: "string", description: "Nur Mitarbeiter." },
        },
      }),
      responses: {
        "201": ok("Direkt eingegangen: `{ modus: direkt, anfrageId, nummer }`."),
        "202": ok("Code gesendet: `{ modus: code, anfrageId, sentTo, expiresInMinutes }`."),
        "400": err("Fehler in den Eingaben (`pruefung`, mit `details`) oder ungültiger Kontakt.", "pruefung", "Es gibt noch 1 Fehler in den Einträgen. Bitte zuerst korrigieren."),
        "404": notFound,
        "429": limit,
      },
    },
  },
  "/api/personalisierung/z/{ref}/bestaetigen": {
    post: {
      tags: ["Personalisierung"],
      operationId: "confirmPersonalisierung",
      summary: "Mit Code bestätigen",
      description: "Erst jetzt geht die Anfrage ein (Auftragsnummer); danach entstehen Druck-PDF und Datentabelle. Bekannte, freigeschaltete E-Mail-Adressen werden an das Konto gebunden, sonst entsteht ein Interessent (wie bei der offenen Anfrage).",
      parameters: [ref, entwurfToken],
      requestBody: json({ type: "object", required: ["entwurfId", "anfrageId", "code"], properties: { entwurfId: { type: "string", format: "uuid" }, anfrageId: { type: "string", format: "uuid" }, code: { type: "string", pattern: "^\\d{6}$" } } }),
      responses: { "200": ok("`{ anfrageId, nummer, kunde }`."), "400": err("Code falsch.", "invalid_code", "Der Code stimmt nicht. Noch 4 Versuche."), "404": notFound },
    },
  },
};
