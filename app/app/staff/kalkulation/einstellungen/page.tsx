import { PageHeader } from "@/components/layout/PageHeader";
import { HilfeMenue } from "@/components/hilfe/HilfeMenue";
import { PageTour } from "@/components/tour/PageTour";
import { EinstellungenForm } from "@/components/kalkulation/EinstellungenForm";
import { KundenRichtpreisKarte } from "@/components/kalkulation/KundenRichtpreisKarte";
import { KalkulationNav } from "@/components/kalkulation/KalkulationNav";

/** Backoffice: Einstellungen der Preisschicht (Zuschläge, Mindestpreis, Rundung, Spanne, MwSt). */
export default function KalkulationEinstellungenPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        titel="Preis-Einstellungen"
        beschreibung="Wie aus den Kosten der Kalkulation ein unverbindlicher Richtpreis wird."
        brotkrumen={[{ bezeichnung: "Backoffice", href: "/staff" }, { bezeichnung: "Kalkulation", href: "/staff/kalkulation" }, { bezeichnung: "Preis-Einstellungen" }]}
        aktionen={
          <>
            <HilfeMenue kurs="druckerei" />
            <PageTour id="kalkulation-preise" />
          </>
        }
      />
      <KalkulationNav aktiv="einstellungen" />
      <EinstellungenForm />
      <KundenRichtpreisKarte />
    </main>
  );
}
