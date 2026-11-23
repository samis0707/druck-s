import { Ablauf } from "@/components/personalisierung/kunde/Ablauf";

/** Kundenablauf per Link (Token, ohne Konto) oder per Vorlagen-ID (angemeldet): Daten eingeben, prüfen, absenden. */
export default async function PersonalisierenPage({ params }: PageProps<"/personalisieren/[ref]">) {
  const { ref } = await params;
  return <Ablauf refKennung={ref} />;
}
