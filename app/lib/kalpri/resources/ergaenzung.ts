/**
 * T175: Ergänzung einspielen (Austauschformat `kalpri-ergaenzung` v1, docs/austausch/ergaenzung-v1.md).
 * Ergänzt Material (Lager) und Produktion um Partner, Material jeder Form, Preise, leere
 * Materialfelder und Verbrauchsmaterial an Maschinen – nur ergänzen, nie überschreiben. Einzige
 * Löschung: `ersetzt` beim Maschinenverbrauch (immer sichtbar in der Vorschau).
 * Ungültige Datei als Ganzes → nichts. Ungültige oder unauflösbare Zeile → ausgelassen, als Fehler
 * in der Vorschau; der Rest wird eingespielt.
 */
import { z } from 'zod';
import { EINHEITEN } from '@druck/units';
import { pruefeLager, type Lager } from './lager-schema';
import { naechsteMaterialId } from './lager';
import { pruefeMaterial, materialEinheitText, type Material } from './material';
import { PreisSchema, type Preis } from './preis-schema';
import { naechstePreisId } from './preise';
import { LieferantSchema, partnerZumPreisnamen, type Lieferant } from './lieferant-schema';
import { pruefeProduktion, type Produktion, type MaschinenVerbrauch } from './produktion-schema';
import { naechsteLieferantId } from './produktion';
import { naechsteVerbrauchId } from './maschinen-verbrauch';
import { ausZod, type PruefErgebnis } from './pruefung';

// ---------------------------------------------------------------- Schema (Vertrag v1)

const text = (max: number) => z.string().trim().min(1, 'Pflichtfeld').max(max);
const objekt = z.record(z.unknown());

const VerbrauchZeileSchema = z.object({
  arbeitsplatz: text(40),
  material: text(40),
  gruppe: text(60),
  menge: z.number().positive('muss größer als 0 sein'),
  je: z.enum(EINHEITEN, { errorMap: () => ({ message: 'Einheit unbekannt' }) }),
  schritte: z.array(text(40)).optional(),
  standard: z.boolean().optional(),
  wert: text(60).optional(),
  ersetzt: z.array(text(40)).optional(),
});

export const ErgaenzungSchema = z.object({
  art: z.literal('kalpri-ergaenzung', { errorMap: () => ({ message: 'keine Ergänzung (art)' }) }),
  version: z.literal(1, { errorMap: () => ({ message: 'Version muss 1 sein' }) }),
  titel: text(120),
  erstelltAm: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Datum im Format JJJJ-MM-TT'),
  quelle: z.string().max(200).optional(),
  partner: z.array(objekt).max(500).optional(),
  materialien: z
    .array(objekt.and(z.object({ schluessel: text(40) })))
    .max(2000)
    .optional(),
  preise: z
    .array(objekt.and(z.object({ material: text(40) })))
    .max(5000)
    .optional(),
  materialErgaenzungen: z
    .array(objekt.and(z.object({ material: text(40) })))
    .max(2000)
    .optional(),
  maschinenVerbrauch: z.array(VerbrauchZeileSchema).max(500).optional(),
  hinweise: z.array(z.string().max(500)).max(200).optional(),
});
export type Ergaenzung = z.infer<typeof ErgaenzungSchema>;

export function pruefeErgaenzung(input: unknown): PruefErgebnis<Ergaenzung> {
  return ausZod(ErgaenzungSchema.safeParse(input));
}

// ---------------------------------------------------------------- Ergebnis

export type ErgaenzungsAbschnitt = {
  titel: string;
  neu: string[];
  ergaenzt: string[];
  uebersprungen: string[];
  entfernt: string[];
  hinweise: string[];
  fehler: string[];
};

export type ErgaenzungsVorschau = {
  titel: string;
  dateiHinweise: string[];
  abschnitte: ErgaenzungsAbschnitt[];
};

export type ErgaenzungsErgebnis =
  | {
      ok: true;
      lager: Lager;
      produktion: Produktion;
      vorschau: ErgaenzungsVorschau;
      geaendert: boolean;
      lagerGeaendert: boolean;
      produktionGeaendert: boolean;
    }
  | { ok: false; fehler: { pfad: string; meldung: string }[] };

// ---------------------------------------------------------------- Hilfen

const k = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');
const leer = (v: unknown) => v === undefined || v === null || v === '';
const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const zeige = (v: unknown) =>
  typeof v === 'string'
    ? `„${v}“`
    : typeof v === 'number'
      ? String(v).replace('.', ',')
      : JSON.stringify(v);
const fehlerText = (f: { pfad: string; meldung: string }[]) =>
  f
    .slice(0, 3)
    .map((x) => (x.pfad === '' ? x.meldung : `${x.pfad}: ${x.meldung}`))
    .join('; ');

const abschnitt = (titel: string): ErgaenzungsAbschnitt => ({
  titel,
  neu: [],
  ergaenzt: [],
  uebersprungen: [],
  entfernt: [],
  hinweise: [],
  fehler: [],
});

/** Listen, die beim Partner zusammengeführt werden; Schlüssel je Eintrag. */
const PARTNER_LISTEN: Record<string, (e: unknown) => string> = {
  namenInPreisen: (e) => k(String(e)),
  stichworte: (e) => k(String(e)),
  rollen: (e) => String(e),
  kontakte: (e) => k(String((e as { name?: unknown }).name ?? '')),
  adressen: (e) => {
    const a = e as { art?: unknown; strasse?: unknown; ort?: unknown };
    return `${String(a.art)}|${k(String(a.strasse ?? ''))}|${k(String(a.ort ?? ''))}`;
  },
};

/** Felder, die `materialErgaenzungen` füllen darf. */
const ERGAENZBAR = [
  'dickeUm',
  'volumen',
  'oberflaeche',
  'laufrichtung',
  'packung',
  'kategorie',
] as const;

const formatGleich = (a: Material, b: Material): boolean => {
  if (a.form !== b.form) return false;
  if ((a.form === 'Bogen' || a.form === 'Stueck') && (b.form === 'Bogen' || b.form === 'Stueck'))
    return (
      (a.breiteUm === b.breiteUm && a.hoeheUm === b.hoeheUm) ||
      (a.breiteUm === b.hoeheUm && a.hoeheUm === b.breiteUm)
    );
  if (a.form === 'Rolle' && b.form === 'Rolle')
    return a.breiteUm === b.breiteUm && a.laengeM === b.laengeM;
  if (a.form === 'Menge' && b.form === 'Menge') return a.einheit === b.einheit;
  return false;
};

/** Gleiches Material laut Regel 2: Artikelnummer + Lieferant, sonst Form, Sorte, Grammatur, Format. */
function findeMaterial(materialien: readonly Material[], m: Material): Material | undefined {
  const nummern = (m.artikelnummern ?? []).map((a) => `${k(a.lieferant)}|${k(a.nummer)}`);
  if (nummern.length > 0) {
    const treffer = materialien.find((x) =>
      (x.artikelnummern ?? []).some((a) => nummern.includes(`${k(a.lieferant)}|${k(a.nummer)}`)),
    );
    if (treffer) return treffer;
  }
  return materialien.find(
    (x) =>
      x.form === m.form &&
      k(x.sorte) === k(m.sorte) &&
      (x as { grammatur?: number }).grammatur === (m as { grammatur?: number }).grammatur &&
      formatGleich(x, m),
  );
}

const jeText = (je: string) => (je === 'm2' ? 'm²' : je === 'Stueck' ? 'Stück' : je);

const materialName = (m: Material) =>
  `${m.id} ${m.sorte}${'grammatur' in m && m.grammatur ? ` ${m.grammatur} g` : ''}`;

// ---------------------------------------------------------------- Einspielen

export function ergaenzungEinspielen(
  lagerAlt: Lager,
  produktionAlt: Produktion,
  eingabe: unknown,
): ErgaenzungsErgebnis {
  const geprueft = pruefeErgaenzung(eingabe);
  if (!geprueft.ok) return geprueft;
  const d = geprueft.wert;

  const aPartner = abschnitt('Partner');
  const aMaterial = abschnitt('Material');
  const aPreise = abschnitt('Preise');
  const aErg = abschnitt('Ergänzte Felder');
  const aVerbrauch = abschnitt('Verbrauch an Maschinen');

  let materialien: Material[] = lagerAlt.materialien.map((m) => ({ ...m }));
  const preise: Preis[] = [...(lagerAlt.preise ?? [])];
  const lieferanten: Lieferant[] = (produktionAlt.lieferanten ?? []).map((l) => ({ ...l }));
  const plaetze = (produktionAlt.arbeitsplaetze ?? []).map((p) =>
    p.verbrauchsmaterial === undefined
      ? { ...p }
      : { ...p, verbrauchsmaterial: [...p.verbrauchsmaterial] },
  );
  let lagerGeaendert = false;
  let produktionGeaendert = false;

  // ---- 1. Partner
  for (const roh of d.partner ?? []) {
    const name = typeof roh.name === 'string' ? roh.name.trim() : '';
    if (name === '') {
      aPartner.fehler.push('Partner ohne Namen – ausgelassen');
      continue;
    }
    const namen = [
      name,
      ...(Array.isArray(roh.namenInPreisen) ? roh.namenInPreisen.map(String) : []),
    ];
    let vorhanden: Lieferant | undefined;
    for (const n of namen) vorhanden ??= partnerZumPreisnamen(lieferanten, n);
    if (vorhanden === undefined) {
      const { id: _ohneId, ...rest } = roh;
      void _ohneId;
      const p = LieferantSchema.safeParse({
        ...rest,
        id: naechsteLieferantId({ ...produktionAlt, lieferanten }),
      });
      if (!p.success) {
        const f = ausZod(p);
        aPartner.fehler.push(`${name}: ${f.ok ? '' : fehlerText(f.fehler)}`);
        continue;
      }
      lieferanten.push(p.data);
      aPartner.neu.push(`${p.data.id} ${p.data.name}`);
      produktionGeaendert = true;
      continue;
    }
    const neu: Record<string, unknown> = { ...vorhanden };
    const ergaenzt: string[] = [];
    for (const [feld, wert] of Object.entries(roh)) {
      if (feld === 'id' || feld === 'name' || leer(wert)) continue;
      const schluessel = PARTNER_LISTEN[feld];
      if (schluessel !== undefined && Array.isArray(wert)) {
        const alt = Array.isArray(neu[feld]) ? (neu[feld] as unknown[]) : [];
        const da = new Set(alt.map(schluessel));
        const dazu = wert.filter((e) => !da.has(schluessel(e)));
        if (dazu.length > 0) {
          neu[feld] = [...alt, ...dazu];
          ergaenzt.push(`${feld} +${dazu.length}`);
        }
        continue;
      }
      if (leer(neu[feld])) {
        neu[feld] = wert;
        ergaenzt.push(feld);
      } else if (!gleich(neu[feld], wert))
        aPartner.hinweise.push(
          `${vorhanden.name}: ${feld} in der Datei ${zeige(wert)}, in kalpri ${zeige(neu[feld])} – bleibt`,
        );
    }
    if (ergaenzt.length === 0) {
      aPartner.uebersprungen.push(`${vorhanden.id} ${vorhanden.name} (schon vorhanden)`);
      continue;
    }
    const p = LieferantSchema.safeParse(neu);
    if (!p.success) {
      const f = ausZod(p);
      aPartner.fehler.push(`${vorhanden.name}: ${f.ok ? '' : fehlerText(f.fehler)}`);
      continue;
    }
    lieferanten[lieferanten.indexOf(vorhanden)] = p.data;
    aPartner.ergaenzt.push(`${vorhanden.id} ${vorhanden.name}: ${ergaenzt.join(', ')}`);
    produktionGeaendert = true;
  }

  // ---- 2. Material
  const zuId = new Map<string, string>();
  const verweis = (ref: string): string | undefined =>
    zuId.get(k(ref)) ?? materialien.find((m) => k(m.id) === k(ref))?.id;
  for (const roh of d.materialien ?? []) {
    const {
      schluessel,
      id: _ohneId,
      ...rest
    } = roh as Record<string, unknown> & { schluessel: string };
    void _ohneId;
    const neueId = naechsteMaterialId({ ...lagerAlt, materialien });
    const p = pruefeMaterial({ ...rest, id: neueId });
    if (!p.ok) {
      aMaterial.fehler.push(`${schluessel} ${String(rest.sorte ?? '')}: ${fehlerText(p.fehler)}`);
      continue;
    }
    const vorhanden = findeMaterial(materialien, p.wert);
    if (vorhanden === undefined) {
      materialien.push(p.wert);
      zuId.set(k(schluessel), p.wert.id);
      aMaterial.neu.push(`${materialName(p.wert)} (${materialEinheitText(p.wert)})`);
      lagerGeaendert = true;
      continue;
    }
    zuId.set(k(schluessel), vorhanden.id);
    const neu: Record<string, unknown> = { ...vorhanden };
    const ergaenzt: string[] = [];
    for (const [feld, wert] of Object.entries(p.wert)) {
      if (feld === 'id' || leer(wert)) continue;
      if (feld === 'artikelnummern' && Array.isArray(wert)) {
        const alt = (neu.artikelnummern as Material['artikelnummern']) ?? [];
        const da = new Set(alt.map((a) => `${k(a.lieferant)}|${k(a.nummer)}`));
        const dazu = (wert as NonNullable<Material['artikelnummern']>).filter(
          (a) => !da.has(`${k(a.lieferant)}|${k(a.nummer)}`),
        );
        if (dazu.length > 0) {
          neu.artikelnummern = [...alt, ...dazu];
          ergaenzt.push(`Artikelnummer ${dazu.map((a) => a.nummer).join(', ')}`);
        }
        continue;
      }
      if (leer(neu[feld])) {
        neu[feld] = wert;
        ergaenzt.push(feld);
      } else if (!gleich(neu[feld], wert) && feld !== 'sorte')
        aMaterial.hinweise.push(
          `${vorhanden.id}: ${feld} in der Datei ${zeige(wert)}, in kalpri ${zeige(neu[feld])} – bleibt`,
        );
    }
    if (ergaenzt.length === 0) {
      aMaterial.uebersprungen.push(`${materialName(vorhanden)} (schon vorhanden)`);
      continue;
    }
    const q = pruefeMaterial(neu);
    if (!q.ok) {
      aMaterial.fehler.push(`${vorhanden.id}: ${fehlerText(q.fehler)}`);
      continue;
    }
    materialien = materialien.map((m) => (m.id === vorhanden.id ? q.wert : m));
    aMaterial.ergaenzt.push(`${materialName(vorhanden)}: ${ergaenzt.join(', ')}`);
    lagerGeaendert = true;
  }

  // ---- 3. Preise
  for (const roh of d.preise ?? []) {
    const {
      material,
      id: _ohneId,
      ...rest
    } = roh as Record<string, unknown> & { material: string };
    void _ohneId;
    const materialId = verweis(material);
    if (materialId === undefined) {
      aPreise.fehler.push(`Preis für ${material}: Material nicht gefunden – ausgelassen`);
      continue;
    }
    const p = PreisSchema.safeParse({
      ...rest,
      materialId,
      id: naechstePreisId({ ...lagerAlt, materialien, preise }),
    });
    if (!p.success) {
      const f = ausZod(p);
      aPreise.fehler.push(`Preis für ${materialId}: ${f.ok ? '' : fehlerText(f.fehler)}`);
      continue;
    }
    const neu = p.data;
    const gleicherTag = preise.find(
      (x) =>
        x.materialId === materialId &&
        k(x.lieferant) === k(neu.lieferant) &&
        x.gueltigAb === neu.gueltigAb,
    );
    const text = `${materialId} · ${neu.lieferant} ab ${neu.gueltigAb}`;
    if (gleicherTag !== undefined) {
      const { id: _a, ...x } = gleicherTag;
      const { id: _b, ...y } = neu;
      void _a;
      void _b;
      if (gleich({ ...x, lieferant: k(x.lieferant) }, { ...y, lieferant: k(y.lieferant) }))
        aPreise.uebersprungen.push(`${text} (schon vorhanden)`);
      else
        aPreise.hinweise.push(
          `${text}: anderer Preis schon vorhanden (${gleicherTag.id}) – Preise werden nicht geändert`,
        );
      continue;
    }
    // Regeln des Lagers (z. B. „je 1000 nur bei Bogen und Stück“) je Zeile prüfen
    const probe = pruefeLager({ ...lagerAlt, materialien, preise: [...preise, neu] });
    const eigene = probe.ok
      ? []
      : probe.fehler.filter((f) => f.pfad.startsWith(`preise.${preise.length}`));
    if (eigene.length > 0) {
      aPreise.fehler.push(`${text}: ${eigene.map((f) => f.meldung).join('; ')} – ausgelassen`);
      continue;
    }
    preise.push(neu);
    aPreise.neu.push(`${neu.id} ${text}`);
    lagerGeaendert = true;
  }

  // ---- 4. Materialergänzungen
  for (const roh of d.materialErgaenzungen ?? []) {
    const materialId = verweis(roh.material);
    const m = materialien.find((x) => x.id === materialId);
    if (m === undefined) {
      aErg.fehler.push(`${roh.material}: Material nicht gefunden – ausgelassen`);
      continue;
    }
    const neu: Record<string, unknown> = { ...m };
    const ergaenzt: string[] = [];
    for (const feld of ERGAENZBAR) {
      const wert = roh[feld];
      if (leer(wert)) continue;
      if (feld === 'laufrichtung' && m.form !== 'Bogen') continue;
      if (leer(neu[feld])) {
        neu[feld] = wert;
        ergaenzt.push(`${feld} ${zeige(wert)}`);
      } else if (!gleich(neu[feld], wert))
        aErg.hinweise.push(
          `${m.id}: ${feld} in der Datei ${zeige(wert)}, in kalpri ${zeige(neu[feld])} – bleibt`,
        );
    }
    if (ergaenzt.length === 0) {
      aErg.uebersprungen.push(`${materialName(m)} (nichts zu ergänzen)`);
      continue;
    }
    const q = pruefeMaterial(neu);
    if (!q.ok) {
      aErg.fehler.push(`${m.id}: ${fehlerText(q.fehler)}`);
      continue;
    }
    materialien = materialien.map((x) => (x.id === m.id ? q.wert : x));
    aErg.ergaenzt.push(`${materialName(m)}: ${ergaenzt.join(', ')}`);
    lagerGeaendert = true;
  }

  // ---- 5. Maschinenverbrauch
  const mName = (id: string) => materialien.find((m) => m.id === id)?.sorte ?? id;
  const mengeText = (id: string, menge: number, je: string) => {
    const m = materialien.find((x) => x.id === id);
    return `${zeige(menge)} ${m === undefined ? '' : `${materialEinheitText(m)} `}je ${jeText(je)}`;
  };
  for (const z of d.maschinenVerbrauch ?? []) {
    const platz = plaetze.find((p) => k(p.id) === k(z.arbeitsplatz));
    if (platz === undefined) {
      aVerbrauch.fehler.push(`${z.arbeitsplatz}: Arbeitsplatz nicht gefunden – ausgelassen`);
      continue;
    }
    const materialId = verweis(z.material);
    if (materialId === undefined) {
      aVerbrauch.fehler.push(`${platz.name}: Material ${z.material} nicht gefunden – ausgelassen`);
      continue;
    }
    const unbekannt = (z.schritte ?? []).filter(
      (s) => !platz.schritte.some((x) => x.schrittId === s),
    );
    if (unbekannt.length > 0) {
      aVerbrauch.fehler.push(
        `${platz.name}: Schritt ${unbekannt.join(', ')} gibt es an dieser Maschine nicht – ausgelassen`,
      );
      continue;
    }
    let liste: MaschinenVerbrauch[] = platz.verbrauchsmaterial ?? [];
    for (const alt of z.ersetzt ?? []) {
      const altId = verweis(alt) ?? alt;
      const weg = liste.filter((v) => v.materialId === altId);
      if (weg.length === 0) continue;
      liste = liste.filter((v) => v.materialId !== altId);
      for (const v of weg)
        aVerbrauch.entfernt.push(
          `${platz.name}: ${mName(v.materialId)}, ${mengeText(v.materialId, v.menge, v.je)}`,
        );
      produktionGeaendert = true;
    }
    const schon = liste.find((v) => v.materialId === materialId);
    if (schon !== undefined) {
      if (schon.menge !== z.menge || schon.je !== z.je)
        aVerbrauch.hinweise.push(
          `${platz.name}: ${mName(materialId)} schon mit ${mengeText(materialId, schon.menge, schon.je)} – Datei ${mengeText(materialId, z.menge, z.je)}, bleibt`,
        );
      else aVerbrauch.uebersprungen.push(`${platz.name}: ${mName(materialId)} (schon vorhanden)`);
      platz.verbrauchsmaterial = liste;
      continue;
    }
    let standard = z.standard;
    if (standard === true) {
      const ueberschneiden = (a: readonly string[], b: readonly string[]) =>
        a.length === 0 || b.length === 0 || a.some((x) => b.includes(x));
      const konflikt = liste.find(
        (v) =>
          v.standard === true &&
          k(v.gruppe) === k(z.gruppe) &&
          ueberschneiden(v.schritte ?? [], z.schritte ?? []),
      );
      if (konflikt !== undefined) {
        standard = undefined;
        aVerbrauch.hinweise.push(
          `${platz.name}: in der Gruppe „${z.gruppe}“ ist schon ${mName(konflikt.materialId)} Standard – ${mName(materialId)} als Alternative`,
        );
      }
    }
    const eintrag: MaschinenVerbrauch = {
      id: naechsteVerbrauchId({ verbrauchsmaterial: liste }),
      materialId,
      gruppe: z.gruppe,
      menge: z.menge,
      je: z.je,
      ...(z.schritte !== undefined && z.schritte.length > 0 ? { schritte: z.schritte } : {}),
      ...(standard === true ? { standard: true } : {}),
      ...(z.wert !== undefined ? { wert: z.wert } : {}),
    };
    platz.verbrauchsmaterial = [...liste, eintrag];
    aVerbrauch.neu.push(
      `${platz.name}: ${mName(materialId)}, ${mengeText(materialId, z.menge, z.je)} (Gruppe ${z.gruppe})`,
    );
    produktionGeaendert = true;
  }

  const lagerNeu: Lager = {
    ...lagerAlt,
    materialien,
    ...(preise.length > 0 || lagerAlt.preise ? { preise } : {}),
  };
  const produktionNeu: Produktion = {
    ...produktionAlt,
    ...(lieferanten.length > 0 || produktionAlt.lieferanten ? { lieferanten } : {}),
    ...(produktionAlt.arbeitsplaetze ? { arbeitsplaetze: plaetze } : {}),
  };
  const pl = pruefeLager(lagerNeu);
  if (!pl.ok) return pl;
  const pp = pruefeProduktion(produktionNeu);
  if (!pp.ok) return pp;
  return {
    ok: true,
    lager: lagerGeaendert ? pl.wert : lagerAlt,
    produktion: produktionGeaendert ? pp.wert : produktionAlt,
    vorschau: {
      titel: d.titel,
      dateiHinweise: d.hinweise ?? [],
      abschnitte: [aPartner, aMaterial, aPreise, aErg, aVerbrauch],
    },
    geaendert: lagerGeaendert || produktionGeaendert,
    lagerGeaendert,
    produktionGeaendert,
  };
}
