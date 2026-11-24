import type { Metadata } from "next";
import { LektionAnsicht, lektionMetadaten } from "@/components/hilfe/LektionAnsicht";
import { KURSE_OEFFENTLICH } from "@/lib/hilfe/inhalte";

/** Lektionen der öffentlichen Kurse, vorab statisch erzeugt (Mitarbeiter-Kurs: app/hilfe/druckerei/[lektion], siehe ../page.tsx). */
export const dynamicParams = false;

export function generateStaticParams() {
  return KURSE_OEFFENTLICH.flatMap((k) => k.lektionen.map((l) => ({ kurs: k.slug, lektion: l.slug })));
}

export async function generateMetadata({ params }: PageProps<"/hilfe/[kurs]/[lektion]">): Promise<Metadata> {
  const { kurs, lektion } = await params;
  return lektionMetadaten(kurs, lektion);
}

export default async function LektionSeite({ params }: PageProps<"/hilfe/[kurs]/[lektion]">) {
  const { kurs, lektion } = await params;
  return <LektionAnsicht kurs={kurs} lektion={lektion} />;
}
