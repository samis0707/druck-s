import { config } from "@/lib/config";
import { alsStaff, leseUpload, persJson } from "@/lib/personalisierung/http";
import { listeSchriften, speichereSchrift } from "@/lib/personalisierung/repo";
import { SCHRIFT_SCHNITTE, type SchriftSchnitt } from "@/lib/personalisierung/schema";
import { PersFehler } from "@/lib/personalisierung/dateien";

export async function GET(req: Request) {
  return alsStaff(req, "Schriften listen", async () => persJson({ schriften: await listeSchriften() }));
}

/** Schrift hochladen (multipart): `datei` (TTF/OTF), optional `familie` und `schnitt` (sonst aus der Datei gelesen). */
export async function POST(req: Request) {
  return alsStaff(req, "Schrift hochladen", async (user) => {
    const { bytes, name, form } = await leseUpload(req, "datei", config.personalisierung.maxFontBytes);
    const familie = form.get("familie");
    const schnitt = form.get("schnitt");
    if (typeof schnitt === "string" && schnitt && !SCHRIFT_SCHNITTE.includes(schnitt as SchriftSchnitt)) throw new PersFehler("Ungültiger Schnitt.");
    const s = await speichereSchrift(bytes, { dateiname: name, familie: typeof familie === "string" && familie.trim() ? familie : undefined, schnitt: typeof schnitt === "string" && schnitt ? (schnitt as SchriftSchnitt) : undefined, userId: user.id });
    return persJson(s, 201);
  });
}
