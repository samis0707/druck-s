"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { HelpCircleIcon } from "@hugeicons/core-free-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KURSE_OEFFENTLICH, kursDownloads, type KursSlug } from "@/lib/hilfe/inhalte";

/**
 * Dropdown „Hilfe“ im Arbeitsbereich: Online-Schulung, Kurzanleitung (echter Download), alle Unterlagen.
 *
 * Läuft im Browser und kennt deshalb nur die öffentlichen Kurse (inhalte.ts). Der Mitarbeiter-Kurs steht nicht im
 * Client-Bundle: Das Menü führt direkt zu ihm (/hilfe/druckerei, Zugriff nur mit Staff-Sitzung); seine Kurzanleitungen
 * stehen dort im Abschnitt „Unterlagen“, nicht in diesem Menü.
 */
export function HilfeMenue({ kurs }: { kurs: KursSlug }) {
  const k = KURSE_OEFFENTLICH.find((x) => x.slug === kurs);
  const mitarbeiter = !k;
  const eintrag = "flex min-h-10 items-center rounded-xl px-3 py-2 hover:bg-muted focus-visible:bg-muted outline-none";
  return (
    <Popover>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")} data-tour="hilfe-menue">
        <HugeiconsIcon icon={HelpCircleIcon} size={16} aria-hidden="true" />
        Hilfe
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-1.5">
        <nav aria-label="Hilfe" className="flex flex-col text-sm">
          <Link href={`/hilfe/${kurs}`} className={eintrag}>
            Online-Schulung
          </Link>
          {mitarbeiter && (
            <Link href={`/hilfe/${kurs}#unterlagen`} className={eintrag}>
              Kurzanleitungen (PDF)
            </Link>
          )}
          {k &&
            kursDownloads(k).map((d, i) => (
              <a key={d.href} href={d.href} download={d.datei} className={eintrag}>
                {i === 0 ? "Kurzanleitung herunterladen (PDF)" : `${d.titel} (PDF)`}
              </a>
            ))}
          <Link href="/hilfe#unterlagen" className={eintrag}>
            Alle Unterlagen
          </Link>
          <Link href="/hilfe#fragen" className={eintrag}>
            Häufige Fragen
          </Link>
        </nav>
      </PopoverContent>
    </Popover>
  );
}
