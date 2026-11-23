/**
 * Render-Engine im Browser für die Live-Vorschau im Editor (nur Mitarbeiter: sie dürfen die Schriftdateien laden).
 * Gäste und Kunden bekommen NIE Schriftdateien – ihre Vorschau kommt serverseitig als PDF.
 */
import { erzeugePdf, erzeugeVorschau, type Ergebnis, type Ressourcen, type SchriftDatei } from "../render";
import { STANDARD_FARBEN, type Datensatz, type Farbe, type SchriftSchnitt, type Vorlage } from "../schema";
import { ladeBytes, STAFF_API } from "./api";

export interface SchriftEintrag {
  id: string;
  familie: string;
  schnitt: SchriftSchnitt;
  name: string;
  groesse: number;
  scanStatus?: string;
}

const bytesCache = new Map<string, Promise<Uint8Array>>();

function gecacht(url: string): Promise<Uint8Array> {
  let p = bytesCache.get(url);
  if (!p) {
    p = ladeBytes(url);
    p.catch(() => bytesCache.delete(url));
    bytesCache.set(url, p);
  }
  return p;
}

export const designBytes = (dateiId: string) => gecacht(`${STAFF_API}/dateien/${dateiId}`);

/** Ressourcen für die Vorlage laden: Design, Schriften der verwendeten Familien, Bilder, Farben. */
export async function ladeRessourcen(v: Vorlage, schriften: SchriftEintrag[], farben: Farbe[]): Promise<Ressourcen> {
  const design = v.design.dateiId ? await designBytes(v.design.dateiId).catch(() => null) : null;
  const ueberlagerung = v.ausgabe.ueberlagerung ? await designBytes(v.ausgabe.ueberlagerung.dateiId).catch(() => null) : null;
  const familien = new Set(v.felder.flatMap((f) => ("schrift" in f ? [f.schrift.familie] : [])));
  const dateien: SchriftDatei[] = [];
  for (const s of schriften) {
    if (!familien.has(s.familie)) continue;
    try {
      dateien.push({ familie: s.familie, schnitt: s.schnitt, bytes: await gecacht(`${STAFF_API}/schriften/${s.id}/datei`) });
    } catch {
      /* fehlende Schrift meldet die Engine selbst */
    }
  }
  const bilder: Record<string, Uint8Array> = {};
  for (const f of v.felder) {
    if (f.typ === "bild" && f.dateiId && !bilder[f.dateiId]) bilder[f.dateiId] = await designBytes(f.dateiId);
  }
  const alleFarben = [...farben];
  for (const s of STANDARD_FARBEN) if (!alleFarben.some((f) => f.name === s.name)) alleFarben.push(s);
  return { design, ueberlagerung, schriften: dateien, bilder, farben: alleFarben };
}

/** Nur das Design (Hintergrund der Arbeitsfläche): Vorder- und Rückseite als Seiten im Format Endformat + Beschnitt. */
export async function erzeugeHintergrund(v: Vorlage, res: Ressourcen): Promise<Uint8Array | null> {
  if (!res.design) return null;
  const e = await erzeugePdf({ ...v, felder: [] }, res, [{ werte: {}, auflage: 1 }], { modus: "einzeln", trotzFehlern: true });
  return e.pdf;
}

/** Vorschau mit den Beispielwerten (oder einem eigenen Datensatz) – die ECHTE Ausgabe der Engine. */
export function erzeugeBeispiel(v: Vorlage, res: Ressourcen, datensatz?: Datensatz | null): Promise<Ergebnis> {
  return erzeugeVorschau(v, res, datensatz ?? null);
}
