"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { erledigtSetzen, useErledigte } from "./fortschritt";

/** „Zurück“ · „Verstanden ✓“ · „Weiter“ am Ende einer Lektion. */
export function LektionAbschluss({
  kurs,
  lektion,
  zurueck,
  weiter,
}: {
  kurs: string;
  lektion: string;
  zurueck?: { href: string; titel: string };
  weiter?: { href: string; titel: string };
}) {
  const router = useRouter();
  const erledigt = useErledigte(kurs).includes(lektion);

  function verstanden() {
    erledigtSetzen(kurs, lektion, true);
    if (weiter) router.push(weiter.href);
  }

  return (
    <nav aria-label="Lektionen blättern" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
      {zurueck ? (
        <Link href={zurueck.href} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-11")} rel="prev">
          ← Zurück
        </Link>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap gap-2">
        {erledigt ? (
          <Button variant="ghost" size="lg" className="min-h-11" onClick={() => erledigtSetzen(kurs, lektion, false)}>
            Erledigt ✓ <span className="sr-only">(zurücksetzen)</span>
          </Button>
        ) : (
          <Button size="lg" className="min-h-11" onClick={verstanden}>
            Verstanden ✓
          </Button>
        )}
        {weiter && (
          <Link href={weiter.href} className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "min-h-11")} rel="next">
            Weiter →
          </Link>
        )}
      </div>
    </nav>
  );
}
