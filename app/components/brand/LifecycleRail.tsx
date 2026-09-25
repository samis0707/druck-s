"use client";

import { useEffect, useState, type CSSProperties } from "react";

export const RAIL_STEPS = ["RECEIVED", "IN_REVIEW", "WAITING_APPROVAL", "IN_PROGRESS", "SHIPPED"] as const;

export const RAIL_LABELS: Record<"customer" | "staff", string[]> = {
  customer: ["Eingang", "Prüfung", "Ihre Freigabe", "Produktion", "Versand"],
  staff: ["Eingang", "Prüfung", "Freigabe", "Produktion", "Versand"],
};

const HINTS = [
  "Ihre Dateien sind da und automatisch vorgeprüft.",
  "Unsere Vorstufe schaut sich Daten und Wünsche an.",
  "Sie erhalten Bestätigung und Druckdaten und geben mit einem Code frei.",
  "Freigegeben: Ihr Auftrag läuft in die Produktion.",
  "Versandt — mit Sendungsnummer oder Liefertermin.",
];

const AUTOPLAY_MS = 2200;

/** Stufenindex eines Status; DRAFT und Unbekanntes ergeben -1 (noch nichts erreicht). */
export function railIndex(status: string): number {
  return (RAIL_STEPS as readonly string[]).indexOf(status);
}

/**
 * Animierte Lebenszyklus-Schiene über die fünf sichtbaren Status.
 * `autoplay` läuft die Stufen als Erklärung durch (Startseite), sonst zeigt sie `status`.
 */
export function LifecycleRail({
  status,
  audience = "customer",
  autoplay = false,
  className,
}: {
  status?: string;
  audience?: "customer" | "staff";
  autoplay?: boolean;
  className?: string;
}) {
  const [tick, setTick] = useState(0);
  const [shown, setShown] = useState(-1);
  const target = autoplay ? tick : railIndex(status ?? "");

  useEffect(() => {
    if (!autoplay) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setTick(RAIL_STEPS.length - 1));
      return () => cancelAnimationFrame(frame);
    }
    const timer = setInterval(() => setTick((t) => (t + 1) % (RAIL_STEPS.length + 1)), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [autoplay]);

  // Erst nach dem Mount setzen, damit die Füllung sichtbar von leer nach Ziel läuft.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(Math.min(target, RAIL_STEPS.length - 1)));
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const progress = Math.max(0, shown) / (RAIL_STEPS.length - 1);
  const labels = RAIL_LABELS[audience];
  return (
    <div className={className}>
      <div className="relative">
        <div className="rail-track" aria-hidden="true">
          <div className="rail-fill" style={{ ["--p" as string]: progress } as CSSProperties} />
        </div>
        <ol className="rail" aria-label="Auftragsstatus">
          {RAIL_STEPS.map((step, i) => {
            const state = i < shown ? "done" : i === shown ? "current" : "pending";
            const erledigt = state === "done" || (state === "current" && step === "SHIPPED");
            return (
              <li key={step} className="rail-step" data-state={erledigt ? "done" : state} aria-current={state === "current" ? "step" : undefined}>
                <span className="rail-node">
                  {erledigt ? (
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="rail-label">{labels[i]}</span>
              </li>
            );
          })}
        </ol>
      </div>
      {autoplay && (
        <p className="mt-4 min-h-10 text-center text-sm text-(--color-ink-mid)" aria-live="off">
          {HINTS[Math.min(Math.max(shown, 0), HINTS.length - 1)]}
        </p>
      )}
    </div>
  );
}
