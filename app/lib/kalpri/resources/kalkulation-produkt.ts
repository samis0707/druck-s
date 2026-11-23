import type { Artikel, ArtikelMerkmal, ArtikelTeil } from './artikel-schema';
import { ArtikelSchema } from './artikel-schema';
import { kalkulationAusArtikel, type KalkulationAusArtikel } from './kalkulation-aus-artikel';
import type { Kalkulation, Teil, Zeile } from './kalkulation-schema';
import type { Lager } from './lager-schema';
import type { Produktion } from './produktion-schema';

/**
 * T118/T120: Produkt an der Kalkulation – beschreiben, Weg vorschlagen, mit dem Weg abgleichen.
 * Vorgeschlagene Zeilen tragen `vorschlag`; von Hand geänderte zusätzlich `geaendert`; selbst
 * angelegte keins von beiden. Ein neuer Vorschlag ersetzt nur unveränderte Vorschläge.
 */

/** Produkt der Kalkulation, geprüft wie ein Artikel; fehlt oder ungültig: null. */
export function produktVon(k: Pick<Kalkulation, 'produkt'>): Artikel | null {
  if (k.produkt === undefined) return null;
  const r = ArtikelSchema.safeParse(k.produkt);
  return r.success ? r.data : null;
}

const VIER_VIER = { vorne: { farbe: 'farbig' as const }, hinten: { farbe: 'farbig' as const } };

/** Neues Teil mit üblichen Vorgaben (4/4, im Haus, Material noch offen). */
export function neuesProduktTeil(nummer: number): ArtikelTeil {
  return {
    id: `T${nummer}`,
    name: nummer === 1 ? 'Teil' : `Teil ${nummer}`,
    jeProdukt: 1,
    woraus: { zustand: 'offen' },
    druck: { zustand: 'fest', wert: VIER_VIER },
    wer: { zustand: 'fest', wert: 'haus' },
  };
}

/**
 * Produkt für eine Kalkulation ohne Beschreibung: aus ihren Teilen (Name, Stück, Format,
 * Material, Druck aus der Druckzeile), sonst ein leeres Teil.
 */
export function produktAusKalkulation(k: Kalkulation): Artikel {
  const teile: ArtikelTeil[] = (k.teile ?? []).map((t: Teil) => {
    const druckZeile = k.zeilen.find(
      (z) =>
        z.art === 'arbeitsgang' &&
        z.druck !== undefined &&
        z.menge.art === 'papierweg' &&
        z.menge.teilId === t.id,
    );
    const druck = druckZeile?.art === 'arbeitsgang' ? druckZeile.druck : undefined;
    // T155: Stanzform des Teils – aus einer Zeile dieses Teils, bei nur einem Teil aus jeder
    const formZeile = k.zeilen.find(
      (z) =>
        z.art === 'arbeitsgang' &&
        z.stanzformId !== undefined &&
        ((z.menge.art === 'papierweg' && z.menge.teilId === t.id) || (k.teile ?? []).length === 1),
    );
    const stanzformId = formZeile?.art === 'arbeitsgang' ? formZeile.stanzformId : undefined;
    return {
      id: t.id,
      name: t.name,
      jeProdukt: t.jeProdukt,
      woraus:
        t.materialId === undefined
          ? { zustand: 'offen' }
          : { zustand: 'fest', wert: { art: 'material', materialId: t.materialId } },
      druck: druck === undefined ? { zustand: 'offen' } : { zustand: 'fest', wert: druck },
      wer: { zustand: 'fest', wert: 'haus' },
      ...(t.offenesFormat ? { offenesFormat: t.offenesFormat } : {}),
      ...(t.beschnittUm === undefined ? {} : { beschnittUm: t.beschnittUm }),
      ...(t.wareGestellt === true ? { wareGestellt: true } : {}),
      ...(t.wareText === undefined ? {} : { wareText: t.wareText }),
      ...(stanzformId === undefined ? {} : { stanzformId }),
    } as ArtikelTeil;
  });
  const erstes = k.teile?.[0];
  return {
    id: k.artikelId ?? 'PRODUKT',
    titel: k.titel,
    einheit: k.einheit,
    endformat: erstes ? { zustand: 'fest', wert: erstes.endformat } : { zustand: 'offen' },
    teile: teile.length > 0 ? teile : [neuesProduktTeil(1)],
  } as Artikel;
}

/** Was „Weg vorschlagen“ noch braucht (leer = bereit). */
export function produktFehlt(a: Artikel): string[] {
  const fehlt: string[] = [];
  if (a.endformat.zustand !== 'fest') fehlt.push('Endformat');
  for (const t of a.teile) {
    if (t.wareGestellt !== true && t.woraus.zustand !== 'fest') fehlt.push(`${t.name}: Material`);
    if (t.druck.zustand !== 'fest') fehlt.push(`${t.name}: Farbigkeit`);
  }
  return fehlt;
}

/** Schlüssel, an dem ein vorgeschlagener Posten wiedererkannt wird. */
function postenSchluessel(z: Zeile): string {
  const teil =
    'menge' in z && z.menge.art === 'papierweg'
      ? z.menge.teilId
      : 'menge' in z && z.menge.art === 'auftrag'
        ? (z.menge.teilId ?? '')
        : '';
  if (z.art === 'arbeitsgang') {
    const vorschneiden = (z.bezeichnung ?? '').startsWith('Vorschneiden') ? 'vor' : '';
    return `a|${z.schrittId}|${teil}|${vorschneiden}`;
  }
  if (z.art === 'material') return `m|${teil}|${z.materialId}`;
  return `${z.art}|${z.id}`;
}

function postenName(
  z: Zeile,
  p: Pick<Produktion, 'arbeitsschritte'>,
  lager?: Pick<Lager, 'materialien'>,
): string {
  if (z.bezeichnung) return z.bezeichnung;
  if (z.art === 'arbeitsgang')
    return p.arbeitsschritte.find((s) => s.id === z.schrittId)?.name ?? z.schrittId;
  if (z.art === 'material')
    return lager?.materialien.find((m) => m.id === z.materialId)?.sorte ?? z.materialId;
  return z.id;
}

export type WegVorschlag = {
  /** Kalkulation mit neuem Weg (ungeprüft, für kalkulationAendern). */
  eingabe: Record<string, unknown>;
  /** Posten, die neu dazukommen. */
  dazu: string[];
  /** Vorgeschlagene Posten, die wegfallen. */
  weg: string[];
  /** Eigene oder geänderte Posten, die bleiben. */
  bleiben: string[];
  hinweise: string[];
};

/**
 * Weg aus dem Produkt vorschlagen und mit der Kalkulation abgleichen: unveränderte Vorschläge
 * werden ersetzt, eigene und geänderte Zeilen (und Zeilen mit Ist-Werten) bleiben, Einstellungen
 * an den Teilen (Druckbogen, Beschnitt, Nutzen) bleiben.
 */
export function wegVorschlagen(
  k: Kalkulation,
  produkt: Artikel,
  p: Produktion,
  lager: Pick<Lager, 'materialien'>,
  heute: string,
  /** z. B. günstigste Maschine je Arbeitsgang wählen (Werkbank). */
  nachbearbeiten: (v: KalkulationAusArtikel) => KalkulationAusArtikel = (v) => v,
): WegVorschlag {
  const v = nachbearbeiten(
    kalkulationAusArtikel(produkt, p, lager, {
      auflagen: k.auflagen,
      erstelltAm: k.erstelltAm ?? heute,
    }),
  );
  const neueZeilen = (v.eingabe.zeilen ?? []) as Zeile[];
  const mitIst = new Set((k.ist ?? []).map((i) => i.zeileId));
  const bleibt = (z: Zeile) => z.vorschlag !== true || z.geaendert === true || mitIst.has(z.id);
  const alteBleiben = k.zeilen.filter(bleibt);
  const genutzt = new Set<string>();
  const ids = new Set(alteBleiben.map((z) => z.id));
  let n = 0;
  const neueId = () => {
    do n += 1;
    while (ids.has(`Z${n}`));
    ids.add(`Z${n}`);
    return `Z${n}`;
  };
  const ergebnis: Zeile[] = [];
  const dazu: string[] = [];
  const alteSchluessel = new Set(k.zeilen.map(postenSchluessel));
  for (const neu of neueZeilen) {
    const s = postenSchluessel(neu);
    const vorhanden = alteBleiben.find((z) => !genutzt.has(z.id) && postenSchluessel(z) === s);
    if (vorhanden) {
      genutzt.add(vorhanden.id);
      ergebnis.push(vorhanden);
      continue;
    }
    if (!alteSchluessel.has(s)) dazu.push(postenName(neu, p, lager));
    ergebnis.push({ ...neu, id: neueId(), vorschlag: true } as Zeile);
  }
  for (const z of alteBleiben) if (!genutzt.has(z.id)) ergebnis.push(z);
  const neueSchluessel = new Set(neueZeilen.map(postenSchluessel));
  const weg = k.zeilen
    .filter((z) => !bleibt(z) && !neueSchluessel.has(postenSchluessel(z)))
    .map((z) => postenName(z, p, lager));
  // alle eigenen und geänderten Posten bleiben, auch wenn der Vorschlag sie ebenfalls nennt
  const bleiben = alteBleiben.map((z) => postenName(z, p, lager));
  // Teile aus dem Vorschlag, Einstellungen von Hand bleiben
  const teile = ((v.eingabe.teile ?? []) as Teil[]).map((t) => {
    const alt = k.teile?.find((x) => x.id === t.id);
    if (!alt) return t;
    return {
      ...t,
      ...(alt.druckbogen === undefined ? {} : { druckbogen: alt.druckbogen }),
      ...(alt.beschnittUm === undefined ? {} : { beschnittUm: alt.beschnittUm }),
      ...(alt.nutzenJeBogen === undefined ? {} : { nutzenJeBogen: alt.nutzenJeBogen }),
    };
  });
  // Teile, die eigene Zeilen noch brauchen, bleiben
  for (const z of ergebnis) {
    const tid = 'menge' in z && z.menge.art === 'papierweg' ? z.menge.teilId : undefined;
    const alt = tid === undefined ? undefined : k.teile?.find((x) => x.id === tid);
    if (alt && !teile.some((t) => t.id === alt.id)) teile.push(alt);
  }
  const eingabe: Record<string, unknown> = {
    ...k,
    zeilen: ergebnis,
    teile,
    produkt: produkt as unknown as Record<string, unknown>,
  };
  return { eingabe, dazu, weg, bleiben, hinweise: v.hinweise };
}

/**
 * Nach einer Änderung von Hand: vorgeschlagene Zeilen, die sich geändert haben, als `geaendert`
 * markieren (sie bleiben dann beim nächsten Vorschlag).
 */
export function geaenderteMarkieren(
  alt: Kalkulation,
  neu: Record<string, unknown>,
): Record<string, unknown> {
  const zeilen = neu['zeilen'];
  if (!Array.isArray(zeilen)) return neu;
  const ohneMarke = (z: unknown) => {
    const kopie = { ...(z as Record<string, unknown>) };
    delete kopie['geaendert'];
    return JSON.stringify(kopie);
  };
  return {
    ...neu,
    zeilen: zeilen.map((z: Record<string, unknown>) => {
      const vorher = alt.zeilen.find((x) => x.id === z['id']);
      // T129: ein Formular hat die Marke nicht mitgegeben – Vorschlag bleibt Vorschlag
      if (z['vorschlag'] !== true && vorher?.vorschlag === true) {
        const mit = { ...z, vorschlag: true };
        return ohneMarke(vorher) !== ohneMarke(mit) || vorher.geaendert === true
          ? { ...mit, geaendert: true }
          : mit;
      }
      if (z['vorschlag'] !== true || z['geaendert'] === true) return z;
      return vorher && ohneMarke(vorher) !== ohneMarke(z) ? { ...z, geaendert: true } : z;
    }),
  };
}

/** Kalkulation aus einem Produkt neu anlegen: Weg vorschlagen, Zeilen als Vorschlag markiert. */
export function kalkulationAusProdukt(
  produkt: Artikel,
  p: Produktion,
  lager: Pick<Lager, 'materialien'>,
  kopf: { titel?: string; auflagen: number[]; erstelltAm: string; artikelId?: string },
  nachbearbeiten: (v: KalkulationAusArtikel) => KalkulationAusArtikel = (v) => v,
): { eingabe: Record<string, unknown>; hinweise: string[] } {
  const v = nachbearbeiten(kalkulationAusArtikel(produkt, p, lager, kopf));
  const eingabe: Record<string, unknown> = {
    ...v.eingabe,
    ...(kopf.titel === undefined ? {} : { titel: kopf.titel }),
    zeilen: ((v.eingabe.zeilen ?? []) as Zeile[]).map((z) => ({ ...z, vorschlag: true })),
    produkt: produkt as unknown as Record<string, unknown>,
  };
  if (kopf.artikelId === undefined) delete eingabe['artikelId'];
  return { eingabe, hinweise: v.hinweise };
}

function gleich(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

const TEIL_FELDER: readonly [keyof ArtikelTeil, string][] = [
  ['name', 'Name'],
  ['jeProdukt', 'Stück'],
  ['woraus', 'Material'],
  ['druck', 'Farbigkeit'],
  ['seiten', 'Seiten'],
  ['beschnittUm', 'Beschnitt'],
  ['merkmale', 'Merkmale'],
  ['stanzformId', 'Stanzform'],
];

/**
 * Was am Produkt anders ist als am Artikel, z. B. ["Endformat", "Umschlag: Material",
 * "Teil T3 neu", "Teil T2 entfernt"]. Wählbares im Artikel, das im Produkt fest gewählt ist,
 * gilt nicht als Abweichung.
 */
export function abweichungenVomArtikel(produkt: Artikel, artikel: Artikel): string[] {
  const aus: string[] = [];
  const passt = (
    p: { zustand: string; wert?: unknown } | undefined,
    a: { zustand: string; wert?: unknown; werte?: unknown[] } | undefined,
  ): boolean => {
    // fehlt = offen
    if (p === undefined) p = { zustand: 'offen' };
    if (a === undefined) a = { zustand: 'offen' };
    if (gleich(p, a)) return true;
    if (p?.zustand === 'fest' && a?.zustand === 'waehlbar')
      return (a.werte ?? []).some((w) => gleich(w, p.wert));
    if (p?.zustand === 'fest' && a?.zustand === 'offen') return true;
    return false;
  };
  if (!passt(produkt.endformat, artikel.endformat)) aus.push('Endformat');
  for (const t of produkt.teile) {
    const at = artikel.teile.find((x) => x.id === t.id);
    if (!at) {
      aus.push(`${t.name} neu`);
      continue;
    }
    for (const [feld, name] of TEIL_FELDER) {
      const pw = t[feld];
      const aw = at[feld];
      const stimmt =
        feld === 'woraus' || feld === 'druck' || feld === 'seiten'
          ? passt(
              pw as { zustand: string; wert?: unknown } | undefined,
              aw as { zustand: string; wert?: unknown; werte?: unknown[] } | undefined,
            )
          : feld === 'merkmale'
            ? merkmaleStimmen(t.merkmale, at.merkmale, passt)
            : gleich(pw, aw);
      if (!stimmt) aus.push(`${t.name}: ${name}`);
    }
  }
  for (const at of artikel.teile) {
    if (!produkt.teile.some((t) => t.id === at.id)) aus.push(`${at.name} entfernt`);
  }
  if (!merkmaleStimmen(produkt.merkmale, artikel.merkmale, passt)) aus.push('Merkmale');
  return aus;
}

function merkmaleStimmen(
  p: readonly ArtikelMerkmal[] | undefined,
  a: readonly ArtikelMerkmal[] | undefined,
  passt: (
    p: { zustand: string; wert?: unknown } | undefined,
    a: { zustand: string; wert?: unknown; werte?: unknown[] } | undefined,
  ) => boolean,
): boolean {
  const pl = p ?? [];
  const al = a ?? [];
  if (pl.length !== al.length) return false;
  return pl.every((m) => {
    const am = al.find((x) => x.name.toLowerCase() === m.name.toLowerCase());
    return am !== undefined && passt(m.wert, am.wert);
  });
}
