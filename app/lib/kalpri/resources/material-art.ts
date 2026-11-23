import type { Material } from './material';
import type { Produktion } from './produktion-schema';

/**
 * T122: Bedruckstoff oder Verbrauchsmaterial – bis die Datenbank ein festes Feld „Art“ hat,
 * abgeleitet: Kategorie Papier, Kuvert, Tüte, Verpackung → Bedruckstoff; Kategorie „sonstiges“
 * oder Form „Menge“ (ml, g, Stück) → Verbrauchsmaterial (Folie, Tinte, Klammern, Pappe, Leim).
 * Rechnet nie anders – nur zum Ordnen und Filtern.
 */
export type MaterialArt = 'bedruckstoff' | 'verbrauch';

export function materialArt(m: Pick<Material, 'form' | 'kategorie'>): MaterialArt {
  if (m.form === 'Menge' || m.kategorie === 'sonstiges') return 'verbrauch';
  return 'bedruckstoff';
}

/**
 * Wo ein Material als Verbrauch hinterlegt ist: „Maschine · Gruppe“ (Verbrauchsmaterial der
 * Maschine) bzw. „Maschine · Tätigkeit“ (Verbrauch am Schritt, älterer Stand). Ohne Doppelte.
 */
export function materialVerwendung(
  p: Pick<Produktion, 'arbeitsplaetze' | 'arbeitsschritte'>,
  materialId: string,
): string[] {
  const aus: string[] = [];
  const dazu = (t: string) => {
    if (!aus.includes(t)) aus.push(t);
  };
  const schrittName = (id: string) => p.arbeitsschritte.find((s) => s.id === id)?.name ?? id;
  for (const platz of p.arbeitsplaetze ?? []) {
    for (const v of platz.verbrauchsmaterial ?? []) {
      if (v.materialId === materialId) dazu(`${platz.name} · ${v.gruppe}`);
    }
    for (const s of platz.schritte) {
      if ((s.verbrauch ?? []).some((v) => v.materialId === materialId)) {
        dazu(`${platz.name} · ${schrittName(s.schrittId)}`);
      }
    }
  }
  return aus;
}
