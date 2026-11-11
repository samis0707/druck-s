/**
 * OpenAPI-Beschreibung der öffentlichen Schnittstellen (Swagger-Oberfläche unter /api/docs,
 * Rohfassung unter /api/v1/openapi.json). Von Hand gepflegt: bei Änderungen an lib/inquiry
 * oder an der Partner-Schnittstelle hier nachziehen. tests/openapi.test.ts hält Produktliste,
 * Grenzen und Fehlercodes mit dem Code zusammen.
 */
import { company } from "./company";
import { config } from "./config";
import { INQUIRY_LIMITS, PRODUCT_VALUES } from "./inquiry/validate";

/** Fehlercodes der Anfrage-Schnittstelle (lib/inquiry). */
export const INQUIRY_ERROR_CODES = [
  "invalid_json",
  "invalid_body",
  "body_too_large",
  "contact_required",
  "code_required",
  "invalid_code",
  "code_expired",
  "already_confirmed",
  "account_disabled",
  "staff_account",
  "not_found",
  "too_many_files",
  "empty_file",
  "file_too_large",
  "rate_limited",
  "mail_failed",
  "internal_error",
] as const;

const UUID_EXAMPLE = "3f2a9c1e-7b4d-4e8a-9c21-5d6f7a8b9c0d";

function errorResponse(description: string, code: string, message: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
        example: { error: message, code },
      },
    },
  };
}

export function openApiDocument() {
  const base = config.appBaseUrl.replace(/\/+$/, "");
  const idParam = {
    name: "id",
    in: "path",
    required: true,
    description: "Kennung der Anfrage aus Schritt 1. Wer sie kennt, kann den Entwurf ergänzen; geben Sie sie nicht weiter.",
    schema: { type: "string", format: "uuid" },
    example: UUID_EXAMPLE,
  };
  const notFound = errorResponse("Unbekannte Kennung (oder Entwurf nach 45 Minuten verfallen).", "not_found", "Inquiry not found");
  const alreadyConfirmed = errorResponse("Die Anfrage ist schon bestätigt und lässt sich nicht mehr ändern.", "already_confirmed", "This inquiry was already confirmed");
  const rateLimited = errorResponse("Zu viele Aufrufe. `Retry-After` nennt die Wartezeit in Sekunden.", "rate_limited", "Too many codes for this email address, try again later");

  return {
    openapi: "3.1.0",
    info: {
      title: "dmp druckraum – Schnittstellen",
      version: "1.0.0",
      description: [
        `Schnittstellen des Druckportals der ${company.name}.`,
        "",
        "## Offene Anfrage (ohne Kundenkonto)",
        "",
        "Für alle, die noch keinen Zugang haben, und für Assistenten, die eine Anfrage vorbereiten. Vier Schritte:",
        "",
        "1. **Entwurf anlegen** – `POST /api/v1/inquiries`",
        "2. **Dateien anhängen** (optional) – `POST /api/v1/inquiries/{id}/files`",
        "3. **Code senden** – `POST /api/v1/inquiries/{id}/code`",
        "4. **Bestätigen** – `POST /api/v1/inquiries/{id}/confirm` mit dem Code aus der E-Mail",
        "",
        "Erst Schritt 4 macht aus dem Entwurf eine Anfrage bei der Druckerei. Der Code geht an das Postfach der anfragenden Person: Ein Assistent kann alles vorbereiten, bestätigen muss der Mensch. Am einfachsten öffnet er dazu `confirmUrl` aus der Antwort.",
        "",
        `Ein Entwurf verfällt nach ${config.ttl.draftMinutes} Minuten, ein Code nach ${config.ttl.otpMinutes} Minuten. Preise nennt die Schnittstelle nicht; die Druckerei meldet sich persönlich.`,
        "",
        "## Zum Ausprobieren",
        "",
        "Bei jedem Endpunkt „Try it out“ wählen. Die Aufrufe gehen an dieses System und legen echte Entwürfe an; unbestätigte Entwürfe werden automatisch gelöscht.",
      ].join("\n"),
      contact: { name: company.name, email: company.email, url: company.website },
    },
    servers: [{ url: base, description: "Dieses System" }],
    tags: [
      { name: "Anfrage", description: "Offene Anfrage in vier Schritten. Ohne Anmeldung." },
      { name: "Stammdaten", description: "Werte, die die Anfrage erwartet." },
      {
        name: "Partner",
        description:
          "Server-zu-Server-Schnittstelle für Partnersysteme, nur mit API-Schlüssel nach Vereinbarung. Webhooks, Signatur und alle Fehlercodes stehen in docs/partner-api.md.",
      },
    ],
    paths: {
      "/api/v1/products": {
        get: {
          tags: ["Stammdaten"],
          operationId: "listProducts",
          summary: "Produktarten",
          description: "Die Werte, die `product` in einer Anfrage annehmen kann.",
          responses: {
            "200": {
              description: "Liste der Produktarten.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["products"],
                    properties: { products: { type: "array", items: { $ref: "#/components/schemas/Product" } } },
                  },
                  example: { products: [{ value: "flyer", label: "Flyer" }, { value: "brochure", label: "Broschüre" }] },
                },
              },
            },
          },
        },
      },
      "/api/v1/inquiries": {
        post: {
          tags: ["Anfrage"],
          operationId: "createInquiry",
          summary: "1 · Entwurf anlegen",
          description:
            "Legt einen Entwurf an. Noch ist nichts bei der Druckerei eingegangen. `contact` kann hier oder in Schritt 3 mitgegeben werden.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InquiryCreate" },
                example: {
                  product: "flyer",
                  description: "500 Flyer DIN A5, beidseitig 4/4-farbig, 135 g Bilderdruck matt. Abholung bis 20.11.",
                  reference: "Sommerfest 2026",
                  contact: { name: "Anna Beispiel", email: "anna@example.org", organisation: "Quartierszentrum Böckingen", phone: "07131 1234" },
                },
              },
            },
          },
          responses: {
            "201": { description: "Entwurf angelegt.", content: { "application/json": { schema: { $ref: "#/components/schemas/InquiryEnvelope" } } } },
            "400": errorResponse("Eingaben unvollständig oder ungültig. `details` nennt jedes Feld.", "invalid_body", "description is required"),
            "413": errorResponse("Körper größer als 64 KB.", "body_too_large", "Request body exceeds 64 KB"),
            "429": rateLimited,
          },
        },
      },
      "/api/v1/inquiries/{id}": {
        get: {
          tags: ["Anfrage"],
          operationId: "getInquiry",
          summary: "Stand abrufen",
          description:
            "Im Entwurf: Inhalte, Dateien und Ablaufzeit (zur Kontrolle vor der Bestätigung). Danach nur noch Nummer und Status.",
          parameters: [idParam],
          responses: {
            "200": { description: "Stand der Anfrage.", content: { "application/json": { schema: { $ref: "#/components/schemas/InquiryEnvelope" } } } },
            "404": notFound,
          },
        },
      },
      "/api/v1/inquiries/{id}/files": {
        post: {
          tags: ["Anfrage"],
          operationId: "addInquiryFiles",
          summary: "2 · Dateien anhängen (optional)",
          description:
            "Druckdaten als `multipart/form-data`, Feldname `file`, mehrfach möglich. Je Datei höchstens 100 MB, je Anfrage höchstens 20 Dateien. Die Druckdaten-Prüfung läuft nach der Bestätigung.",
          parameters: [idParam],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: { file: { type: "array", items: { type: "string", format: "binary" }, description: "Eine oder mehrere Dateien." } },
                },
              },
            },
          },
          responses: {
            "201": { description: "Dateien gespeichert.", content: { "application/json": { schema: { $ref: "#/components/schemas/InquiryEnvelope" } } } },
            "400": errorResponse("Kein `file`-Feld, leere Datei oder zu viele Dateien.", "too_many_files", "An inquiry can hold at most 20 files"),
            "404": notFound,
            "409": alreadyConfirmed,
            "413": errorResponse("Datei größer als 100 MB.", "file_too_large", "flyer.pdf exceeds 100 MB"),
          },
        },
      },
      "/api/v1/inquiries/{id}/code": {
        post: {
          tags: ["Anfrage"],
          operationId: "sendInquiryCode",
          summary: "3 · Code senden",
          description: [
            "Schickt einen sechsstelligen Code an die Kontakt-Adresse. Ein neuer Code macht den vorigen ungültig.",
            "",
            "Der Körper ist optional: `contact` setzt oder ersetzt den Kontakt des Entwurfs. Fehlt er hier und in Schritt 1, antwortet der Endpunkt mit `contact_required`.",
            "",
            `Grenzen: ${config.inquiry.codesPerDraft} Codes je Anfrage, ${config.inquiry.codesPerEmailPerHour} je E-Mail-Adresse und Stunde.`,
          ].join("\n"),
          parameters: [idParam],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { type: "object", properties: { contact: { $ref: "#/components/schemas/Contact" } } },
                example: { contact: { name: "Anna Beispiel", email: "anna@example.org" } },
              },
            },
          },
          responses: {
            "202": {
              description: "Code ist unterwegs.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CodeSent" },
                  example: { sent: true, expiresInMinutes: config.ttl.otpMinutes, sentTo: "a•••@example.org" },
                },
              },
            },
            "400": errorResponse("Kontakt fehlt oder ist ungültig.", "contact_required", "Contact with name and email is required before a code can be sent"),
            "403": errorResponse("Die Adresse ist bei der Druckerei gesperrt.", "account_disabled", "This account is disabled. Please contact the print firm."),
            "404": notFound,
            "409": alreadyConfirmed,
            "429": rateLimited,
            "502": errorResponse("Die E-Mail konnte nicht verschickt werden.", "mail_failed", "The code email could not be sent. Please try again later."),
          },
        },
      },
      "/api/v1/inquiries/{id}/confirm": {
        post: {
          tags: ["Anfrage"],
          operationId: "confirmInquiry",
          summary: "4 · Bestätigen",
          description: [
            "Bestätigt die Anfrage mit dem Code aus der E-Mail. Jetzt ist sie eingegangen: Sie bekommt eine Nummer, die Dateien werden geprüft, die Druckerei wird benachrichtigt.",
            "",
            "Gehört die Adresse zu einem Kundenkonto, wird der Auftrag diesem Konto zugeordnet. Sonst meldet sich die Druckerei persönlich; ein Zugang zum Portal entsteht dadurch nicht.",
            "",
            `Nach ${config.inquiry.codeAttempts} falschen Versuchen ist ein neuer Code nötig.`,
          ].join("\n"),
          parameters: [idParam],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code"],
                  properties: { code: { type: "string", pattern: "^[0-9]{6}$", description: "Die sechs Ziffern aus der E-Mail." } },
                },
                example: { code: "482913" },
              },
            },
          },
          responses: {
            "200": {
              description: "Anfrage eingegangen.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["inquiry", "message"],
                    properties: { inquiry: { $ref: "#/components/schemas/Inquiry" }, message: { type: "string" } },
                  },
                  example: {
                    inquiry: {
                      id: UUID_EXAMPLE,
                      status: "received",
                      number: "111126-004",
                      product: "flyer",
                      productLabel: "Flyer",
                      createdAt: "2026-11-11T14:02:11.000Z",
                      confirmUrl: `${base}/anfrage/${UUID_EXAMPLE}`,
                      draft: null,
                    },
                    message: "Eingegangen. Die Druckerei meldet sich persönlich bei Ihnen.",
                  },
                },
              },
            },
            "400": errorResponse("Code falsch (`invalid_code`) oder noch keiner angefordert (`code_required`).", "invalid_code", "The code is not correct (4 attempts left)"),
            "403": errorResponse("Die Adresse ist bei der Druckerei gesperrt.", "account_disabled", "This account is disabled. Please contact the print firm."),
            "404": notFound,
            "409": alreadyConfirmed,
            "410": errorResponse("Code abgelaufen oder nach zu vielen Fehlversuchen gesperrt. Neuen Code mit Schritt 3 anfordern.", "code_expired", "The code is no longer valid. Please request a new one."),
          },
        },
      },
      "/api/partner/requests": {
        post: {
          tags: ["Partner"],
          operationId: "createPartnerRequest",
          summary: "Auftrag einliefern",
          description:
            "Legt einen Druckauftrag an und nimmt ihn sofort an (Status `RECEIVED`). Idempotent über `partnerRef`: 201 = neu, 200 = gab es schon.",
          security: [{ partnerKey: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PartnerRequestCreate" } } } },
          responses: {
            "200": { description: "Auftrag mit diesem `partnerRef` gab es schon; unverändert zurückgegeben.", content: { "application/json": { schema: { $ref: "#/components/schemas/PartnerRequestEnvelope" } } } },
            "201": { description: "Auftrag angelegt.", content: { "application/json": { schema: { $ref: "#/components/schemas/PartnerRequestEnvelope" } } } },
            "400": errorResponse("Ungültiger Körper oder Datei-Host nicht freigegeben.", "invalid_body", "quantity must be an integer between 1 and 1000000"),
            "401": errorResponse("Schlüssel fehlt oder ist falsch.", "unauthorized", "Authentication required"),
            "422": errorResponse("Datei nicht ladbar oder passt nicht zu Größe/Prüfsumme.", "file_unavailable", "File could not be fetched"),
            "429": errorResponse("Zu viele neue Aufträge in einer Stunde.", "rate_limited", "Too many new requests, try again later"),
          },
        },
      },
      "/api/partner/requests/{partnerRef}": {
        get: {
          tags: ["Partner"],
          operationId: "getPartnerRequest",
          summary: "Status abrufen",
          security: [{ partnerKey: [] }],
          parameters: [{ $ref: "#/components/parameters/partnerRef" }],
          responses: {
            "200": { description: "Auftrag des Partners.", content: { "application/json": { schema: { $ref: "#/components/schemas/PartnerRequestEnvelope" } } } },
            "401": errorResponse("Schlüssel fehlt oder ist falsch.", "unauthorized", "Authentication required"),
            "404": errorResponse("Unbekannte Referenz.", "not_found", "Request not found"),
          },
        },
      },
      "/api/partner/requests/{partnerRef}/cancel": {
        post: {
          tags: ["Partner"],
          operationId: "cancelPartnerRequest",
          summary: "Auftrag zurückziehen",
          description: "Nur aus `RECEIVED` oder `IN_REVIEW`. Wiederholter Aufruf ist unschädlich.",
          security: [{ partnerKey: [] }],
          parameters: [{ $ref: "#/components/parameters/partnerRef" }],
          responses: {
            "200": { description: "Zurückgezogen.", content: { "application/json": { schema: { $ref: "#/components/schemas/PartnerRequestEnvelope" } } } },
            "401": errorResponse("Schlüssel fehlt oder ist falsch.", "unauthorized", "Authentication required"),
            "404": errorResponse("Unbekannte Referenz.", "not_found", "Request not found"),
            "409": errorResponse("Zu spät: der Auftrag ist schon weiter.", "not_withdrawable", "Request can no longer be withdrawn (status IN_PROGRESS)"),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        partnerKey: { type: "http", scheme: "bearer", bearerFormat: "dmp_<64 hex>", description: "API-Schlüssel eines Partners." },
      },
      parameters: {
        partnerRef: {
          name: "partnerRef",
          in: "path",
          required: true,
          description: "Referenz des Partners für diesen Auftrag.",
          schema: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$" },
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error", "code"],
          properties: {
            error: { type: "string", description: "Fehlertext für Menschen (englisch)." },
            code: { type: "string", description: "Stabiler Code zum Auswerten.", examples: [...INQUIRY_ERROR_CODES] },
            details: { type: "array", items: { type: "string" }, description: "Bei `invalid_body`: ein Eintrag je Feld." },
          },
        },
        Product: {
          type: "object",
          required: ["value", "label"],
          properties: { value: { type: "string", enum: PRODUCT_VALUES }, label: { type: "string" } },
        },
        Contact: {
          type: "object",
          required: ["name", "email"],
          properties: {
            name: { type: "string", maxLength: INQUIRY_LIMITS.name, description: "Ansprechperson." },
            email: { type: "string", format: "email", maxLength: INQUIRY_LIMITS.email, description: "An diese Adresse geht der Code." },
            organisation: { type: ["string", "null"], maxLength: INQUIRY_LIMITS.organisation, description: "Firma, Verein oder Einrichtung." },
            phone: { type: ["string", "null"], maxLength: INQUIRY_LIMITS.phone, description: "Für Rückfragen." },
          },
        },
        InquiryCreate: {
          type: "object",
          required: ["product", "description"],
          properties: {
            product: { type: "string", enum: PRODUCT_VALUES, description: "Produktart, siehe `GET /api/v1/products`. Passt nichts: `other`." },
            description: {
              type: "string",
              maxLength: INQUIRY_LIMITS.description,
              description: "Was gedruckt werden soll: Format, Auflage, Papier, Farbigkeit, Veredelung, Termin, Lieferung oder Abholung.",
            },
            reference: { type: ["string", "null"], maxLength: INQUIRY_LIMITS.reference, description: "Eigene Bezeichnung oder Bezug, z. B. „wie letztes Mal“." },
            contact: { $ref: "#/components/schemas/Contact" },
          },
        },
        Inquiry: {
          type: "object",
          required: ["id", "status", "number", "product", "productLabel", "createdAt", "confirmUrl", "draft"],
          properties: {
            id: { type: "string", format: "uuid" },
            status: {
              type: "string",
              enum: ["draft", "received", "in_review", "waiting_approval", "in_progress", "shipped", "withdrawn"],
              description: "`draft` = noch nicht bestätigt. Ab `received` liegt die Anfrage bei der Druckerei.",
            },
            number: { type: ["string", "null"], description: "Auftragsnummer TTMMJJ-NNN, erst nach der Bestätigung.", examples: ["111126-004"] },
            product: { type: "string", enum: PRODUCT_VALUES },
            productLabel: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            confirmUrl: { type: "string", format: "uri", description: "Seite für den Menschen: Anfrage ansehen und Code eingeben." },
            draft: {
              type: ["object", "null"],
              description: "Nur solange `status` = `draft`.",
              required: ["expiresAt", "description", "reference", "files", "contact", "codeSent"],
              properties: {
                expiresAt: { type: "string", format: "date-time", description: "Danach wird der Entwurf gelöscht." },
                description: { type: "string" },
                reference: { type: ["string", "null"] },
                files: {
                  type: "array",
                  items: { type: "object", required: ["name", "sizeBytes"], properties: { name: { type: "string" }, sizeBytes: { type: "integer" } } },
                },
                contact: {
                  type: ["object", "null"],
                  required: ["name", "email", "organisation"],
                  properties: {
                    name: { type: "string" },
                    email: { type: "string", description: "Verkürzt, z. B. `a•••@example.org`." },
                    organisation: { type: ["string", "null"] },
                  },
                },
                codeSent: { type: "boolean", description: "Ob schon ein Code verschickt wurde." },
              },
            },
          },
        },
        InquiryEnvelope: { type: "object", required: ["inquiry"], properties: { inquiry: { $ref: "#/components/schemas/Inquiry" } } },
        CodeSent: {
          type: "object",
          required: ["sent", "expiresInMinutes", "sentTo"],
          properties: {
            sent: { type: "boolean", const: true },
            expiresInMinutes: { type: "integer" },
            sentTo: { type: "string", description: "Verkürzte Adresse." },
          },
        },
        PartnerRequestCreate: {
          type: "object",
          required: ["partnerRef", "customer", "product", "quantity", "delivery", "file", "source"],
          properties: {
            partnerRef: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$" },
            customer: {
              type: "object",
              required: ["email", "name", "organisation"],
              properties: { email: { type: "string", format: "email" }, name: { type: "string" }, organisation: { type: "string" }, phone: { type: "string" } },
            },
            product: {
              type: "object",
              required: ["hint", "label", "widthMm", "heightMm", "bleedMm", "sides"],
              properties: {
                hint: { type: "string", enum: PRODUCT_VALUES },
                label: { type: "string" },
                widthMm: { type: "number" },
                heightMm: { type: "number" },
                bleedMm: { type: "number" },
                sides: { type: "integer", enum: [1, 2] },
                paper: { type: "string" },
              },
            },
            quantity: { type: "integer", minimum: 1, maximum: 1000000 },
            wishDate: { type: ["string", "null"], format: "date" },
            delivery: {
              type: "object",
              required: ["mode"],
              properties: { mode: { type: "string", enum: ["abholung", "lieferung"] }, address: { type: ["string", "null"] } },
            },
            note: { type: "string" },
            event: { type: "string" },
            printerCheck: { type: "boolean" },
            preflight: { type: ["string", "null"], enum: ["ok", "warnung", "fehler", null] },
            file: {
              type: "object",
              required: ["url", "name", "mime", "size", "sha256"],
              properties: {
                url: { type: "string", format: "uri", description: "HTTPS, Host in der Freigabeliste des Partners." },
                name: { type: "string" },
                mime: { type: "string" },
                size: { type: "integer" },
                sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
              },
            },
            source: {
              type: "object",
              required: ["system"],
              properties: { system: { type: "string" }, publication: { type: "string" }, link: { type: "string", format: "uri" } },
            },
          },
        },
        PartnerRequest: {
          type: "object",
          required: ["id", "number", "status", "partnerRef", "createdAt", "trackingNumber", "specialDeliveryDate"],
          properties: {
            id: { type: "string", format: "uuid" },
            number: { type: ["string", "null"] },
            status: { type: "string", enum: ["RECEIVED", "IN_REVIEW", "WAITING_APPROVAL", "IN_PROGRESS", "SHIPPED", "WITHDRAWN"] },
            partnerRef: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            trackingNumber: { type: ["string", "null"] },
            specialDeliveryDate: { type: ["string", "null"], format: "date" },
          },
        },
        PartnerRequestEnvelope: { type: "object", required: ["request"], properties: { request: { $ref: "#/components/schemas/PartnerRequest" } } },
      },
    },
  };
}
