"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { gleich, karteFuer, kartenBreite, kartenRahmen, lochFuer, type Ausschnitt, type Rechteck } from "./position";
import type { TourSchritt } from "./touren";

const DUNKEL = "rgba(22, 25, 28, .55)";
const RING = "var(--color-brand-400)";

/** Sichtbares Element zum Schritt suchen; ungültige Selektoren oder versteckte Elemente zählen als „fehlt“. */
export function findeZiel(schritt: TourSchritt): HTMLElement | null {
  const selektoren = [schritt.ziel ? `[data-tour="${schritt.ziel}"]` : null, schritt.selektor ?? null].filter(Boolean) as string[];
  for (const s of selektoren) {
    try {
      const el = document.querySelector<HTMLElement>(s);
      if (el && el.getClientRects().length > 0) return el;
    } catch {
      // ungültiger Selektor – dann ohne Hervorhebung
    }
  }
  return null;
}

function bewegungReduziert() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

interface Ansicht {
  loch: Rechteck | null;
  rahmen: { top: number; left: number; width: number } | null;
}

function sichtbarerAusschnitt(): Ausschnitt {
  const vv = window.visualViewport;
  return vv
    ? { x: vv.offsetLeft, y: vv.offsetTop, breite: vv.width, hoehe: vv.height }
    : { x: 0, y: 0, breite: window.innerWidth, hoehe: window.innerHeight };
}

/**
 * Abdunklung mit „Loch“ um das aktuelle Element und Karte mit dem Text.
 * Esc beendet, Pfeiltasten blättern, Tab bleibt in der Karte.
 */
export function TourOverlay({ schritte, onEnde }: { schritte: TourSchritt[]; onEnde: () => void }) {
  const [liste] = useState(() => schritte.filter((s) => !s.optional || findeZiel(s)));
  const [nr, setNr] = useState(0);
  const [ansicht, setAnsicht] = useState<Ansicht>({ loch: null, rahmen: null });
  const karteRef = useRef<HTMLDivElement>(null);
  const zielRef = useRef<HTMLElement | null>(null);
  const titelId = useId();
  const textId = useId();

  const schritt = liste[nr];
  const letzter = nr === liste.length - 1;

  const weiter = useCallback(() => {
    if (nr >= liste.length - 1) onEnde();
    else setNr(nr + 1);
  }, [nr, liste.length, onEnde]);
  const zurueck = useCallback(() => setNr((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null;
    return () => {
      try {
        vorher?.focus({ preventScroll: true });
      } catch {
        // Element gibt es nicht mehr
      }
    };
  }, []);

  useEffect(() => {
    if (!schritt) return;
    const el = findeZiel(schritt);
    zielRef.current = el;
    const hoch = !!el && el.getBoundingClientRect().height > sichtbarerAusschnitt().hoehe * 0.6;
    el?.scrollIntoView({ block: hoch ? "start" : "center", inline: "nearest", behavior: bewegungReduziert() ? "auto" : "smooth" });
    karteRef.current?.focus({ preventScroll: true });
  }, [schritt]);

  useEffect(() => {
    if (!schritt) return;
    let frame = 0;
    let letzte: Ansicht = { loch: null, rahmen: null };
    const messen = () => {
      let el = zielRef.current;
      if (!el || !el.isConnected) {
        el = findeZiel(schritt);
        zielRef.current = el;
      }
      const sicht = sichtbarerAusschnitt();
      const r = el?.getBoundingClientRect() ?? null;
      const lochSicht = lochFuer(r ? { top: r.top - sicht.y, left: r.left - sicht.x, width: r.width, height: r.height } : null, sicht);
      const loch = lochSicht && { ...lochSicht, top: lochSicht.top + sicht.y, left: lochSicht.left + sicht.x };
      const karte = karteRef.current;
      let rahmen: Ansicht["rahmen"] = null;
      if (karte) {
        const groesse = { breite: kartenBreite(sicht), hoehe: karte.offsetHeight };
        rahmen = kartenRahmen(karteFuer(lochSicht, groesse, sicht), groesse, sicht);
      }
      if (!gleich(loch, letzte.loch) || JSON.stringify(rahmen) !== JSON.stringify(letzte.rahmen)) {
        letzte = { loch, rahmen };
        setAnsicht(letzte);
      }
      frame = requestAnimationFrame(messen);
    };
    frame = requestAnimationFrame(messen);
    return () => cancelAnimationFrame(frame);
  }, [schritt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onEnde();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        weiter();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        zurueck();
      } else if (e.key === "Tab") {
        const karte = karteRef.current;
        if (!karte) return;
        const fokusierbar = [...karte.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
        if (!fokusierbar.length) return;
        const erstes = fokusierbar[0];
        const letztes = fokusierbar[fokusierbar.length - 1];
        const aktiv = document.activeElement;
        if (e.shiftKey && (aktiv === erstes || aktiv === karte || !karte.contains(aktiv))) {
          e.preventDefault();
          letztes.focus();
        } else if (!e.shiftKey && (aktiv === letztes || !karte.contains(aktiv))) {
          e.preventDefault();
          erstes.focus();
        }
      }
    };
    // capture: vor den Tastenkürzeln der Seite (z. B. Staff-Liste j/k/Esc)
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onEnde, weiter, zurueck]);

  if (!schritt) return null;
  const { loch, rahmen } = ansicht;

  return createPortal(
    <div className="fixed inset-0 z-[100]" data-tour-overlay="">
      {loch ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-2xl"
          style={{ ...loch, boxShadow: `0 0 0 3px ${RING}, 0 0 0 9999px ${DUNKEL}` }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0" style={{ background: DUNKEL }} />
      )}

      <div
        ref={karteRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        aria-describedby={textId}
        tabIndex={-1}
        className={cn("fixed rounded-3xl border bg-card p-5 text-card-foreground shadow-(--shadow-e3) outline-none", !rahmen && "opacity-0")}
        style={rahmen ?? { top: 0, left: 0, width: kartenBreite(sichtbarerAusschnitt()) }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Schritt {nr + 1} von {liste.length}
            </p>
            <h2 id={titelId} className="text-base font-semibold">
              {schritt.titel}
            </h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onEnde} aria-label="Tour beenden" className="-mt-1 -mr-1 shrink-0">
            <HugeiconsIcon icon={Cancel01Icon} size={16} aria-hidden="true" />
          </Button>
        </div>
        <p id={textId} className="mt-1.5 text-sm leading-relaxed">
          {schritt.text}
        </p>
        {schritt.link && (
          <p className="mt-2 text-sm">
            <Link href={schritt.link.href} className="font-medium underline underline-offset-[3px]" onClick={onEnde}>
              {schritt.link.label}
            </Link>
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1" aria-hidden>
            {liste.map((_, i) => (
              <span key={i} className={cn("size-1.5 rounded-full", i === nr ? "bg-primary" : "bg-muted-foreground/30")} />
            ))}
          </div>
          <div className="flex gap-2">
            {nr > 0 && (
              <Button variant="outline" size="sm" onClick={zurueck}>
                Zurück
              </Button>
            )}
            <Button size="sm" onClick={weiter}>
              {letzter ? "Fertig" : "Weiter"}
            </Button>
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        Tour: Schritt {nr + 1} von {liste.length}, {schritt.titel}
      </p>
    </div>,
    document.body,
  );
}
