/**
 * Maschinen-Schnittstelle /api/v1/kalkulation/…: `Authorization: Bearer kal_…` mit Scope
 * „kalkulation“. Liefert **Kosten** (ohne Gewinn) wie die kalpri-Schnittstelle: artikel,
 * kalkulieren, kalkulationen, taetigkeiten, status. Kein Schreibzugriff auf Stammdaten.
 */
import { requireKalkulationKey } from "../guards";
import { RUMPF_MAX, kalkJson, leseJson } from "./http";
import { kalpriAnfrage } from "./staffApi";
import { heuteIso } from "./zeit";

/** `pfad` ist der kalpri-Pfad, z. B. „/v1/artikel/A-0001/kalkulieren“. */
export async function kalkulationMitKey(req: Request, pfad: string): Promise<Response> {
  const g = await requireKalkulationKey(req);
  if (!("key" in g) || !g.key) return g.error ?? kalkJson({ error: "Authentication required" }, 401);
  const methode = req.method.toUpperCase();
  let rumpf: unknown;
  if (methode === "POST") {
    const j = await leseJson(req, RUMPF_MAX);
    if (!j.ok) return kalkJson({ fehler: j.meldung }, j.status);
    rumpf = j.wert;
  }
  return kalpriAnfrage({ methode, pfad, rumpf }, heuteIso());
}
