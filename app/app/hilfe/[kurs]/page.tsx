import type { Metadata } from "next";
import { KursAnsicht, kursMetadaten } from "@/components/hilfe/KursAnsicht";
import { KURSE_OEFFENTLICH } from "@/lib/hilfe/inhalte";

/**
 * Öffentliche Kurse (Kunden, Partner), vorab statisch erzeugt. Alles andere ergibt 404.
 * Der Mitarbeiter-Kurs hat eine eigene, dynamische Route (app/hilfe/druckerei) — statische Segmente haben Vorrang vor
 * diesem dynamischen. Hier wird er nie gebaut: Mit generateStaticParams würden unbekannte Werte nachträglich statisch
 * (ISR) erzeugt, und dann ließe sich die Sitzung nicht prüfen. Die Zugriffsprüfung steckt trotzdem in KursAnsicht.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return KURSE_OEFFENTLICH.map((k) => ({ kurs: k.slug }));
}

export async function generateMetadata({ params }: PageProps<"/hilfe/[kurs]">): Promise<Metadata> {
  return kursMetadaten((await params).kurs);
}

export default async function KursSeite({ params }: PageProps<"/hilfe/[kurs]">) {
  return <KursAnsicht slug={(await params).kurs} />;
}
