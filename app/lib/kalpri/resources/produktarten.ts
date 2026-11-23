import { weiterverarbeitungen } from './arbeitsweg';
import type { Artikel, ArtikelMerkmal, ArtikelTeil } from './artikel-schema';
import { neuesProduktTeil } from './kalkulation-produkt';
import type { Produktion } from './produktion-schema';
import type { Einheit } from '@druck/units';

/**
 * T136: Produktarten für den Einstieg „Was willst du kalkulieren?“ (angelehnt an Keyline:
 * Vorlagen mit Kategorie). Eine Art füllt die Beschreibung vor – Teile, übliche Farbigkeit,
 * Seiten und die passende Weiterverarbeitung aus dem eigenen Katalog (nur, wenn es sie dort
 * gibt). `ware` = Arbeit an gelieferter Ware: kein Produkt, der Arbeitsablauf entsteht mit
 * „+ Schritt“.
 */
export const PRODUKTARTEN = [
  {
    art: 'frei',
    name: 'Ganz neu (ohne Vorlage)',
    beispiel: 'leer anfangen, alles selbst festlegen',
  },
  { art: 'flyer', name: 'Flyer', beispiel: 'beidseitig, ein Blatt' },
  { art: 'visitenkarte', name: 'Visitenkarte', beispiel: '85 × 55 mm' },
  { art: 'broschuere', name: 'Broschüre', beispiel: 'Umschlag und Inhalt, geheftet' },
  { art: 'register', name: 'Register', beispiel: 'Sätze aus Registerblättern' },
  {
    art: 'loseblatt',
    name: 'Loseblatt',
    beispiel: 'Blätter je Satz, zusammengetragen, gebohrt',
  },
  { art: 'block', name: 'Block', beispiel: 'Blätter und Rückenpappe, geleimt' },
  { art: 'plakat', name: 'Plakat', beispiel: 'einseitig, A2 bis A0' },
  { art: 'ware', name: 'Arbeit an gelieferter Ware', beispiel: 'nur stanzen, bohren, verpacken …' },
] as const;

export type Produktart = (typeof PRODUKTARTEN)[number]['art'];

const VORNE = { vorne: { farbe: 'farbig' } } as const;

/** Erste Weiterverarbeitung des Katalogs, deren Text eines der Wörter enthält. */
function merkmalAusKatalog(
  p: Produktion,
  ebene: 'teil' | 'produkt',
  woerter: readonly string[],
): ArtikelMerkmal[] {
  const treffer = weiterverarbeitungen(p).find(
    (w) => w.ebene === ebene && woerter.some((x) => w.text.toLowerCase().includes(x)),
  );
  return treffer
    ? [{ name: treffer.merkmal.name, wert: { zustand: 'fest', wert: treffer.merkmal.wert } }]
    : [];
}

/** Vorbefülltes Produkt für die Art; null bei „Arbeit an gelieferter Ware“. */
export function produktDerArt(
  art: Produktart,
  kopf: { titel: string; einheit: Einheit },
  p: Produktion,
): Artikel | null {
  if (art === 'ware') return null;
  const teil = (nr: number, dazu: Partial<ArtikelTeil>): ArtikelTeil =>
    ({ ...neuesProduktTeil(nr), ...dazu }) as ArtikelTeil;
  const produkt: Artikel = {
    id: 'PRODUKT',
    titel: kopf.titel,
    einheit: kopf.einheit,
    endformat: { zustand: 'offen' },
    teile: [neuesProduktTeil(1)],
  };
  const mit = (m: ArtikelMerkmal[]) => {
    if (m.length > 0) produkt.merkmale = m;
  };
  if (art === 'flyer') produkt.teile = [teil(1, { name: 'Flyer' })];
  if (art === 'visitenkarte') {
    produkt.teile = [teil(1, { name: 'Karte' })];
    produkt.endformat = { zustand: 'fest', wert: { breiteUm: 85_000, hoeheUm: 55_000 } };
  }
  if (art === 'plakat') {
    produkt.teile = [teil(1, { name: 'Plakat', druck: { zustand: 'fest', wert: VORNE } })];
  }
  if (art === 'broschuere') {
    produkt.teile = [
      teil(1, { name: 'Umschlag', seiten: { zustand: 'fest', wert: 4 }, liegtUm: 'T2' }),
      teil(2, { name: 'Inhalt', seiten: { zustand: 'fest', wert: 8 } }),
    ];
    mit(merkmalAusKatalog(p, 'produkt', ['rückstich', 'heften']));
  }
  if (art === 'register') {
    const m = merkmalAusKatalog(p, 'teil', ['register']);
    produkt.teile = [
      teil(1, { name: 'Registerblatt', jeProdukt: 10, ...(m.length > 0 ? { merkmale: m } : {}) }),
    ];
  }
  if (art === 'loseblatt') {
    // T138: Sätze aus losen Blättern – gebohrt am Blatt, zusammengetragen je Satz
    const bohren = merkmalAusKatalog(p, 'teil', ['bohren', 'lochen']);
    produkt.teile = [
      teil(1, {
        name: 'Blatt',
        jeProdukt: 10,
        ...(bohren.length > 0 ? { merkmale: bohren } : {}),
      }),
    ];
    mit(merkmalAusKatalog(p, 'produkt', ['zusammentragen', 'sortieren']));
  }
  if (art === 'block') {
    produkt.teile = [
      teil(1, { name: 'Blatt', jeProdukt: 25, druck: { zustand: 'fest', wert: VORNE } }),
      teil(2, { name: 'Rückenpappe', druck: { zustand: 'fest', wert: 'ohne' } }),
    ];
    mit(merkmalAusKatalog(p, 'produkt', ['blockleim', 'leim']));
  }
  return produkt;
}
