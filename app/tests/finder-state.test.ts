import { describe, expect, it } from "vitest";
import {
  LEER_FILTER,
  findeAuftraege,
  sortiereAssets,
  toPreviewItem,
  type FinderRequest,
} from "@/components/finder/finder-state";

const ROWS: FinderRequest[] = [
  {
    id: "a1",
    number: "250926-003",
    productHint: "Flyer",
    freeText: "100 Flyer",
    status: "RECEIVED",
    trust: "VERIFIED",
    email: "a@example.com",
    fileCount: 2,
    createdAt: "2026-09-20T10:00:00Z",
    files: [{ id: "f1", fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 100, printability: "red", securityVerdict: "CLEAN" }],
  },
  {
    id: "b2",
    productHint: "Poster",
    freeText: "1 Poster",
    status: "IN_REVIEW",
    trust: "VOUCHED",
    email: "b@example.com",
    fileCount: 1,
    createdAt: "2026-09-21T10:00:00Z",
    files: [{ id: "f2", fileName: "b.pdf", mimeType: "application/pdf", sizeBytes: 200, printability: "green", securityVerdict: "CLEAN" }],
  },
  {
    id: "c3",
    productHint: "Karte",
    freeText: "50 Karten",
    status: "RECEIVED",
    trust: "VERIFIED",
    email: "c@example.com",
    fileCount: 1,
    createdAt: "2026-09-19T10:00:00Z",
    files: [{ id: "f3", fileName: "c.pdf", mimeType: "application/pdf", sizeBytes: 50, printability: "green", securityVerdict: "INFECTED" }],
  },
];

describe("finder filter/sort (eine Wahrheit für View B und C)", () => {
  it("liefert beiden Views dieselbe gefilterte Menge", () => {
    const filter = { ...LEER_FILTER, statuses: ["RECEIVED"] };
    const fuerB = findeAuftraege(ROWS, filter);
    const fuerC = findeAuftraege(ROWS, filter);
    expect(fuerB.map((r) => r.id)).toEqual(["a1", "c3"]);
    expect(fuerC.map((r) => r.id)).toEqual(fuerB.map((r) => r.id));
  });

  it("filtert auf braucht-Blick (withheld/problem/review)", () => {
    const nurBlick = findeAuftraege(ROWS, { ...LEER_FILTER, attentionOnly: true });
    expect(nurBlick.map((r) => r.id).sort()).toEqual(["a1", "c3"]);
  });

  it("sortiert Dringendste zuerst (withheld vor problem vor ok)", () => {
    const sortiert = findeAuftraege(ROWS, { ...LEER_FILTER, sort: "rollup" });
    expect(sortiert.map((r) => r.id)).toEqual(["c3", "a1", "b2"]);
  });

  it("sortiert Assets Auffälligste zuerst", () => {
    const dateien = [
      { id: "x", fileName: "ok.pdf", mimeType: "application/pdf", sizeBytes: 10, printability: "green", securityVerdict: "CLEAN" },
      { id: "y", fileName: "arg.pdf", mimeType: "application/pdf", sizeBytes: 5, printability: "red", securityVerdict: "CLEAN" },
    ];
    expect(sortiereAssets(dateien, "severity").map((f) => f.id)).toEqual(["y", "x"]);
    expect(sortiereAssets(dateien, "name").map((f) => f.id)).toEqual(["y", "x"]);
    expect(sortiereAssets(dateien, "size").map((f) => f.id)).toEqual(["x", "y"]);
  });

  it("findet Aufträge über die Auftragsnummer (mit und ohne Bindestrich, auch Teilstücke)", () => {
    const treffer = (query: string) => findeAuftraege(ROWS, { ...LEER_FILTER, query }).map((r) => r.id);
    expect(treffer("250926-003")).toEqual(["a1"]);
    expect(treffer("250926003")).toEqual(["a1"]);
    expect(treffer("-003")).toEqual(["a1"]);
    expect(treffer("250926-999")).toEqual([]);
  });

  it("baut Quicklook-Items mit Staff-URL und Zurückgehalten-Hinweis", () => {
    const item = toPreviewItem("a1", { id: "f3", fileName: "c.pdf", mimeType: "application/pdf", sizeBytes: 50, printability: "green", securityVerdict: "INFECTED" });
    expect(item.src).toBe("/api/staff/requests/a1/files/f3");
    expect(item.withheld).toBe(true);
    expect(item.withholdReasons).toHaveLength(1);
  });
});
