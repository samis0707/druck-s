"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useErledigte } from "./fortschritt";

export interface LektionKurz {
  slug: string;
  titel: string;
  kurz: string;
  minuten: number;
  href: string;
}

/** Fortschrittsbalken „x von n erledigt“. */
export function FortschrittsBalken({ kurs, gesamt }: { kurs: string; gesamt: number }) {
  const erledigt = useErledigte(kurs).length;
  const anteil = gesamt === 0 ? 0 : Math.min(1, erledigt / gesamt);
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {Math.min(erledigt, gesamt)} von {gesamt} erledigt
        </span>
        <span className="tabular-nums">{Math.round(anteil * 100)} %</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Lernfortschritt"
        aria-valuemin={0}
        aria-valuemax={gesamt}
        aria-valuenow={Math.min(erledigt, gesamt)}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${anteil * 100}%` }} />
      </div>
    </div>
  );
}

/** Lektionsliste eines Kurses mit Häkchen für erledigte Lektionen (wird auch serverseitig gerendert). */
export function LektionsListe({ kurs, lektionen, aktiv }: { kurs: string; lektionen: LektionKurz[]; aktiv?: string }) {
  const erledigt = useErledigte(kurs);
  return (
    <ol className="space-y-1.5">
      {lektionen.map((l, i) => {
        const fertig = erledigt.includes(l.slug);
        const ist = l.slug === aktiv;
        return (
          <li key={l.slug}>
            <Link
              href={l.href}
              aria-current={ist ? "page" : undefined}
              className={`flex min-h-11 items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted ${ist ? "bg-muted font-semibold" : ""}`}
            >
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums ${
                  fertig ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
                }`}
                aria-hidden="true"
              >
                {fertig ? <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block leading-snug">{l.titel}</span>
                {!aktiv && <span className="mt-0.5 block text-sm font-normal text-muted-foreground">{l.kurz}</span>}
                <span className="sr-only">{fertig ? " (erledigt)" : ""}</span>
              </span>
              <span className="ml-auto shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">{l.minuten} Min.</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
