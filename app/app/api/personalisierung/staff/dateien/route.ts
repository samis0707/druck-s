import { config } from "@/lib/config";
import { alsStaff, leseUpload, persJson } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { speichereDatei, type DateiArt } from "@/lib/personalisierung/repo";

/**
 * Design-PDF, Überlagerungs-PDF oder Bild hochladen (multipart): `datei`, `art` = design | ueberlagerung | bild.
 * Antwort: { datei, pdf? } – `pdf.seitenMasse` hilft, „mit Beschnitt“ vorzuschlagen.
 */
export async function POST(req: Request) {
  return alsStaff(req, "Datei hochladen", async (user) => {
    const max = Math.max(config.personalisierung.maxDesignBytes, config.personalisierung.maxImageBytes);
    const { bytes, name, form } = await leseUpload(req, "datei", max);
    const art = form.get("art");
    if (art !== "design" && art !== "ueberlagerung" && art !== "bild") throw new PersFehler("art muss design, ueberlagerung oder bild sein.");
    return persJson(await speichereDatei(art as DateiArt, name, bytes, user.id), 201);
  });
}
