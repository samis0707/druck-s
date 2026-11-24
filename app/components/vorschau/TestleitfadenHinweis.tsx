"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Dezenter Hinweis auf dem Staff-Start, nur in der Vorschau (Schalter zur Laufzeit über /api/vorschau). */
export function TestleitfadenHinweis() {
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
  if (!aktiv) return null;
  return (
    <p data-testleitfaden-hinweis className="rounded-2xl border border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
      Neu hier?{" "}
      <Link href="/staff/vorschau-test" className="font-medium text-foreground underline underline-offset-4">
        Testleitfaden öffnen
      </Link>
    </p>
  );
}
