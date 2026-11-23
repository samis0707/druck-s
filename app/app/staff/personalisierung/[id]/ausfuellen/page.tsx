import { Ablauf } from "@/components/personalisierung/kunde/Ablauf";

/** Für Kunden ausfüllen: derselbe Kundenablauf, der Auftrag entsteht im Namen des gewählten Kunden. */
export default async function AusfuellenPage({ params }: PageProps<"/staff/personalisierung/[id]/ausfuellen">) {
  const { id } = await params;
  return <Ablauf refKennung={id} />;
}
