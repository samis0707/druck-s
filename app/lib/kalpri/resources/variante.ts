import { anzahlAusAngaben } from './angaben';
import type { Kalkulation, Zeile } from './kalkulation-schema';
import type { Produktion } from './produktion-schema';

/**
 * T129: Variante (Ausführung) an einer Arbeitsgang-Zeile setzen ('' = Grundwerte). Der Faktor der
 * Menge kommt von der Variante (z. B. Nagel 4-fach: 2 Durchgänge); hat die neue keinen, entfällt
 * ein Faktor, der von der vorigen Variante stammt. Eigene Faktoren bleiben.
 */
export function zeileMitVariante(
  k: Kalkulation,
  zeileId: string,
  p: Pick<Produktion, 'arbeitsplaetze'>,
  name: string,
): Kalkulation {
  return {
    ...k,
    zeilen: k.zeilen.map((z) => (z.id === zeileId ? varianteAnZeile(z, p, name) : z)),
  };
}

/** Variante an einer Zeile (nur Arbeitsgang); siehe zeileMitVariante. */
export function varianteAnZeile(
  z: Zeile,
  p: Pick<Produktion, 'arbeitsplaetze'>,
  name: string,
): Zeile {
  if (z.art !== 'arbeitsgang') return z;
  const profile =
    (p.arbeitsplaetze ?? [])
      .find((x) => x.id === z.platzId)
      ?.schritte.find((s) => s.schrittId === z.schrittId)?.profile ?? [];
  const alt = profile.find((v) => v.name === z.profil);
  const neu = profile.find((v) => v.name === name);
  const zeile = { ...z };
  if (name === '') delete zeile.profil;
  else zeile.profil = name;
  const m = zeile.menge;
  // Faktor gibt es bei Auflage, Papierweg und Produkt (nicht bei „von Hand“ und „je Auftrag“).
  // Wie im Formular (zeileNachVariante): Mit Variante zählt ihr Faktor; die Zahl aus den Angaben
  // („4-fach“) oder ein Faktor der vorigen Variante vervielfacht die Menge nicht.
  if (m.art === 'auflage' || m.art === 'papierweg' || m.art === 'produkt') {
    const menge = { ...m };
    const vonVariante = [
      alt?.faktor,
      anzahlAusAngaben(alt?.angaben),
      neu === undefined ? undefined : anzahlAusAngaben(neu.angaben),
      anzahlAusAngaben(z.angaben),
    ];
    if (neu?.faktor !== undefined) menge.faktor = neu.faktor;
    else if (menge.faktor !== undefined && vonVariante.includes(menge.faktor)) delete menge.faktor;
    zeile.menge = menge;
  }
  return zeile;
}
