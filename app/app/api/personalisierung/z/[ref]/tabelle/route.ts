import { config } from "@/lib/config";
import { begrenzeJeIp, zaehle } from "@/lib/personalisierung/dienst";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { leseUpload, persFailure, persJson } from "@/lib/personalisierung/http";
import { leseTabelle, ordneSpalten, TabellenFehler, tabelleZuDatensaetzen, type Spaltenzuordnung } from "@/lib/personalisierung/tabelle";
import { loeseZugang } from "@/lib/personalisierung/zugang";

/**
 * Tabelle (CSV/XLSX) einlesen. multipart: `datei`, optional `zuordnung` (JSON { schluessel: Spaltenindex|null, auflage }).
 * Ohne Zuordnung wird automatisch zugeordnet; die Antwort enthält die Zuordnung zur Bestätigung. Nichts wird gespeichert.
 */
export async function POST(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  try {
    const z = await loeseZugang(req, (await ctx.params).ref);
    if (z instanceof Response) return z;
    await begrenzeJeIp("pers_table", z.ip, config.personalisierung.tablesPerIpPerHour);
    const { bytes, form } = await leseUpload(req, "datei", config.personalisierung.maxTableBytes);
    await zaehle("pers_table", z.ip, z.akteur, { templateId: z.detail.id });
    let tabelle;
    try {
      tabelle = leseTabelle(bytes);
    } catch (e) {
      if (e instanceof TabellenFehler) throw new PersFehler(e.message, 400, "tabelle");
      throw e;
    }
    if (tabelle.zeilen.length > config.personalisierung.maxDatensaetze) {
      throw new PersFehler(`Die Tabelle hat ${tabelle.zeilen.length} Datenzeilen; erlaubt sind höchstens ${config.personalisierung.maxDatensaetze}.`, 413, "zu_viele");
    }
    let zuordnung: Spaltenzuordnung = ordneSpalten(tabelle.kopf, z.detail.vorlage.variablen);
    const manuell = form.get("zuordnung");
    if (typeof manuell === "string" && manuell.trim()) {
      let m: { variablen?: Record<string, unknown>; auflage?: unknown };
      try {
        m = JSON.parse(manuell);
      } catch {
        throw new PersFehler("Die Zuordnung ist kein gültiges JSON.");
      }
      const gueltig = (v: unknown): v is number | null => v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) < tabelle.kopf.length);
      const variablen: Record<string, number | null> = {};
      for (const v of z.detail.vorlage.variablen) {
        const w = m.variablen?.[v.schluessel] ?? null;
        if (!gueltig(w)) throw new PersFehler(`Ungültige Spalte für „${v.bezeichnung}“.`);
        variablen[v.schluessel] = w;
      }
      const auflage = m.auflage ?? null;
      if (!gueltig(auflage)) throw new PersFehler("Ungültige Spalte für die Auflage.");
      zuordnung = {
        variablen,
        auflage,
        unbenutzt: tabelle.kopf.map((_k, i) => i).filter((i) => !Object.values(variablen).includes(i) && i !== auflage),
        fehlend: z.detail.vorlage.variablen.filter((v) => variablen[v.schluessel] === null).map((v) => ({ schluessel: v.schluessel, bezeichnung: v.bezeichnung, pflicht: v.pflicht })),
      };
    }
    const { datensaetze, warnungen } = tabelleZuDatensaetzen(tabelle, zuordnung);
    return persJson({
      format: tabelle.format,
      kopf: tabelle.kopf,
      zeilen: tabelle.zeilen.length,
      zuordnung,
      datensaetze,
      warnungen,
    });
  } catch (e) {
    return persFailure(e, "Tabelle einlesen");
  }
}
