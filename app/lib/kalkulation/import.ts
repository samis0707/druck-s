/** Stammdaten-Import einer werkbank-sicherung: Vorschau (ohne zu schreiben) und Übernahme. */
import { createHash } from "node:crypto";
import { appendAudit } from "../auditLog";
import { alleBereiche, importieren, pruefeSicherung } from "./store";

export type BereichVorschau = {
  schluessel: string;
  name: string;
  /** neu = bisher leer, gleich = unverändert, geaendert = ersetzt den heutigen Stand. */
  status: "neu" | "gleich" | "geaendert";
  /** Anzahl der Einträge je Liste (z. B. materialien: 42) – heute und in der Sicherung. */
  heute: Record<string, number>;
  neu: Record<string, number>;
};

export type ImportVorschau =
  | { ok: true; datum: string | null; pruefsumme: string; bereiche: BereichVorschau[] }
  | { ok: false; meldungen: string[] };

/** Anzahl der Einträge der obersten Listen eines Bereichs. */
export function zaehlungen(json: string): Record<string, number> {
  try {
    const o = JSON.parse(json) as unknown;
    if (typeof o !== "object" || o === null || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]));
  } catch {
    return {};
  }
}

export const LISTEN_NAMEN: Record<string, string> = {
  materialien: "Materialien",
  lieferanten: "Lieferanten",
  stanzformen: "Stanzformen",
  arbeitsschritte: "Arbeitsschritte",
  arbeitsplaetze: "Arbeitsplätze",
  kostenstellen: "Kostenstellen",
  partner: "Partner",
  artikel: "Artikel",
  kalkulationen: "Kalkulationen",
  bestaende: "Bestände",
  preise: "Preise",
  aufschlagArten: "Aufschlag-Arten",
};

/** Prüft die Sicherung vollständig und vergleicht sie mit dem heutigen Stand. Schreibt nichts. */
export async function vorschauImport(sicherung: unknown): Promise<ImportVorschau> {
  const p = pruefeSicherung(sicherung);
  if (!p.ok) return p;
  const heute = new Map((await alleBereiche()).map((b) => [b.schluessel, b.json]));
  return {
    ok: true,
    datum: p.datum,
    pruefsumme: pruefsumme(p.bereiche),
    bereiche: p.bereiche.map((b) => {
      const alt = heute.get(b.schluessel);
      return {
        schluessel: b.schluessel,
        name: b.name,
        status: alt === undefined ? "neu" : alt === b.json ? "gleich" : "geaendert",
        heute: alt === undefined ? {} : zaehlungen(alt),
        neu: zaehlungen(b.json),
      };
    }),
  };
}

function pruefsumme(bereiche: readonly { schluessel: string; json: string }[]): string {
  const h = createHash("sha256");
  for (const b of bereiche) h.update(b.schluessel).update("\0").update(b.json).update("\0");
  return h.digest("hex");
}

/**
 * Übernimmt die Sicherung (jeder Bereich wird als neue Version angehängt, frühere Stände bleiben
 * im Verlauf) und schreibt einen Audit-Eintrag. `pruefsumme` aus der Vorschau stellt sicher, dass
 * genau das bestätigt wurde, was auch importiert wird.
 */
export async function uebernehmeImport(
  sicherung: unknown,
  opts: { pruefsumme?: string; von: string; akteur: { typ: "staff" | "system"; id: string | null }; ip?: string | null; quelle: "oberflaeche" | "skript" },
): Promise<{ ok: true; bereiche: string[] } | { ok: false; meldungen: string[] }> {
  const p = pruefeSicherung(sicherung);
  if (!p.ok) return p;
  if (opts.pruefsumme !== undefined && opts.pruefsumme !== pruefsumme(p.bereiche))
    return { ok: false, meldungen: ["Die Sicherung hat sich seit der Vorschau geändert – bitte erneut prüfen."] };
  const r = await importieren(sicherung, opts.von, true);
  if (r.ok) {
    await appendAudit({
      action: "kalkulation_stammdaten_import",
      actorType: opts.akteur.typ,
      actorId: opts.akteur.id,
      ip: opts.ip ?? null,
      detail: { bereiche: r.bereiche, datum: p.datum, quelle: opts.quelle },
    });
  }
  return r;
}
