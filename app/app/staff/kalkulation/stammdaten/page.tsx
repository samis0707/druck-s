import { PageHeader } from "@/components/layout/PageHeader";
import { KalkulationNav } from "@/components/kalkulation/KalkulationNav";
import { Stammdaten } from "@/components/kalkulation/Stammdaten";

/** Backoffice: Stammdaten der Kalkulation (Werkbank, Sicherung einspielen und laden). */
export default function KalkulationStammdatenPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        titel="Stammdaten"
        beschreibung="Die Grundlage der Kalkulation: Material, Preise, Maschinen und Artikel."
        brotkrumen={[{ bezeichnung: "Backoffice", href: "/staff" }, { bezeichnung: "Kalkulation", href: "/staff/kalkulation" }, { bezeichnung: "Stammdaten" }]}
      />
      <KalkulationNav aktiv="stammdaten" />
      <Stammdaten />
    </main>
  );
}
