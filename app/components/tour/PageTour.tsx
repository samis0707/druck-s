"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Compass01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { alsAngebotenMerken, alsErledigtMerken, einladungZeigen, tourModusAusUrl } from "./storage";
import { TOUR_KNOPF, TOUREN_OEFFENTLICH, istMitarbeiterTour, type Tour, type TourId } from "./touren";
import { TourOverlay } from "./TourOverlay";

/** Verzögerung, bis die Seite steht und die Einladung erscheint */
const EINLADUNG_NACH_MS = 900;
/** Wie lange die Einladung stehen bleibt */
const EINLADUNG_DAUER_MS = 20000;

/**
 * Tour einer Seite: Knopf „Tour starten“ (an der Stelle, an der die Komponente steht),
 * Einladung per Toast beim ersten Besuch und die Hervorhebungen selbst.
 * `?tour=aus` unterdrückt Einladung und Autostart, `?tour=start` startet sofort.
 */
export function PageTour({
  id,
  bereit = true,
  einladen = true,
}: {
  id: TourId;
  /** erst starten, wenn die Seite ihre Daten hat */
  bereit?: boolean;
  /** false: keine Einladung (Toast), die Tour startet nur über den Knopf oder `?tour=start` */
  einladen?: boolean;
}) {
  // Öffentliche Touren stehen im Bundle; Touren des Mitarbeiter-Kurses kommen nur mit Staff-Sitzung vom Server.
  const [geladen, setGeladen] = useState<{ id: TourId; tour: Tour } | null>(null);
  const tour: Tour | null = istMitarbeiterTour(id) ? (geladen?.id === id ? geladen.tour : null) : TOUREN_OEFFENTLICH[id];
  const pathname = usePathname();
  const [aktiv, setAktiv] = useState(false);
  const [lauf, setLauf] = useState(0);
  const startPfad = useRef(pathname);
  const toastId = useRef<string | null>(null);

  useEffect(() => {
    if (!istMitarbeiterTour(id)) return;
    let abgebrochen = false;
    fetch(`/api/staff/hilfe/tour/${id}`, { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<Tour>) : null))
      .then((t) => {
        if (t && !abgebrochen) setGeladen({ id, tour: t });
      })
      .catch(() => {
        // Ohne Tour-Texte bleibt nur der Knopf (ohne Wirkung); die Seite funktioniert unverändert.
      });
    return () => {
      abgebrochen = true;
    };
  }, [id]);

  const starten = useCallback(() => {
    if (!tour) return;
    alsErledigtMerken(id);
    if (toastId.current) toast.close(toastId.current);
    setLauf((n) => n + 1);
    setAktiv(true);
  }, [id, tour]);

  const beenden = useCallback(() => {
    alsErledigtMerken(id);
    setAktiv(false);
  }, [id]);

  useEffect(() => {
    if (!bereit || !tour) return;
    const modus = tourModusAusUrl(window.location.search);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (modus === "start") {
      // Parameter erst beim echten Start entfernen — ein zweiter Effektlauf (StrictMode) liest ihn sonst nicht mehr.
      timer = setTimeout(() => {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("tour");
          window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
        } catch {
          // URL bleibt dann eben stehen
        }
        starten();
      }, 400);
    } else if (einladen && modus !== "aus" && einladungZeigen(id)) {
      timer = setTimeout(() => {
        alsAngebotenMerken(id);
        toastId.current = toast.add({
          id: `tour-${id}`,
          title: "Tour starten?",
          description: tour.einladung,
          type: "info",
          timeout: EINLADUNG_DAUER_MS,
          actionProps: { children: "Tour starten", onClick: starten },
        });
      }, EINLADUNG_NACH_MS);
    }
    return () => {
      if (timer) clearTimeout(timer);
      if (toastId.current) toast.close(toastId.current);
    };
  }, [id, tour, starten, bereit, einladen]);

  useEffect(() => {
    if (pathname !== startPfad.current) {
      startPfad.current = pathname;
      setAktiv(false);
    }
  }, [pathname]);

  return (
    <>
      <Button type="button" variant="outline" onClick={starten} disabled={!tour} data-tour={TOUR_KNOPF} className="gap-1.5">
        <HugeiconsIcon icon={Compass01Icon} size={16} aria-hidden="true" />
        Tour starten
      </Button>
      {aktiv && tour && <TourOverlay key={lauf} schritte={tour.schritte} onEnde={beenden} />}
    </>
  );
}
