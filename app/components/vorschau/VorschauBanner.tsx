"use client";

import { useEffect, useState } from "react";
import { VORSCHAU_BANNER_TEXT } from "@/lib/vorschau/modus";

/** Schmales, nicht wegklickbares Hinweisband der Vorschau-Umgebung (Darstellung ohne Abfrage, testbar). */
export function VorschauHinweis() {
  return (
    <div
      role="status"
      data-vorschau-banner
      className="w-full bg-amber-400 px-4 py-1 text-center text-xs font-semibold text-black"
    >
      {VORSCHAU_BANNER_TEXT}
    </div>
  );
}

/** Zeigt das Band nur, wenn der Server meldet, dass PREVIEW_MODE aktiv ist (/api/vorschau, zur Laufzeit). */
export function VorschauBanner() {
  const [aktiv, setAktiv] = useState(false);
  useEffect(() => {
    let abgebrochen = false;
    fetch("/api/vorschau", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { vorschau?: boolean } | null) => {
        if (!abgebrochen && d?.vorschau === true) setAktiv(true);
      })
      .catch(() => {});
    return () => {
      abgebrochen = true;
    };
  }, []);
  return aktiv ? <VorschauHinweis /> : null;
}
