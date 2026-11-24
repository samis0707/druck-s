import type { MetadataRoute } from "next";
import { KURSE_OEFFENTLICH, lektionsPfad } from "@/lib/hilfe/inhalte";
import { BILDER } from "@/lib/hilfe/bilder";
import { bildPfad } from "@/lib/hilfe/bilder-pfad";
import { HILFE_STAND, absolut } from "@/lib/hilfe/site";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const hilfe = new Date(HILFE_STAND);
  const seiten: MetadataRoute.Sitemap = [
    { url: absolut("/"), lastModified: hilfe, changeFrequency: "monthly", priority: 1 },
    { url: absolut("/upload"), lastModified: hilfe, changeFrequency: "monthly", priority: 0.9 },
    { url: absolut("/anfrage"), lastModified: hilfe, changeFrequency: "monthly", priority: 0.9 },
    { url: absolut("/hilfe"), lastModified: hilfe, changeFrequency: "monthly", priority: 0.9 },
  ];
  // Nur öffentliche Kurse: Mitarbeiter-Hilfeseiten gehören nicht in die Sitemap.
  for (const kurs of KURSE_OEFFENTLICH) {
    seiten.push({ url: absolut(`/hilfe/${kurs.slug}`), lastModified: hilfe, changeFrequency: "monthly", priority: 0.8 });
    for (const l of kurs.lektionen) {
      seiten.push({
        url: absolut(lektionsPfad(kurs, l)),
        lastModified: hilfe,
        changeFrequency: "monthly",
        priority: 0.7,
        images: (l.bilder ?? []).filter((b) => BILDER[b.name]).map((b) => absolut(bildPfad(b.name))),
      });
    }
  }
  for (const pfad of ["/kontakt", "/impressum", "/datenschutz", "/agb", "/widerruf"]) {
    seiten.push({ url: absolut(pfad), changeFrequency: "yearly", priority: 0.3 });
  }
  return seiten;
}
