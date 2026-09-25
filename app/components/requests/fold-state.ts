import { productLabel } from "@/lib/ui-text";
import { RAIL_STEPS, railIndex } from "@/components/brand/LifecycleRail";
import {
  bundlesNewestFirst,
  formatIsoDate,
  type Audience,
  type RequestDetail,
} from "@/components/requests/request-detail";

export type FoldStep = (typeof RAIL_STEPS)[number];

/**
 * done = erreicht und abgeschlossen, current = aktueller Status,
 * next = noch nicht erreicht, aber schon nutzbar (Vorprüfung / Staff-Anhang), locked = gesperrt.
 */
export type FoldState = "done" | "current" | "next" | "locked";

export interface Fold {
  step: FoldStep;
  index: number;
  state: FoldState;
}

/** Fold-Zustand je Stufe. SHIPPED gilt als abgeschlossen (Haken), bleibt aber die geöffnete Stufe. */
export function foldStates(status: string, audience: Audience): Fold[] {
  const cur = railIndex(status);
  return RAIL_STEPS.map((step, index) => {
    let state: FoldState;
    if (index < cur) state = "done";
    else if (index === cur) state = status === "SHIPPED" ? "done" : "current";
    else if (index === cur + 1 && isUnlocked(status, index, audience)) state = "next";
    else state = "locked";
    return { step, index, state };
  });
}

/** Vorprüfung ist ab Eingang lesbar; Staff kann in der Prüfung schon die Bestätigung anhängen. */
function isUnlocked(status: string, index: number, audience: Audience): boolean {
  if (status === "RECEIVED" && index === railIndex("IN_REVIEW")) return true;
  return audience === "staff" && status === "IN_REVIEW" && index === railIndex("WAITING_APPROVAL");
}

/** Anfangs geöffnete Stufen: der aktuelle Status, bei Staff in der Prüfung zusätzlich die Freigabe. */
export function defaultOpen(status: string, audience: Audience): FoldStep[] {
  const cur = railIndex(status);
  if (cur < 0) return [];
  const open: FoldStep[] = [RAIL_STEPS[cur]];
  if (audience === "staff" && status === "IN_REVIEW") open.push("WAITING_APPROVAL");
  return open;
}

const CURRENT_HINT: Record<Audience, Record<FoldStep, string>> = {
  customer: {
    RECEIVED: "Ihre Dateien sind da und automatisch vorgeprüft.",
    IN_REVIEW: "Unsere Vorstufe schaut sich Daten und Wünsche an.",
    WAITING_APPROVAL: "Prüfen Sie Auftragsbestätigung und Druckdaten und geben Sie mit einem Code frei.",
    IN_PROGRESS: "Freigegeben — Ihr Auftrag läuft in die Produktion.",
    SHIPPED: "Versandt — Sendungsnummer oder Liefertermin und Rechnung finden Sie hier.",
  },
  staff: {
    RECEIVED: "Eingegangen — Dateien und Befunde sichten.",
    IN_REVIEW: "In Prüfung — Befunde sichten, dann Bestätigung anhängen.",
    WAITING_APPROVAL: "Wartet auf die Kundenfreigabe.",
    IN_PROGRESS: "Freigegeben — in Produktion, danach Versand erfassen.",
    SHIPPED: "Versendet.",
  },
};

const NEXT_HINT: Record<Audience, Partial<Record<FoldStep, string>>> = {
  customer: { IN_REVIEW: "Die automatische Vorprüfung liegt schon vor — Sie können sie hier einsehen." },
  staff: {
    IN_REVIEW: "Automatischer Hinweis und Befunde liegen bereits vor.",
    WAITING_APPROVAL: "Auftragsbestätigung und Druckdateien anhängen und zur Freigabe senden.",
  },
};

const LOCKED_HINT: Record<Audience, Record<FoldStep, string>> = {
  customer: {
    RECEIVED: "Ihr Auftrag wird nach dem Eingang hier angezeigt.",
    IN_REVIEW: "Folgt, sobald unsere Vorstufe Ihre Daten prüft.",
    WAITING_APPROVAL:
      "Sobald wir Auftragsbestätigung und Druckdaten anhängen, finden Sie beides hier und geben mit einem Code frei.",
    IN_PROGRESS: "Startet nach Ihrer Freigabe.",
    SHIPPED: "Nach dem Versand erscheinen hier Sendungsnummer oder Liefertermin und Ihre Rechnung.",
  },
  staff: {
    RECEIVED: "Noch kein Eingang.",
    IN_REVIEW: "Folgt, sobald der Auftrag in Prüfung ist.",
    WAITING_APPROVAL: "Erst nach der Prüfung: Auftragsbestätigung und Druckdateien anhängen.",
    IN_PROGRESS: "Startet mit der Kundenfreigabe.",
    SHIPPED: "Erst nach der Produktion: Rechnung anhängen und Versand erfassen.",
  },
};

/** Erklärender Kurztext unter dem Stufentitel (nicht für abgeschlossene Stufen — dort steht die Zusammenfassung). */
export function foldHint(step: FoldStep, state: FoldState, audience: Audience): string | null {
  if (state === "done") return null;
  if (state === "current") return CURRENT_HINT[audience][step];
  if (state === "next") return NEXT_HINT[audience][step] ?? null;
  return LOCKED_HINT[audience][step];
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Kurzzusammenfassung einer erreichten Stufe, sichtbar auch im zusammengefalteten Zustand. */
export function foldSummary(step: FoldStep, detail: RequestDetail): string {
  const latest = bundlesNewestFirst(detail.bundles)[0];
  switch (step) {
    case "RECEIVED":
      return `${plural(detail.files.length, "Datei", "Dateien")} · ${productLabel(detail.request.productHint)}`;
    case "IN_REVIEW": {
      if (detail.note) return plural(detail.note.bullets.length, "Hinweis", "Hinweise");
      return detail.files.every((f) => f.report) ? "Analyse abgeschlossen" : "Analyse läuft";
    }
    case "WAITING_APPROVAL": {
      if (!latest) return "Keine Auftragsbestätigung";
      return `Version ${latest.version} · ${plural(latest.printFiles.length, "Druckdatei", "Druckdateien")}`;
    }
    case "IN_PROGRESS":
      return latest ? `Freigegeben · Version ${latest.version}` : "Freigegeben";
    case "SHIPPED": {
      const s = detail.shipment;
      if (s?.trackingNumber) return `Sendungsnummer ${s.trackingNumber}`;
      if (s?.specialDeliveryDate) return `Lieferung am ${formatIsoDate(s.specialDeliveryDate)}`;
      return "Versendet";
    }
  }
}
