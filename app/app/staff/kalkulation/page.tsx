import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { HilfeMenue } from "@/components/hilfe/HilfeMenue";
import { PageTour } from "@/components/tour/PageTour";
import { KalkulationNav } from "@/components/kalkulation/KalkulationNav";
import { Rechner } from "@/components/kalkulation/Rechner";
import { Skeleton } from "@/components/ui/skeleton";

/** Backoffice: Ad-hoc-Kalkulation mit unverbindlichem Richtpreis. */
export default function KalkulationPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        titel="Kalkulation"
        beschreibung="Artikel wählen, Fragen beantworten, Auflagen eintragen – und sofort einen unverbindlichen Richtpreis sehen."
        brotkrumen={[{ bezeichnung: "Backoffice", href: "/staff" }, { bezeichnung: "Kalkulation" }]}
        aktionen={
          <>
            <HilfeMenue kurs="druckerei" />
            <PageTour id="kalkulation" />
          </>
        }
      />
      <KalkulationNav aktiv="kalkulation" />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <Rechner />
      </Suspense>
    </main>
  );
}
