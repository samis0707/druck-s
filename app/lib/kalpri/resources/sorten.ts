/**
 * T169: Hauspapiere und Lieferantensorten.
 *
 * - **Hauspapier**: der eigene Papiername = `sorte` der Materialien (z. B. „Bilderdruck halbmatt“).
 *   Kalkulation und Artikel arbeiten nur damit – keine Lieferantennamen.
 * - **Lieferantensorte**: was ein Lieferant dafür verkauft (z. B. „GardaMatt Art“ bei Berberich),
 *   mit Preis je 100 kg und „gültig ab“. Gilt für alle Materialien des Hauspapiers (Bogen und
 *   Rolle mit Grammatur), wahlweise nur für einen Grammaturbereich.
 * - **Preisanpassung**: je Sorte ein neuer Preis, oder alle Sorten eines Lieferanten bzw. einer
 *   Einkaufsgruppe um x % – immer angehängt, nie überschrieben.
 */
import type { Lager } from './lager-schema';
import type { Material } from './material';
import type { Preis } from './preis-schema';
import type { LieferantenSorte, SortenPreis } from './sorten-schema';
import { pruefeLager } from './lager-schema';
import type { PruefErgebnis } from './pruefung';

const schluessel = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

function naechsteId(ids: readonly string[], praefix: string): string {
  let max = 0;
  for (const id of ids) {
    const m = new RegExp(`^${praefix}-(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${praefix}-${String(max + 1).padStart(4, '0')}`;
}

/** Hauspapiere: alle Sorten-Namen von Bogen-/Rollenmaterial mit Grammatur, mit ihren Materialien. */
export function hauspapiere(
  lager: Pick<Lager, 'materialien'>,
): { name: string; materialIds: string[] }[] {
  const nach = new Map<string, { name: string; materialIds: string[] }>();
  for (const m of lager.materialien) {
    if ((m.form !== 'Bogen' && m.form !== 'Rolle') || m.grammatur === undefined) continue;
    const k = schluessel(m.sorte);
    const e = nach.get(k) ?? { name: m.sorte.trim(), materialIds: [] };
    e.materialIds.push(m.id);
    nach.set(k, e);
  }
  return [...nach.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Passt die Sorte zum Material (Hauspapier gleich, Grammatur im Bereich)? */
export function sortePasst(sorte: LieferantenSorte, m: Material): boolean {
  if ((m.form !== 'Bogen' && m.form !== 'Rolle') || m.grammatur === undefined) return false;
  if (schluessel(m.sorte) !== schluessel(sorte.papier)) return false;
  if (sorte.grammaturVon !== undefined && m.grammatur < sorte.grammaturVon) return false;
  if (sorte.grammaturBis !== undefined && m.grammatur > sorte.grammaturBis) return false;
  return true;
}

/**
 * Die Sortenpreise eines Materials als Preise (Basis je 100 kg, Lieferant der Sorte). Die ID ist
 * die des Sortenpreises (SP-…), die Artikelnummer der Name der Sorte, falls keine eigene.
 */
export function sortenPreiseFuerMaterial(lager: Lager, materialId: string): Preis[] {
  const m = lager.materialien.find((x) => x.id === materialId);
  if (m === undefined) return [];
  const sorten = (lager.sorten ?? []).filter((s) => sortePasst(s, m));
  if (sorten.length === 0) return [];
  const preise: Preis[] = [];
  for (const sp of lager.sortenPreise ?? []) {
    const s = sorten.find((x) => x.id === sp.sorteId);
    if (s === undefined) continue;
    preise.push({
      id: sp.id,
      materialId,
      lieferant: s.lieferant,
      artikelnummer: s.artikelnummer ?? s.name,
      gueltigAb: sp.gueltigAb,
      basis: 'je100kg',
      betragZehntelcent: sp.je100kgZehntelcent,
    } as Preis);
  }
  return preise;
}

/** Ist dieser Preis ein Sortenpreis (abgeleitet), kein eigener Preis am Material? */
export function istSortenPreis(p: Pick<Preis, 'id'>): boolean {
  return /^SP-\d+$/.test(p.id);
}

/** Der am Stichtag geltende Preis einer Sorte (neuester mit gueltigAb ≤ Stichtag). */
export function aktuellerSortenPreis(
  lager: Pick<Lager, 'sortenPreise'>,
  sorteId: string,
  stichtag: string,
): SortenPreis | undefined {
  let bester: SortenPreis | undefined;
  for (const p of lager.sortenPreise ?? []) {
    if (p.sorteId !== sorteId || p.gueltigAb > stichtag) continue;
    if (bester === undefined || p.gueltigAb >= bester.gueltigAb) bester = p;
  }
  return bester;
}

function pruefen(lager: Lager): PruefErgebnis<Lager> {
  return pruefeLager(lager);
}

/** Neue Sorte (ID automatisch), wahlweise gleich mit erstem Preis. */
export function sorteHinzufuegen(
  lager: Lager,
  sorte: Omit<LieferantenSorte, 'id'>,
  preis?: { je100kgZehntelcent: number; gueltigAb: string },
): PruefErgebnis<Lager> {
  const id = naechsteId(
    (lager.sorten ?? []).map((s) => s.id),
    'LS',
  );
  const neu: Lager = { ...lager, sorten: [...(lager.sorten ?? []), { ...sorte, id }] };
  if (preis !== undefined) {
    neu.sortenPreise = [
      ...(lager.sortenPreise ?? []),
      {
        id: naechsteId(
          (lager.sortenPreise ?? []).map((p) => p.id),
          'SP',
        ),
        sorteId: id,
        ...preis,
        anlass: 'neu angelegt',
      },
    ];
  }
  return pruefen(neu);
}

/** Sorte ändern (Name, Lieferant, Hauspapier, Grammaturbereich) – Preise bleiben. */
export function sorteAendern(lager: Lager, sorte: LieferantenSorte): PruefErgebnis<Lager> {
  if (!(lager.sorten ?? []).some((s) => s.id === sorte.id))
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Sorte ${sorte.id} nicht gefunden` }] };
  return pruefen({
    ...lager,
    sorten: (lager.sorten ?? []).map((s) => (s.id === sorte.id ? sorte : s)),
  });
}

/** Neuer Preis je 100 kg für eine Sorte (angehängt). */
export function sortenPreisHinzufuegen(
  lager: Lager,
  sorteId: string,
  je100kgZehntelcent: number,
  gueltigAb: string,
  anlass = 'von Hand',
): PruefErgebnis<Lager> {
  return pruefen({
    ...lager,
    sortenPreise: [
      ...(lager.sortenPreise ?? []),
      {
        id: naechsteId(
          (lager.sortenPreise ?? []).map((p) => p.id),
          'SP',
        ),
        sorteId,
        je100kgZehntelcent,
        gueltigAb,
        anlass,
      },
    ],
  });
}

export type SortenAnpassung = {
  /** Nur Sorten dieser Lieferanten (Name, ohne Groß-/Kleinschreibung); leer = alle. */
  lieferanten?: readonly string[];
  /** Nur Sorten dieser Hauspapiere; leer = alle. */
  papiere?: readonly string[];
  prozent: number;
  gueltigAb: string;
};

export type AnpassungsZeile = {
  sorteId: string;
  sorte: string;
  lieferant: string;
  papier: string;
  alt: number;
  neu: number;
};

/**
 * Vorschau einer Anpassung: je betroffener Sorte der Preis vor `gueltigAb` und der neue
 * (kaufmännisch auf Zehntelcent). Sorten ohne Preis fallen weg.
 */
export function sortenAnpassungVorschau(lager: Lager, a: SortenAnpassung): AnpassungsZeile[] {
  const lief = (a.lieferanten ?? []).map(schluessel);
  const pap = (a.papiere ?? []).map(schluessel);
  const vortag = (() => {
    const d = new Date(`${a.gueltigAb}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const zeilen: AnpassungsZeile[] = [];
  for (const s of lager.sorten ?? []) {
    if (lief.length > 0 && !lief.includes(schluessel(s.lieferant))) continue;
    if (pap.length > 0 && !pap.includes(schluessel(s.papier))) continue;
    const alt = aktuellerSortenPreis(lager, s.id, vortag);
    if (alt === undefined) continue;
    zeilen.push({
      sorteId: s.id,
      sorte: s.name,
      lieferant: s.lieferant,
      papier: s.papier,
      alt: alt.je100kgZehntelcent,
      neu: Math.round((alt.je100kgZehntelcent * (100 + a.prozent)) / 100),
    });
  }
  return zeilen;
}

/** Anpassung ausführen: je Zeile der Vorschau ein neuer Sortenpreis ab `gueltigAb`. */
export function sortenAnpassen(lager: Lager, a: SortenAnpassung): PruefErgebnis<Lager> {
  const zeilen = sortenAnpassungVorschau(lager, a);
  if (zeilen.length === 0)
    return { ok: false, fehler: [{ pfad: '', meldung: 'Keine Sorte mit Preis in der Auswahl' }] };
  const ids = (lager.sortenPreise ?? []).map((p) => p.id);
  const neue: SortenPreis[] = zeilen.map((z) => {
    const id = naechsteId(ids, 'SP');
    ids.push(id);
    const vz = a.prozent > 0 ? '+' : '';
    return {
      id,
      sorteId: z.sorteId,
      je100kgZehntelcent: z.neu,
      gueltigAb: a.gueltigAb,
      anlass: `Anpassung ${vz}${String(a.prozent).replace('.', ',')} %`,
    };
  });
  return pruefen({ ...lager, sortenPreise: [...(lager.sortenPreise ?? []), ...neue] });
}

/**
 * Hauspapier umbenennen: alle Materialien mit dieser Sorte und alle Lieferantensorten des
 * Hauspapiers bekommen den neuen Namen (z. B. „GardaMatt Art halbmatt, weiß“ → „Bilderdruck
 * halbmatt“). Gibt die Anzahl geänderter Materialien zurück.
 */
export function hauspapierUmbenennen(
  lager: Lager,
  alt: string,
  neu: string,
): PruefErgebnis<Lager> & { anzahl?: number } {
  const k = schluessel(alt);
  const name = neu.trim();
  if (name === '') return { ok: false, fehler: [{ pfad: 'name', meldung: 'Neuer Name fehlt' }] };
  let anzahl = 0;
  const materialien = lager.materialien.map((m) => {
    if (schluessel(m.sorte) !== k) return m;
    anzahl += 1;
    return { ...m, sorte: name };
  });
  const sorten = (lager.sorten ?? []).map((s) =>
    schluessel(s.papier) === k ? { ...s, papier: name } : s,
  );
  const r = pruefen({ ...lager, materialien, ...(lager.sorten ? { sorten } : {}) });
  return r.ok ? { ...r, anzahl } : r;
}
