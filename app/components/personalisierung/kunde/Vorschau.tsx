"use client";

import { useEffect, useRef, useState } from "react";
import { PdfSeite, usePdfDokument } from "@/components/personalisierung/PdfSeite";
import type { Z } from "@/components/personalisierung/kunde/z";
import { ApiFehler } from "@/lib/personalisierung/ui/api";
import type { Datensatz } from "@/lib/personalisierung/schema";
import { cn } from "@/lib/utils";

/**
 * Vorschau eines Eintrags. Sie kommt IMMER vom Server als PDF und wird mit pdf.js angezeigt:
 * Schriftdateien werden nie an Kunden oder Gäste ausgeliefert (Lizenzen).
 * `datensatz` null = Beispielwerte der Vorlage. Änderungen lösen nach kurzer Pause eine neue Vorschau aus.
 */
export function Vorschau({ z, datensatz, hatRueckseite, verzoegerung = 1000, maxBreite = 420, className, dataTour }: { z: Z; datensatz: Datensatz | null; hatRueckseite: boolean; verzoegerung?: number; maxBreite?: number; className?: string; dataTour?: string }) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [breite, setBreite] = useState(maxBreite);
  const box = useRef<HTMLDivElement>(null);
  const zuletzt = useRef<string | null>(null);
  const key = JSON.stringify(datensatz);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBreite(Math.max(160, Math.min(maxBreite, el.clientWidth))));
    ro.observe(el);
    setBreite(Math.max(160, Math.min(maxBreite, el.clientWidth || maxBreite)));
    return () => ro.disconnect();
  }, [maxBreite]);

  useEffect(() => {
    if (zuletzt.current === key) return;
    const ctrl = new AbortController();
    setLaedt(true);
    const t = setTimeout(
      async () => {
        try {
          const res = await fetch(z.url("/vorschau"), { method: "POST", headers: { "content-type": "application/json", ...z.kopf() }, body: JSON.stringify({ datensatz }), signal: ctrl.signal });
          if (!res.ok) {
            let msg = "Die Vorschau ist gerade nicht verfügbar.";
            try {
              msg = ((await res.json()) as { error?: string }).error ?? msg;
            } catch {
              /* kein JSON */
            }
            throw new ApiFehler(res.status === 429 ? "Zu viele Vorschauen in kurzer Zeit. Ihre Eingaben bleiben erhalten; die Vorschau ist in einigen Minuten wieder verfügbar." : msg, res.status, "vorschau");
          }
          const b = new Uint8Array(await res.arrayBuffer());
          zuletzt.current = key;
          setBytes(b);
          setFehler(null);
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          setFehler(e instanceof Error ? e.message : "Die Vorschau ist gerade nicht verfügbar.");
        } finally {
          if (!ctrl.signal.aborted) setLaedt(false);
        }
      },
      zuletzt.current === null ? 0 : verzoegerung,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // z ändert sich nur mit dem Entwurf; datensatz steckt im Schlüssel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, z.ref, z.entwurf?.id, verzoegerung]);

  const { dokument, fehler: pdfFehler } = usePdfDokument(bytes);
  const seiten = dokument?.numPages ?? 0;
  return (
    <div ref={box} className={cn("space-y-3", className)} data-tour={dataTour} aria-busy={laedt}>
      <div className="relative space-y-3">
        {dokument ? (
          <>
            <figure className="space-y-1">
              <PdfSeite dokument={dokument} seite={1} breitePx={breite} className="rounded-sm border bg-white shadow-sm" label="Vorschau Vorderseite" />
              {hatRueckseite && <figcaption className="text-xs text-muted-foreground">Vorderseite</figcaption>}
            </figure>
            {hatRueckseite && seiten > 1 && (
              <figure className="space-y-1">
                <PdfSeite dokument={dokument} seite={2} breitePx={breite} className="rounded-sm border bg-white shadow-sm" label="Vorschau Rückseite" />
                <figcaption className="text-xs text-muted-foreground">Rückseite</figcaption>
              </figure>
            )}
          </>
        ) : (
          !fehler && <div className="flex h-40 items-center justify-center rounded-sm border bg-muted/40 text-sm text-muted-foreground">Vorschau wird erstellt …</div>
        )}
        {dokument && laedt && <div className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs shadow" role="status">wird aktualisiert …</div>}
      </div>
      {(fehler || pdfFehler) && <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm" role="status">{fehler ?? pdfFehler}</p>}
    </div>
  );
}
