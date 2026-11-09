"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import "./fotoband.css";

export type FotobandPanel = {
  id: string;
  titel: string;
  /** Kurzzusammenfassung, sichtbar sobald das Panel abgeschlossen und zugeklappt ist. */
  zusammenfassung?: string;
  /** Muss wahr sein, damit „Weiter“ aktiv ist und das nächste Panel freigeschaltet wird. */
  gueltig: boolean;
  /** Erklärt, warum „Weiter“ gerade nicht möglich ist. */
  hinweis?: string;
  inhalt: ReactNode;
  /** Ersetzt „Weiter“ (letztes Panel: Sendeknopf). */
  aktion?: ReactNode;
};

const OEFFNEN_MS = 880;
const FOKUSSIERBAR =
  '[data-fb-fokus], textarea, input:not(.sr-only), button[role="combobox"], [role="button"][tabindex="0"], button:not([disabled])';

/**
 * Fotoband: nummerierte Panels, die nacheinander wie ein Leporello aufklappen.
 * Es ist immer höchstens ein Panel offen; spätere Panels bleiben gesperrt, bis das vorige gültig bestätigt ist.
 */
export function Fotoband({
  panels,
  gesperrt = false,
  className,
}: {
  panels: FotobandPanel[];
  /** Sperrt Wechsel und „Weiter“ (z. B. während des Sendens). */
  gesperrt?: boolean;
  className?: string;
}) {
  const basis = useId();
  const [offen, setOffen] = useState<number | null>(0);
  const [erreicht, setErreicht] = useState(0);
  const fokusNach = useRef<number | null>(null);
  const koerper = useRef<(HTMLDivElement | null)[]>([]);

  const frei = (i: number) => i <= erreicht && panels.slice(0, i).every((p) => p.gueltig);

  useEffect(() => {
    if (offen === null || fokusNach.current !== offen) return;
    fokusNach.current = null;
    const region = koerper.current[offen];
    if (!region) return;
    (region.querySelector<HTMLElement>(FOKUSSIERBAR) ?? region).focus({ preventScroll: true });
    const reduziert = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      () => region.closest("li")?.scrollIntoView({ block: "nearest", behavior: reduziert ? "auto" : "smooth" }),
      reduziert ? 0 : OEFFNEN_MS,
    );
    return () => window.clearTimeout(timer);
  }, [offen]);

  function umschalten(i: number) {
    if (gesperrt || !frei(i)) return;
    setOffen(offen === i ? null : i);
  }

  function weiter(i: number) {
    if (gesperrt || !panels[i].gueltig || i + 1 >= panels.length) return;
    setErreicht((e) => Math.max(e, i + 1));
    fokusNach.current = i + 1;
    setOffen(i + 1);
  }

  return (
    <ol className={className ? `fotoband ${className}` : "fotoband"}>
      {panels.map((p, i) => {
        const istOffen = offen === i && frei(i);
        const istFrei = frei(i);
        const letztes = i === panels.length - 1;
        const fertig = !istOffen && istFrei && i < erreicht && p.gueltig;
        const zustand = istOffen ? "offen" : fertig ? "fertig" : istFrei ? "bereit" : "gesperrt";
        const zeigeSumme = !istOffen && !!p.zusammenfassung && (fertig || (letztes && istFrei));
        const kopfId = `${basis}-kopf-${p.id}`;
        const koerperId = `${basis}-koerper-${p.id}`;
        const hinweisId = `${basis}-hinweis-${p.id}`;
        return (
          <li key={p.id} className="fb-panel" data-zustand={zustand} data-tour={`fb-${p.id}`} style={{ ["--i" as string]: i } as CSSProperties}>
            <h2 className="fb-titel">
              <button
                type="button"
                id={kopfId}
                className="fb-kopf"
                aria-expanded={istOffen}
                aria-controls={koerperId}
                aria-disabled={!istFrei || gesperrt ? true : undefined}
                onClick={() => umschalten(i)}
              >
                <span className="rail-step" data-state={istOffen ? "current" : fertig ? "done" : "pending"}>
                  <span className="rail-node">
                    {fertig ? (
                      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                </span>
                <span className="fb-text">
                  <span className="fb-name">{p.titel}</span>
                  {zeigeSumme && <span className="fb-summe">{p.zusammenfassung}</span>}
                </span>
                {fertig && !gesperrt && (
                  <span className="fb-aendern" aria-hidden="true">
                    Ändern
                  </span>
                )}
              </button>
            </h2>
            <div className="fb-koerper" data-offen={istOffen ? "" : undefined}>
              <div className="fb-huelle">
                <div
                  id={koerperId}
                  ref={(el) => {
                    koerper.current[i] = el;
                  }}
                  role="region"
                  aria-labelledby={kopfId}
                  tabIndex={-1}
                  inert={!istOffen}
                  className="fb-falz"
                >
                  <div className="fb-inhalt">
                    {p.inhalt}
                    <div className="fb-fuss">
                      {p.aktion ?? (
                        <Button onClick={() => weiter(i)} disabled={gesperrt || !p.gueltig} aria-describedby={!p.gueltig && p.hinweis ? hinweisId : undefined}>
                          Weiter
                        </Button>
                      )}
                      {!p.aktion && !p.gueltig && p.hinweis && (
                        <p id={hinweisId} className="fb-hinweis">
                          {p.hinweis}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
