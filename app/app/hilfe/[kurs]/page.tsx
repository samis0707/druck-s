import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download04Icon } from "@hugeicons/core-free-icons";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { JsonLd } from "@/components/hilfe/JsonLd";
import { FortschrittsBalken, LektionsListe } from "@/components/hilfe/KursFortschritt";
import { cn } from "@/lib/utils";
import { KURSE, kursFuer, kursMinuten, lektionsPfad } from "@/lib/hilfe/inhalte";
import { brotkrumen, graph, kursDaten, organisation } from "@/lib/hilfe/jsonld";

export const dynamicParams = false;

export function generateStaticParams() {
  return KURSE.map((k) => ({ kurs: k.slug }));
}

export async function generateMetadata({ params }: PageProps<"/hilfe/[kurs]">): Promise<Metadata> {
  const kurs = kursFuer((await params).kurs);
  if (!kurs) return {};
  return {
    title: `${kurs.titel} — Online-Schulung`,
    description: kurs.kurz,
    alternates: { canonical: `/hilfe/${kurs.slug}`, types: { "text/markdown": `/hilfe/${kurs.slug}.md` } },
    openGraph: { title: `${kurs.titel} · dmp druckraum`, description: kurs.kurz, url: `/hilfe/${kurs.slug}`, type: "website", locale: "de_DE" },
  };
}

export default async function KursSeite({ params }: PageProps<"/hilfe/[kurs]">) {
  const kurs = kursFuer((await params).kurs);
  if (!kurs) notFound();
  const erste = kurs.lektionen[0];

  return (
    <main className="hilfe mx-auto max-w-4xl space-y-8 px-4 py-8 md:px-6 md:py-12">
      <JsonLd
        daten={graph(
          organisation(),
          kursDaten(kurs),
          brotkrumen([
            { name: "Start", pfad: "/" },
            { name: "Hilfe", pfad: "/hilfe" },
            { name: kurs.titel, pfad: `/hilfe/${kurs.slug}` },
          ]),
        )}
      />
      <PageHeader
        titel={kurs.titel}
        beschreibung={kurs.beschreibung}
        brotkrumen={[{ bezeichnung: "Hilfe", href: "/hilfe" }, { bezeichnung: kurs.zielgruppe }]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Link href={lektionsPfad(kurs, erste)} className={cn(buttonVariants({ size: "lg" }), "min-h-11")}>
          Mit Lektion 1 beginnen
        </Link>
        {kurs.download && (
          <a href={kurs.download.href} download={kurs.download.datei} className={cn(buttonVariants({ size: "lg", variant: "outline" }), "min-h-11 gap-1.5")}>
            <HugeiconsIcon icon={Download04Icon} size={16} aria-hidden="true" />
            {kurs.download.titel} (PDF)
          </a>
        )}
        {kurs.tour && (
          <Link href={`${kurs.tour.href}?tour=start`} className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "min-h-11")}>
            {kurs.tour.label}
          </Link>
        )}
      </div>
      <p className="text-muted-foreground">
        {kurs.zielgruppe} · {kurs.lektionen.length} Lektionen · ca. {kursMinuten(kurs)} Minuten · kostenlos, ohne Anmeldung
      </p>
      <FortschrittsBalken kurs={kurs.slug} gesamt={kurs.lektionen.length} />
      <section aria-labelledby="lektionen">
        <h2 id="lektionen" className="mb-3 text-xl font-semibold">
          Lektionen
        </h2>
        <LektionsListe
          kurs={kurs.slug}
          lektionen={kurs.lektionen.map((l) => ({ slug: l.slug, titel: l.titel, kurz: l.kurz, minuten: l.minuten, href: lektionsPfad(kurs, l) }))}
        />
      </section>
    </main>
  );
}
