import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download04Icon } from "@hugeicons/core-free-icons";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { JsonLd } from "@/components/hilfe/JsonLd";
import { HilfeBild } from "@/components/hilfe/HilfeBild";
import { FortschrittsBalken, LektionsListe } from "@/components/hilfe/KursFortschritt";
import { LektionAbschluss } from "@/components/hilfe/LektionAbschluss";
import { Quiz } from "@/components/hilfe/Quiz";
import { cn } from "@/lib/utils";
import { KURSE, lektionFuer, lektionsPfad } from "@/lib/hilfe/inhalte";
import { brotkrumen, graph, lektionDaten } from "@/lib/hilfe/jsonld";

export const dynamicParams = false;

export function generateStaticParams() {
  return KURSE.flatMap((k) => k.lektionen.map((l) => ({ kurs: k.slug, lektion: l.slug })));
}

export async function generateMetadata({ params }: PageProps<"/hilfe/[kurs]/[lektion]">): Promise<Metadata> {
  const { kurs: k, lektion: l } = await params;
  const treffer = lektionFuer(k, l);
  if (!treffer) return {};
  const { kurs, lektion } = treffer;
  const pfad = lektionsPfad(kurs, lektion);
  const bild = lektion.bilder?.[0];
  return {
    title: `${lektion.titel} — ${kurs.zielgruppe}`,
    description: lektion.kurz,
    alternates: { canonical: pfad, types: { "text/markdown": `${pfad}.md` } },
    openGraph: {
      title: `${lektion.titel} · dmp druckraum`,
      description: lektion.kurz,
      url: pfad,
      type: "article",
      locale: "de_DE",
      images: bild ? [{ url: `/hilfe/img/${bild.name}.webp`, alt: bild.alt }] : undefined,
    },
  };
}

function Absatz({ text }: { text: string }) {
  return <p className="leading-relaxed">{text}</p>;
}

export default async function LektionSeite({ params }: PageProps<"/hilfe/[kurs]/[lektion]">) {
  const { kurs: k, lektion: l } = await params;
  const treffer = lektionFuer(k, l);
  if (!treffer) notFound();
  const { kurs, lektion, index } = treffer;
  const vorher = kurs.lektionen[index - 1];
  const nachher = kurs.lektionen[index + 1];
  const [erstesBild, ...weitereBilder] = lektion.bilder ?? [];

  return (
    <main className="hilfe mx-auto grid max-w-6xl gap-10 px-4 py-8 md:px-6 md:py-12 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <JsonLd
        daten={graph(
          lektionDaten(kurs, lektion),
          brotkrumen([
            { name: "Hilfe", pfad: "/hilfe" },
            { name: kurs.titel, pfad: `/hilfe/${kurs.slug}` },
            { name: lektion.titel, pfad: lektionsPfad(kurs, lektion) },
          ]),
        )}
      />
      <article className="min-w-0 space-y-8 text-[1.0625rem] md:text-lg">
        <div className="space-y-3">
          <PageHeader
            titel={lektion.titel}
            brotkrumen={[
              { bezeichnung: "Hilfe", href: "/hilfe" },
              { bezeichnung: kurs.zielgruppe, href: `/hilfe/${kurs.slug}` },
              { bezeichnung: `Lektion ${index + 1}` },
            ]}
          />
          <p className="text-sm text-muted-foreground">
            Lektion {index + 1} von {kurs.lektionen.length} · ca. {lektion.minuten} Min.
          </p>
          <p className="text-lg leading-relaxed text-(--color-ink-mid) md:text-xl">{lektion.einleitung}</p>
        </div>

        {erstesBild && <HilfeBild bild={erstesBild} gross prioritaet />}

        <section aria-labelledby="schritte" className="space-y-4">
          <h2 id="schritte" className="text-xl font-semibold md:text-2xl">
            Schritt für Schritt
          </h2>
          <ol className="space-y-3">
            {lektion.schritte.map((s, i) => (
              <li key={i} id={`schritt-${i + 1}`} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--color-brand-600) text-sm font-semibold text-white tabular-nums"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
        </section>

        {lektion.details?.map((d) => (
          <section key={d.titel} className="space-y-3">
            <h2 className="text-xl font-semibold md:text-2xl">{d.titel}</h2>
            <ul className="list-disc space-y-1.5 pl-6 leading-relaxed">
              {d.punkte.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ))}

        {weitereBilder.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2">
            {weitereBilder.map((b) => (
              <HilfeBild key={b.name} bild={b} />
            ))}
          </div>
        )}

        {lektion.code?.map((c) => (
          <section key={c.titel} className="space-y-2">
            <h2 className="text-lg font-semibold">{c.titel}</h2>
            <pre className="overflow-x-auto rounded-2xl border border-border bg-muted/60 p-4 text-sm leading-relaxed">
              <code className={`language-${c.sprache}`}>{c.inhalt}</code>
            </pre>
          </section>
        ))}

        {lektion.gutZuWissen && (
          <aside aria-label="Gut zu wissen" className="rounded-3xl border border-(--color-warn-line) bg-(--color-warn-soft) p-5 text-(--color-ink) dark:bg-transparent dark:text-foreground">
            <p className="font-semibold">Gut zu wissen</p>
            <Absatz text={lektion.gutZuWissen} />
          </aside>
        )}

        {lektion.quiz && <Quiz quiz={lektion.quiz} />}

        {lektion.ausprobieren && (
          <p>
            <Link href={lektion.ausprobieren.href} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-11")}>
              In der App ausprobieren: {lektion.ausprobieren.label}
            </Link>
          </p>
        )}

        <LektionAbschluss
          kurs={kurs.slug}
          lektion={lektion.slug}
          zurueck={vorher && { href: lektionsPfad(kurs, vorher), titel: vorher.titel }}
          weiter={nachher && { href: lektionsPfad(kurs, nachher), titel: nachher.titel }}
        />
      </article>

      <aside aria-label="Kursinhalt" className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <p className="font-semibold">
          <Link href={`/hilfe/${kurs.slug}`} className="hover:underline">
            {kurs.titel}
          </Link>
        </p>
        <FortschrittsBalken kurs={kurs.slug} gesamt={kurs.lektionen.length} />
        <div className="hidden lg:block">
          <LektionsListe
            kurs={kurs.slug}
            aktiv={lektion.slug}
            lektionen={kurs.lektionen.map((x) => ({ slug: x.slug, titel: x.titel, kurz: x.kurz, minuten: x.minuten, href: lektionsPfad(kurs, x) }))}
          />
        </div>
        {kurs.download && (
          <a href={kurs.download.href} download={kurs.download.datei} className={cn(buttonVariants({ variant: "outline" }), "min-h-11 w-full gap-1.5")}>
            <HugeiconsIcon icon={Download04Icon} size={16} aria-hidden="true" />
            Kurzanleitung (PDF)
          </a>
        )}
      </aside>
    </main>
  );
}
