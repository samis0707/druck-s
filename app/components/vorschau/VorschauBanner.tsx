"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { VORSCHAU_BANNER_TEXT } from "@/lib/vorschau/modus";

/** Schmales, nicht wegklickbares Hinweisband der Vorschau-Umgebung (Darstellung ohne Abfrage, testbar). */
export function VorschauHinweis({ mitLeitfaden = false }: { mitLeitfaden?: boolean } = {}) {
  return (
    <div
      role="status"
      data-vorschau-banner
      className="w-full bg-amber-400 px-4 py-1 text-center text-xs font-semibold text-black"
    >
      {VORSCHAU_BANNER_TEXT}
      {mitLeitfaden && (
        <>
          {" · "}
          <Link href="/staff/vorschau-test" className="underline underline-offset-2" data-testleitfaden-link>
            Testleitfaden
          </Link>
        </>
      )}
    </div>
  );
}

/** Zeigt das Band nur, wenn der Server meldet, dass PREVIEW_MODE aktiv ist (/api/vorschau, zur Laufzeit). */
export function VorschauBanner() {
  const [aktiv, setAktiv] = useState(false);
  const [staff, setStaff] = useState(false);
  const pfad = usePathname();
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
  // Link nur für angemeldete Mitarbeitende: erst fragen, wenn die Vorschau feststeht.
  useEffect(() => {
    if (!aktiv) return;
    let abgebrochen = false;
    fetch("/api/vorschau/staff", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { staff?: boolean } | null) => {
        if (!abgebrochen && d?.staff === true) setStaff(true);
      })
      .catch(() => {});
    return () => {
      abgebrochen = true;
    };
  }, [aktiv, pfad]); // nach dem Login (Seitenwechsel) erneut prüfen
  return aktiv ? <VorschauHinweis mitLeitfaden={staff} /> : null;
}
