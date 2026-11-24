import type { Metadata } from "next";
import { KursAnsicht, kursMetadaten } from "@/components/hilfe/KursAnsicht";
import { MITARBEITER_KURS } from "@/lib/hilfe/zugriff";

/**
 * Mitarbeiter-Kurs: nie statisch vorab erzeugt, sondern je Anfrage mit Staff-Prüfung gerendert.
 * Ohne Staff-Sitzung → Weiterleitung zu /staff/login?weiter=/hilfe/druckerei (kein Inhalt in HTML oder RSC-Payload).
 * Der Ordnername muss dem Kurs-Slug entsprechen (tests/hilfe-zugriff.test.ts prüft das).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return kursMetadaten(MITARBEITER_KURS);
}

export default function MitarbeiterKursSeite() {
  return <KursAnsicht slug={MITARBEITER_KURS} />;
}
