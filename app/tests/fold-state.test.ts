import { describe, expect, it } from "vitest";
import { defaultOpen, foldHint, foldStates, foldSummary } from "@/components/requests/fold-state";
import {
  buildPreviewItems,
  customerLine,
  formatIsoDate,
  previewIds,
  type RequestDetail,
} from "@/components/requests/request-detail";

function detail(overrides: Partial<RequestDetail> = {}): RequestDetail {
  return {
    request: {
      id: "11111111-2222-3333-4444-555555555555",
      number: "250926-003",
      ref: "250926-003",
      status: "WAITING_APPROVAL",
      trust: "VERIFIED",
      productHint: "flyer",
      freeText: "100 Flyer",
    },
    customer: { email: "k@example.com", displayName: "Kim Kunde", firm: "Kunde GmbH" },
    files: [
      {
        id: "f1",
        fileName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        report: { printability: "green", findings: [], security: { verdict: "CLEAN", reasons: [] } },
      },
      {
        id: "f2",
        fileName: "b.png",
        mimeType: "image/png",
        sizeBytes: 50,
        report: { printability: "red", findings: [], security: { verdict: "INFECTED", reasons: ["x"] } },
      },
      { id: "f3", fileName: "c.docx", mimeType: "application/vnd.openxmlformats", sizeBytes: 5, report: null },
    ],
    bundles: [
      {
        id: "b1",
        version: 1,
        reason: null,
        createdAt: "2026-09-25T10:00:00Z",
        confirmation: { name: "ab1.pdf", mimeType: "application/pdf", url: "/api/requests/x/bundles/1/confirmation" },
        printFiles: [{ name: "p1.pdf", mimeType: "application/pdf", url: "/api/requests/x/bundles/1/print-0" }],
      },
      {
        id: "b2",
        version: 2,
        reason: "Beschnitt fehlte",
        createdAt: "2026-09-26T10:00:00Z",
        confirmation: { name: "ab2.pdf", mimeType: "application/pdf", url: "/api/requests/x/bundles/2/confirmation" },
        printFiles: [
          { name: "p2a.pdf", mimeType: "application/pdf", url: "/api/requests/x/bundles/2/print-0" },
          { name: "p2b.pdf", mimeType: "application/pdf", url: "/api/requests/x/bundles/2/print-1" },
        ],
      },
    ],
    shipment: null,
    note: { bullets: [{ text: "a", sources: [] }, { text: "b", sources: [] }], suggestedCategory: null },
    ...overrides,
  };
}

const states = (status: string, audience: "customer" | "staff" = "customer") =>
  foldStates(status, audience).map((f) => f.state);

describe("Fold-Zustand je Status", () => {
  it("aktueller Status offen, davor erledigt, danach gesperrt", () => {
    expect(states("WAITING_APPROVAL")).toEqual(["done", "done", "current", "locked", "locked"]);
    expect(states("IN_PROGRESS")).toEqual(["done", "done", "done", "current", "locked"]);
  });

  it("Eingang: Vorprüfung ist ab Eingang lesbar, der Rest gesperrt", () => {
    expect(states("RECEIVED")).toEqual(["current", "next", "locked", "locked", "locked"]);
  });

  it("Staff kann in der Prüfung schon die Freigabe befüllen, Kunde nicht", () => {
    expect(states("IN_REVIEW", "staff")).toEqual(["done", "current", "next", "locked", "locked"]);
    expect(states("IN_REVIEW", "customer")).toEqual(["done", "current", "locked", "locked", "locked"]);
  });

  it("Versendet: alles erledigt, Versand bleibt die geöffnete Stufe", () => {
    expect(states("SHIPPED")).toEqual(["done", "done", "done", "done", "done"]);
    expect(defaultOpen("SHIPPED", "customer")).toEqual(["SHIPPED"]);
  });

  it("Entwurf/Unbekanntes: nichts erreicht, nichts offen", () => {
    expect(states("DRAFT")).toEqual(["locked", "locked", "locked", "locked", "locked"]);
    expect(defaultOpen("DRAFT", "staff")).toEqual([]);
    expect(defaultOpen("???", "customer")).toEqual([]);
  });

  it("defaultOpen: aktueller Status, bei Staff in der Prüfung zusätzlich die Freigabe", () => {
    expect(defaultOpen("WAITING_APPROVAL", "customer")).toEqual(["WAITING_APPROVAL"]);
    expect(defaultOpen("IN_REVIEW", "customer")).toEqual(["IN_REVIEW"]);
    expect(defaultOpen("IN_REVIEW", "staff")).toEqual(["IN_REVIEW", "WAITING_APPROVAL"]);
  });
});

describe("Fold-Hinweise", () => {
  it("gesperrte Stufen erklären, warum sie gesperrt sind; erledigte haben keinen Hinweis", () => {
    for (const audience of ["customer", "staff"] as const) {
      for (const f of foldStates("RECEIVED", audience).filter((x) => x.state === "locked")) {
        expect(foldHint(f.step, f.state, audience)).toBeTruthy();
      }
    }
    expect(foldHint("RECEIVED", "done", "customer")).toBeNull();
    expect(foldHint("WAITING_APPROVAL", "next", "staff")).toMatch(/Auftragsbestätigung/);
  });
});

describe("Fold-Zusammenfassungen", () => {
  it("Eingang: Dateizahl und Produkt", () => {
    expect(foldSummary("RECEIVED", detail())).toBe("3 Dateien · Flyer");
    expect(foldSummary("RECEIVED", detail({ files: detail().files.slice(0, 1) }))).toBe("1 Datei · Flyer");
  });

  it("Prüfung: Hinweise oder Analysestand", () => {
    expect(foldSummary("IN_REVIEW", detail())).toBe("2 Hinweise");
    expect(foldSummary("IN_REVIEW", detail({ note: null }))).toBe("Analyse läuft");
    expect(foldSummary("IN_REVIEW", detail({ note: null, files: [] }))).toBe("Analyse abgeschlossen");
  });

  it("Freigabe/Produktion: neueste Version", () => {
    expect(foldSummary("WAITING_APPROVAL", detail())).toBe("Version 2 · 2 Druckdateien");
    expect(foldSummary("WAITING_APPROVAL", detail({ bundles: [] }))).toBe("Keine Auftragsbestätigung");
    expect(foldSummary("IN_PROGRESS", detail())).toBe("Freigegeben · Version 2");
  });

  it("Versand: Sendungsnummer, Liefertermin oder nur Versendet", () => {
    const s = (shipment: RequestDetail["shipment"]) => foldSummary("SHIPPED", detail({ shipment }));
    expect(s({ trackingNumber: "JJD123", specialDeliveryDate: null, invoiceUrl: "/i" })).toBe("Sendungsnummer JJD123");
    expect(s({ trackingNumber: null, specialDeliveryDate: "2026-09-30", invoiceUrl: "/i" })).toBe(
      "Lieferung am 30.09.2026",
    );
    expect(s(null)).toBe("Versendet");
  });
});

describe("Detail-Helfer", () => {
  it("Kundenzeile: Staff mit Name, Kunde ohne", () => {
    const c = { email: "k@example.com", displayName: "Kim Kunde", firm: "Kunde GmbH" };
    expect(customerLine(c, "staff")).toBe("Kim Kunde · Kunde GmbH · k@example.com");
    expect(customerLine(c, "customer")).toBe("Kunde GmbH · k@example.com");
    expect(customerLine({ email: "k@example.com", displayName: null, firm: null }, "staff")).toBe("k@example.com");
  });

  it("formatIsoDate lässt Unerwartetes unverändert", () => {
    expect(formatIsoDate("2026-01-05")).toBe("05.01.2026");
    expect(formatIsoDate("morgen")).toBe("morgen");
  });

  it("Preview-Items: Kundendateien, Versionen neueste zuerst, Rechnung zuletzt", () => {
    const items = buildPreviewItems(
      detail({ shipment: { trackingNumber: null, specialDeliveryDate: null, invoiceUrl: "/api/requests/x/invoice" } }),
      "customer",
      (id) => `/api/requests/x/files/${id}`,
    );
    expect(items.map((i) => i.id)).toEqual([
      previewIds.file("f1"),
      previewIds.file("f2"),
      previewIds.file("f3"),
      previewIds.confirmation(2),
      previewIds.print(2, 0),
      previewIds.print(2, 1),
      previewIds.confirmation(1),
      previewIds.print(1, 0),
      previewIds.invoice,
    ]);
    expect(items[1].withheld).toBe(true);
    expect(items[0].src).toBe("/api/requests/x/files/f1");
  });

  it("Staff sieht zusätzlich das Sicherheits-Badge", () => {
    const customer = buildPreviewItems(detail(), "customer", (id) => id)[0];
    const staff = buildPreviewItems(detail(), "staff", (id) => id)[0];
    expect(customer.badges).toHaveLength(1);
    expect(staff.badges).toHaveLength(2);
  });
});
