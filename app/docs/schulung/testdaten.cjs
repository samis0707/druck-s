/**
 * Fiktive Testdaten für die Schulungs-Screenshots (Muster GmbH, example.org).
 * Die App läuft dabei ohne Datenbank: screenshots.cjs beantwortet alle /api-Aufrufe mit diesen Daten.
 * Keine echten Personen, Firmen oder Aufträge verwenden.
 */

const heute = new Date("2026-11-09T09:30:00+01:00");
const tageZurueck = (n, h = 0) => new Date(heute.getTime() - n * 864e5 - h * 36e5).toISOString();

const KUNDE = { email: "anna.muster@example.org", displayName: "Anna Muster", firm: "Muster GmbH" };

const OK_PDF = {
  printability: "green",
  findings: [
    { check: "page_count", summary: "2 pages" },
    { check: "page_size", summary: "all pages 154 x 216 mm" },
    { check: "bleed", summary: "bleed 3 mm on all pages" },
    { check: "color_mode", summary: "CMYK throughout" },
    { check: "fonts", summary: "all 3 fonts embedded" },
  ],
  uniformity: null,
  security: { verdict: "CLEAN", reasons: [], scan: { status: "CLEAN" } },
};
const GELB_BILD = {
  printability: "yellow",
  findings: [{ check: "resolution", summary: "212 dpi (metadata) is usable but below 300 dpi" }],
  uniformity: null,
  security: { verdict: "CLEAN", reasons: [], scan: { status: "CLEAN" } },
};

const NOTIZ = {
  bullets: [
    { text: "Flyer DIN lang, 2-seitig, 2.500 Stück auf 170 g Bilderdruck matt — wie im Auftrag 140926-003.", sources: [] },
    { text: "Vorder- und Rückseite haben 3 mm Anschnitt und eingebettete Schriften.", sources: [] },
    { text: "Das Logo (PNG) ist mit ca. 212 dpi etwas gering aufgelöst; für Druckgröße 4 cm reicht es knapp.", sources: [] },
    { text: "Wunschtermin 20.11. — bitte Lieferadresse bestätigen.", sources: [] },
  ],
  suggestedCategory: "flyer",
};

function dateien(prefix, liste) {
  return liste.map(([fileName, mimeType, sizeBytes, report], i) => ({ id: `${prefix}-f${i + 1}`, fileName, mimeType, sizeBytes, report }));
}

const FLYER_DATEIEN = (p) =>
  dateien(p, [
    ["flyer-vorderseite.pdf", "application/pdf", 1843200, OK_PDF],
    ["flyer-rueckseite.pdf", "application/pdf", 1622016, OK_PDF],
    ["logo-muster.png", "image/png", 284672, GELB_BILD],
  ]);

function detail(id, number, status, extra = {}) {
  return {
    request: {
      id,
      number,
      ref: number,
      status,
      trust: "VERIFIED",
      productHint: "flyer",
      referenceText: "wie Auftrag 140926-003",
      freeText:
        "2.500 Flyer DIN lang, beidseitig, 170 g Bilderdruck matt. Lieferung bis 20.11. an Muster GmbH, Musterweg 1, 74072 Heilbronn.",
      createdAt: tageZurueck(1),
    },
    customer: KUNDE,
    partner: null,
    files: FLYER_DATEIEN(id),
    bundles: [],
    shipment: null,
    invoicePending: false,
    note: NOTIZ,
    ...extra,
  };
}

const BUNDLE = (id) => ({
  id: `${id}-b1`,
  version: 1,
  reason: null,
  createdAt: tageZurueck(0, 3),
  confirmation: { name: "Auftragsbestaetigung-091126-004.pdf", mimeType: "application/pdf", url: `/api/requests/${id}/bundles/1/confirmation` },
  printFiles: [
    { name: "druck-flyer-vorderseite.pdf", mimeType: "application/pdf", url: `/api/requests/${id}/bundles/1/print-0` },
    { name: "druck-flyer-rueckseite.pdf", mimeType: "application/pdf", url: `/api/requests/${id}/bundles/1/print-1` },
  ],
});

const DETAILS = {
  r1: detail("r1", "091126-004", "RECEIVED"),
  r2: detail("r2", "091126-004", "IN_REVIEW"),
  r3: detail("r3", "091126-004", "WAITING_APPROVAL", { bundles: [BUNDLE("r3")] }),
  r4: detail("r4", "091126-004", "SHIPPED", {
    bundles: [BUNDLE("r4")],
    shipment: { trackingNumber: "00340434161094042557", specialDeliveryDate: null, invoiceUrl: "/api/requests/r4/invoice" },
  }),
  r5: detail("r5", "091126-004", "IN_PROGRESS", { bundles: [BUNDLE("r5")] }),
};

const LISTE = [
  { id: "r3", number: "091126-004", productHint: "flyer", freeText: DETAILS.r3.request.freeText, status: "WAITING_APPROVAL", fileCount: "3", createdAt: tageZurueck(0, 2) },
  { id: "r6", number: "061126-002", productHint: "business-card", freeText: "Visitenkarten für zwei neue Kolleginnen, 250 Stück je Person.", status: "IN_PROGRESS", fileCount: "2", createdAt: tageZurueck(3) },
  { id: "r4", number: "281026-011", productHint: "poster", freeText: "Plakat A2 für den Tag der offenen Tür, 40 Stück.", status: "SHIPPED", fileCount: "1", createdAt: tageZurueck(12) },
  { id: "r7", number: "140926-003", productHint: "flyer", freeText: "Flyer DIN lang, 2.000 Stück, wie im Frühjahr.", status: "SHIPPED", fileCount: "2", createdAt: tageZurueck(56) },
];

const STAFF_LISTE = [
  {
    id: "r2", number: "091126-004", productHint: "flyer", freeText: DETAILS.r2.request.freeText, status: "IN_REVIEW", trust: "VERIFIED",
    partnerName: null, partnerRef: null, email: KUNDE.email, fileCount: 3, createdAt: tageZurueck(0, 1),
    files: FLYER_DATEIEN("r2").map((f) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, printability: f.report.printability, securityVerdict: f.report.security.verdict })),
  },
  {
    id: "s2", number: "091126-003", productHint: "letterhead", freeText: "Briefpapier, 1.000 Blatt, Vorlage als Word-Datei.", status: "RECEIVED", trust: "VOUCHED",
    partnerName: null, partnerRef: null, email: "info@beispiel-praxis.example", fileCount: 1, createdAt: tageZurueck(0, 2),
    files: [{ id: "s2-f1", fileName: "briefbogen.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 98304, printability: "red", securityVerdict: "SUSPICIOUS" }],
  },
  {
    id: "s3", number: "091126-002", productHint: "poster", freeText: "Plakat A2, 10 Stück, matt — Kinderbasar Sa 14.11.", status: "RECEIVED", trust: "VOUCHED",
    partnerName: "Seeräuber digital", partnerRef: "sd-2026-0815", email: "verein@example.org", fileCount: 1, createdAt: tageZurueck(0, 4),
    files: [{ id: "s3-f1", fileName: "plakat-kinderbasar.pdf", mimeType: "application/pdf", sizeBytes: 3145728, printability: "yellow", securityVerdict: "CLEAN" }],
  },
  {
    id: "s4", number: "081126-007", productHint: "business-card", freeText: "Visitenkarten 85 x 55 mm, 500 Stück, 350 g.", status: "WAITING_APPROVAL", trust: "VERIFIED",
    partnerName: null, partnerRef: null, email: "b.beispiel@example.com", fileCount: 2, createdAt: tageZurueck(1, 3),
    files: [
      { id: "s4-f1", fileName: "visitenkarte-vorne.pdf", mimeType: "application/pdf", sizeBytes: 524288, printability: "green", securityVerdict: "CLEAN" },
      { id: "s4-f2", fileName: "visitenkarte-hinten.pdf", mimeType: "application/pdf", sizeBytes: 498000, printability: "green", securityVerdict: "CLEAN" },
    ],
  },
  {
    id: "s5", number: "061126-002", productHint: "sticker", freeText: "Aufkleber rund 5 cm, 1.000 Stück.", status: "IN_PROGRESS", trust: "VERIFIED",
    partnerName: null, partnerRef: null, email: "shop@example.net", fileCount: 1, createdAt: tageZurueck(3),
    files: [{ id: "s5-f1", fileName: "aufkleber.pdf", mimeType: "application/pdf", sizeBytes: 812000, printability: "green", securityVerdict: "CLEAN" }],
  },
  {
    id: "s6", number: "281026-011", productHint: "brochure", freeText: "Broschüre A4, 16 Seiten, 300 Stück.", status: "SHIPPED", trust: "VERIFIED",
    partnerName: null, partnerRef: null, email: "verwaltung@example.org", fileCount: 1, createdAt: tageZurueck(12),
    files: [{ id: "s6-f1", fileName: "broschuere-16s.pdf", mimeType: "application/pdf", sizeBytes: 9437184, printability: "green", securityVerdict: "CLEAN" }],
  },
];

const IDENTITAETEN = [
  { id: "i1", email: KUNDE.email, displayName: KUNDE.displayName, firm: KUNDE.firm, status: "customer", requestCount: "4", latestDump: { id: "d1", importedAt: tageZurueck(30), orderCount: 12 } },
  { id: "i2", email: "b.beispiel@example.com", displayName: "Ben Beispiel", firm: "Beispiel & Partner", status: "customer", requestCount: "2", latestDump: null },
  { id: "i3", email: "info@beispiel-praxis.example", displayName: null, firm: "Praxis Beispiel", status: "prospect", requestCount: "1", latestDump: null },
  { id: "i4", email: "alt@example.net", displayName: "Alte Adresse", firm: null, status: "disabled", requestCount: "0", latestDump: null },
];

const PROMPT_STANDARD =
  "Fasse die Anfrage des Kunden in 3–5 Stichpunkten zusammen: Produkt, Format, Auflage, Papier, Termin.\nNenne Auffälligkeiten aus der Druckdatenprüfung in einfachen Worten.\nVerweise auf frühere Aufträge, wenn der Kunde „wie letztes Mal“ schreibt.";
const PROMPT = {
  value: PROMPT_STANDARD + "\nHausregel: Flyer unter 500 Stück immer im Digitaldruck vorschlagen.",
  isDefault: false,
  defaultValue: PROMPT_STANDARD,
  updatedAt: tageZurueck(5),
  updatedBy: "vorstufe@digitalemedien.de",
  history: [
    { id: "h2", value: "…", updatedBy: "vorstufe@digitalemedien.de", createdAt: tageZurueck(5) },
    { id: "h1", value: "…", updatedBy: "admin@digitalemedien.de", createdAt: tageZurueck(40) },
  ],
};

module.exports = { KUNDE, DETAILS, LISTE, STAFF_LISTE, IDENTITAETEN, PROMPT };
