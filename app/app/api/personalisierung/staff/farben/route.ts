import { istObjekt, alsStaff, leseJson, persJson } from "@/lib/personalisierung/http";
import { listeFarben, speichereFarbe } from "@/lib/personalisierung/repo";

export async function GET(req: Request) {
  return alsStaff(req, "Farben listen", async () => persJson({ farben: await listeFarben() }));
}

/** Farbe anlegen: { name, cmyk: [c,m,y,k] (0–100), sonderfarbe? }. */
export async function POST(req: Request) {
  return alsStaff(req, "Farbe anlegen", async () => {
    const body = await leseJson(req, 16 * 1024);
    return persJson(await speichereFarbe(istObjekt(body) ? body : {}), 201);
  });
}
