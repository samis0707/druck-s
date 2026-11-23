import { artikelAendern, artikelHinzufuegen } from './artikel';
import type {
  Artikel,
  ArtikelMerkmal,
  ArtikelTeil,
  Artikelbestand,
  DruckWert,
  Quelle,
} from './artikel-schema';
import type { Kalkulation, Teil } from './kalkulation-schema';
import type { Lager } from './lager-schema';
import type { Produktion } from './produktion-schema';
import type { PruefErgebnis } from './pruefung';

/** Artikelentwurf aus einer Kalkulation; die ID vergibt erst `artikelUebernehmen`. */
export type ArtikelAusKalkulation = {
  artikel: Omit<Artikel, 'id'>;
  /** Artikel, auf dem der Entwurf aufbaut (k.artikelId, wenn im Bestand); sonst null. */
  grundlage: string | null;
  hinweise: string[];
};

export type ArtikelEntscheidung = 'neu' | 'aktualisieren' | 'keiner';

export type ArtikelUebernahme = {
  bestand: Artikelbestand;
  /** ID des geschriebenen Artikels; null bei „keiner“. */
  artikelId: string | null;
  hinweise: string[];
};

const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Teil, zu dem eine Zeile gehört (Papierweg oder Zukauf); null = ganzes Produkt. */
function teilVon(z: Kalkulation['zeilen'][number]): string | null {
  if ((z.art === 'material' || z.art === 'arbeitsgang') && z.menge.art === 'papierweg') {
    return z.menge.teilId;
  }
  if (z.art === 'zukauf') return z.teilId ?? null;
  return null;
}

/** Farbigkeit des Teils aus seiner ersten Druckzeile; null ohne Druckzeile. */
function druckVon(k: Kalkulation, teilId: string): DruckWert | null {
  for (const z of k.zeilen) {
    if (z.art === 'arbeitsgang' && z.druck !== undefined && teilVon(z) === teilId) return z.druck;
  }
  return null;
}

/** Merkmale aus den Arbeitsgängen: Schritt mit „Im Arbeitsweg: Merkmal“ → Name: erster Wert,
 *  mit Angaben der Zeile („Bohren: 4-fach, Ø 6 mm“), sonst „ja“. */
function merkmaleAus(
  k: Kalkulation,
  p: Produktion,
  teilId: string | null,
  hinweise: string[],
): ArtikelMerkmal[] {
  const merkmale: ArtikelMerkmal[] = [];
  for (const z of k.zeilen) {
    if (z.art !== 'arbeitsgang' || teilVon(z) !== teilId) continue;
    const s = p.arbeitsschritte.find((x) => x.id === z.schrittId);
    if (!s) continue;
    const w = s.imWeg;
    if (w?.art === 'merkmal') {
      const angaben = z.angaben ?? [];
      const wert = angaben.length > 0 ? angaben.join(', ') : (w.werte?.[0] ?? 'ja');
      if (!merkmale.some((m) => m.name === w.name)) {
        merkmale.push({ name: w.name, wert: { zustand: 'fest', wert } });
      }
    } else if (s.imWeg === undefined && teilId === null) {
      hinweise.push(`${s.name}: Schritt ohne Merkmal – nicht übernommen`);
    }
  }
  return merkmale;
}

/** Woraus aus dem Material des Teils: eine passende Sorte im Artikel bleibt stehen. */
function worausAus(
  t: Teil,
  vorher: ArtikelTeil['woraus'] | undefined,
  lager: Pick<Lager, 'materialien'>,
): ArtikelTeil['woraus'] {
  if (t.materialId === undefined) return vorher ?? { zustand: 'offen' };
  const m = lager.materialien.find((x) => x.id === t.materialId);
  if (vorher?.zustand === 'fest') {
    const q = vorher.wert;
    if (q.art === 'material' && q.materialId === t.materialId) return vorher;
    if (
      q.art === 'sorte' &&
      m !== undefined &&
      m.grammatur === q.grammatur &&
      m.sorte.trim().toLowerCase() === q.sorte.trim().toLowerCase()
    ) {
      return vorher;
    }
  }
  if (vorher?.zustand === 'waehlbar') return vorher;
  const wert: Quelle = { art: 'material', materialId: t.materialId };
  return { zustand: 'fest', wert };
}

/** Neues Artikel-Teil aus einem Teil der Kalkulation. */
function neuesTeil(
  k: Kalkulation,
  t: Teil,
  p: Produktion,
  lager: Pick<Lager, 'materialien'>,
  hinweise: string[],
): ArtikelTeil {
  const druck = druckVon(k, t.id);
  const zukauf = k.zeilen.some((z) => z.art === 'zukauf' && z.teilId === t.id);
  const teil: ArtikelTeil = {
    id: t.id,
    name: t.name,
    jeProdukt: t.jeProdukt,
    woraus: worausAus(t, undefined, lager),
    druck: { zustand: 'fest', wert: druck ?? 'ohne' },
    wer: { zustand: 'fest', wert: zukauf ? 'lieferant' : 'haus' },
  };
  if (t.materialId === undefined && t.wareGestellt !== true)
    hinweise.push(`${t.name}: Papier fehlt – im Artikel offen`);
  if (druck === null && !zukauf) hinweise.push(`${t.name}: keine Druckzeile – unbedruckt`);
  if (t.offenesFormat !== undefined) teil.offenesFormat = t.offenesFormat;
  if (t.beschnittUm !== undefined) teil.beschnittUm = t.beschnittUm;
  // T106: Variante der Druckzeile zurück ans Teil
  const variante = k.zeilen.find(
    (z) => z.art === 'arbeitsgang' && z.druck !== undefined && teilVon(z) === t.id,
  );
  if (variante?.art === 'arbeitsgang' && variante.profil !== undefined) {
    teil.variante = variante.profil;
  }
  if (t.wareGestellt === true) {
    teil.wareGestellt = true;
    if (t.wareText !== undefined) teil.wareText = t.wareText;
  }
  const merkmale = merkmaleAus(k, p, t.id, hinweise);
  if (merkmale.length > 0) teil.merkmale = merkmale;
  return teil;
}

/** Merkmale zusammenführen: vorhandene (gleicher Name) bleiben, neue kommen dazu. */
function mitMerkmalen(
  vorher: readonly ArtikelMerkmal[] | undefined,
  neu: readonly ArtikelMerkmal[],
): ArtikelMerkmal[] {
  const liste = [...(vorher ?? [])];
  for (const m of neu) {
    if (!liste.some((x) => x.name.trim().toLowerCase() === m.name.trim().toLowerCase())) {
      liste.push(m);
    }
  }
  return liste;
}

/**
 * Artikelentwurf aus der Kalkulation.
 *
 * Mit Grundlage (k.artikelId im Bestand): Der Artikel bleibt, wie er ist; je Teil gleicher ID
 * kommen Papier (eine passende Sorte bleibt stehen) und Farbigkeit aus der Druckzeile dazu –
 * nur wo der Artikel festgelegt oder offen ist, wählbare Werte bleiben wählbar. Stück je
 * Produkt, Seiten und offenes Format bleiben (die Kalkulation leitet sie ab). Neue Teile der
 * Kalkulation kommen dazu, Teile ohne Gegenstück bleiben (Hinweis). Merkmale aus Schritten mit
 * „Im Arbeitsweg: Merkmal“ kommen dazu, wenn der Artikel sie noch nicht hat.
 *
 * Ohne Grundlage: Endformat des ersten Teils, je Teil Name, Stück je Produkt (= Nutzen je
 * Exemplar der Kalkulation), Papier, Farbigkeit, im Haus/Lieferant, offenes Format von Hand,
 * Merkmale aus den Schritten; Seiten fehlen (Hinweis).
 */
export function artikelAusKalkulation(
  k: Kalkulation,
  p: Produktion,
  lager: Pick<Lager, 'materialien'>,
  bestand: Artikelbestand,
): PruefErgebnis<ArtikelAusKalkulation> {
  const teile = k.teile ?? [];
  if (teile.length === 0) {
    return {
      ok: false,
      fehler: [{ pfad: 'teile', meldung: 'Kalkulation ohne Teile – kein Artikel' }],
    };
  }
  const hinweise: string[] = [];
  const basis = bestand.artikel.find((a) => a.id === k.artikelId);
  const produktMerkmale = merkmaleAus(k, p, null, hinweise);

  if (!basis) {
    const erstes = teile[0] as Teil;
    if (teile.some((t) => !gleich(t.endformat, erstes.endformat))) {
      hinweise.unshift(`Teile haben verschiedene Endformate – übernommen: ${erstes.name}`);
    }
    const artikel: Omit<Artikel, 'id'> = {
      titel: k.titel,
      einheit: k.einheit,
      endformat: { zustand: 'fest', wert: erstes.endformat },
      teile: [],
    };
    const teilHinweise: string[] = [];
    artikel.teile = teile.map((t) => neuesTeil(k, t, p, lager, teilHinweise));
    if (k.kunde !== undefined) artikel.kunde = k.kunde;
    if (produktMerkmale.length > 0) artikel.merkmale = produktMerkmale;
    return {
      ok: true,
      wert: {
        artikel,
        grundlage: null,
        hinweise: [
          ...new Set([
            ...teilHinweise,
            ...hinweise,
            'Seiten stehen nicht in der Kalkulation – im Artikel ergänzen',
          ]),
        ],
      },
    };
  }

  const teilHinweise: string[] = [];
  const neueTeile: ArtikelTeil[] = basis.teile.map((at) => {
    const t = teile.find((x) => x.id === at.id);
    if (!t) {
      teilHinweise.push(`${at.name}: nicht in der Kalkulation – unverändert`);
      return at;
    }
    const neu: ArtikelTeil = { ...at, woraus: worausAus(t, at.woraus, lager) };
    const druck = druckVon(k, t.id);
    if (druck !== null && at.druck.zustand !== 'waehlbar') {
      neu.druck = { zustand: 'fest', wert: druck };
    }
    if (at.woraus.zustand === 'waehlbar' || (druck !== null && at.druck.zustand === 'waehlbar')) {
      teilHinweise.push(`${at.name}: wählbare Werte bleiben wählbar`);
    }
    const merkmale = mitMerkmalen(at.merkmale, merkmaleAus(k, p, t.id, []));
    if (merkmale.length > 0) neu.merkmale = merkmale;
    return neu;
  });
  for (const t of teile) {
    if (!basis.teile.some((x) => x.id === t.id)) {
      neueTeile.push(neuesTeil(k, t, p, lager, teilHinweise));
      teilHinweise.push(`${t.name}: neues Teil – Seiten im Artikel ergänzen`);
    }
  }
  const artikel: Omit<Artikel, 'id'> = { ...basis, titel: k.titel, teile: neueTeile };
  delete (artikel as Partial<Artikel>).id;
  delete artikel.archiviert;
  const merkmale = mitMerkmalen(basis.merkmale, produktMerkmale);
  if (merkmale.length > 0) artikel.merkmale = merkmale;
  if (k.kunde !== undefined) artikel.kunde = k.kunde;
  return {
    ok: true,
    wert: { artikel, grundlage: basis.id, hinweise: [...new Set([...teilHinweise, ...hinweise])] },
  };
}

/**
 * Schreibt den Entwurf in den Bestand: „neu“ hängt an (neue ID; mit Grundlage entstandenAus =
 * Grundlage, ohne „auf Lager führen“), „aktualisieren“ ersetzt den Artikel k.artikelId (ID,
 * „auf Lager führen“, Herkunft und Archiv bleiben), „keiner“ ändert nichts.
 */
export function artikelUebernehmen(
  k: Kalkulation,
  p: Produktion,
  lager: Pick<Lager, 'materialien'>,
  bestand: Artikelbestand,
  entscheidung: ArtikelEntscheidung,
): PruefErgebnis<ArtikelUebernahme> {
  if (entscheidung === 'keiner') {
    return { ok: true, wert: { bestand, artikelId: null, hinweise: [] } };
  }
  if (entscheidung === 'aktualisieren') {
    if (k.artikelId === undefined) {
      return {
        ok: false,
        fehler: [{ pfad: 'artikelId', meldung: 'Kalkulation nennt keinen Artikel' }],
      };
    }
    if (!bestand.artikel.some((a) => a.id === k.artikelId)) {
      return {
        ok: false,
        fehler: [{ pfad: 'artikelId', meldung: `Artikel ${k.artikelId} nicht gefunden` }],
      };
    }
  }
  const entwurf = artikelAusKalkulation(k, p, lager, bestand);
  if (!entwurf.ok) return entwurf;
  const { artikel, grundlage, hinweise } = entwurf.wert;
  if (entscheidung === 'neu') {
    const neu: Record<string, unknown> = { ...artikel };
    delete neu['lager'];
    if (grundlage !== null) neu['entstandenAus'] = grundlage;
    const r = artikelHinzufuegen(bestand, neu);
    if (!r.ok) return r;
    const angelegt = r.wert.artikel.find((a) => !bestand.artikel.some((x) => x.id === a.id));
    return { ok: true, wert: { bestand: r.wert, artikelId: angelegt?.id ?? null, hinweise } };
  }
  const alt = bestand.artikel.find((a) => a.id === k.artikelId) as Artikel;
  const ersatz: Artikel = { ...artikel, id: alt.id };
  if (alt.archiviert) ersatz.archiviert = true;
  const r = artikelAendern(bestand, ersatz);
  if (!r.ok) return r;
  return { ok: true, wert: { bestand: r.wert, artikelId: alt.id, hinweise } };
}
