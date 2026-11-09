"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Compass01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { alsAngebotenMerken, alsErledigtMerken, einladungZeigen, tourModusAusUrl } from "./storage";
import { TOUR_KNOPF, TOUREN, type TourId } from "./touren";
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
export function PageTour({ id, bereit = true }: { id: TourId; /** erst starten, wenn die Seite ihre Daten hat */ bereit?: boolean }) {
  const tour = TOUREN[id];
  const pathname = usePathname();
  const [aktiv, setAktiv] = useState(false);
  const [lauf, setLauf] = useState(0);
  const startPfad = useRef(pathname);
  const toastId = useRef<string | null>(null);

  const starten = useCallback(() => {
    alsErledigtMerken(id);
    if (toastId.current) toast.close(toastId.current);
    setLauf((n) => n + 1);
    setAktiv(true);
  }, [id]);

  const beenden = useCallback(() => {
    alsErledigtMerken(id);
    setAktiv(false);
  }, [id]);

  useEffect(() => {
    if (!bereit) return;
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
    } else if (modus !== "aus" && einladungZeigen(id)) {
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
  }, [id, tour.einladung, starten, bereit]);

  useEffect(() => {
    if (pathname !== startPfad.current) {
      startPfad.current = pathname;
      setAktiv(false);
    }
  }, [pathname]);

  return (
    <>
      <Button type="button" variant="outline" onClick={starten} data-tour={TOUR_KNOPF} className="gap-1.5">
        <HugeiconsIcon icon={Compass01Icon} size={16} aria-hidden="true" />
        Tour starten
      </Button>
      {aktiv && <TourOverlay key={lauf} schritte={tour.schritte} onEnde={beenden} />}
    </>
  );
}
