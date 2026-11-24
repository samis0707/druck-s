import type { Metadata } from "next";
import { LektionAnsicht, lektionMetadaten } from "@/components/hilfe/LektionAnsicht";
import { MITARBEITER_KURS } from "@/lib/hilfe/zugriff";

/** Lektionen des Mitarbeiter-Kurses: dynamisch mit Staff-Prüfung (siehe ../page.tsx). */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/hilfe/druckerei/[lektion]">): Promise<Metadata> {
  return lektionMetadaten(MITARBEITER_KURS, (await params).lektion);
}

export default async function MitarbeiterLektionSeite({ params }: PageProps<"/hilfe/druckerei/[lektion]">) {
  return <LektionAnsicht kurs={MITARBEITER_KURS} lektion={(await params).lektion} />;
}
