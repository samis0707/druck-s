import Image from "next/image";
import { BILDER } from "@/lib/hilfe/bilder";
import { bildPfad, istInternesBild } from "@/lib/hilfe/bilder-pfad";
import type { LektionsBild } from "@/lib/hilfe/inhalte";

/** Bildschirmfoto einer Lektion; Klick öffnet das Bild in voller Größe. Fehlt das Bild, wird nichts gerendert. */
export function HilfeBild({ bild, gross, prioritaet }: { bild: LektionsBild; gross?: boolean; prioritaet?: boolean }) {
  const masse = BILDER[bild.name];
  if (!masse) return null;
  const src = bildPfad(bild.name);
  // Interne Bilder liegen hinter der Staff-Prüfung; der Bild-Optimierer ruft ohne Sitzung ab und würde sie nicht erhalten.
  const unoptimiert = istInternesBild(bild.name);
  return (
    <figure className="space-y-2">
      <a href={src} target="_blank" rel="noopener" className="block overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-e1)">
        <Image
          src={src}
          alt={bild.alt}
          width={masse.breite}
          height={masse.hoehe}
          sizes={gross ? "(min-width: 1024px) 760px, 100vw" : "(min-width: 1024px) 380px, 100vw"}
          priority={prioritaet}
          unoptimized={unoptimiert}
          className="h-auto w-full"
        />
      </a>
      <figcaption className="text-sm text-muted-foreground">{bild.alt}</figcaption>
    </figure>
  );
}
