export const EINHEITEN = [
  'Bogen',
  'Bogenseite',
  'Laufmeter',
  'm2',
  'Platte',
  'Stueck',
  'Klick',
  'Stunde',
  'Einsatz',
  'Durchgang',
  'Exemplar',
  'Nutzen',
  'Blatt',
  'Satz',
  'Lage',
  'Schnitt',
  'Hub',
  'Ecke',
  'Stapel',
  'Buendel',
  'Paket',
  'Auftrag',
] as const;
export type Einheit = (typeof EINHEITEN)[number];

export const GANZZAHLIGE_EINHEITEN: readonly Einheit[] = [
  'Bogen',
  'Bogenseite',
  'Platte',
  'Stueck',
  'Klick',
  'Einsatz',
  'Durchgang',
  'Exemplar',
  'Nutzen',
  'Blatt',
  'Satz',
  'Lage',
  'Schnitt',
  'Hub',
  'Ecke',
  'Stapel',
  'Buendel',
  'Paket',
  'Auftrag',
];

export type Menge<E extends Einheit> = { readonly wert: number; readonly einheit: E };

function istGanzzahligEinheit(einheit: Einheit): boolean {
  return (GANZZAHLIGE_EINHEITEN as readonly string[]).includes(einheit);
}

function pruefeMengeWert(wert: number, einheit: Einheit): void {
  if (Number.isNaN(wert) || !Number.isFinite(wert)) {
    throw new RangeError(`Ungültige Menge: ${wert}`);
  }
  if (wert < 0) {
    throw new RangeError(`Menge darf nicht negativ sein: ${wert}`);
  }
  if (istGanzzahligEinheit(einheit) && !Number.isInteger(wert)) {
    throw new RangeError(`${einheit} muss ganzzahlig sein: ${wert}`);
  }
}

export function menge<E extends Einheit>(wert: number, einheit: E): Menge<E> {
  pruefeMengeWert(wert, einheit);
  return { wert, einheit };
}

export function plusM<E extends Einheit>(a: Menge<E>, b: Menge<NoInfer<E>>): Menge<E> {
  if (a.einheit !== b.einheit) {
    throw new TypeError(`Einheiten passen nicht: ${a.einheit} + ${b.einheit}`);
  }
  return { wert: a.wert + b.wert, einheit: a.einheit };
}

export function malM<E extends Einheit>(a: Menge<E>, faktor: number): Menge<E> {
  if (Number.isNaN(faktor) || !Number.isFinite(faktor) || faktor < 0) {
    throw new RangeError(`Ungültiger Faktor: ${faktor}`);
  }
  let wert: number;
  if (istGanzzahligEinheit(a.einheit)) {
    wert = Math.ceil(a.wert * faktor);
  } else {
    wert = a.wert * faktor;
  }
  if (Object.is(wert, -0)) {
    wert = 0;
  }
  return { wert, einheit: a.einheit };
}

function formatZahlDeutsch(wert: number, maxFractionDigits: number): string {
  return new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: maxFractionDigits,
  }).format(wert);
}

const ANZEIGENAMEN: Record<Einheit, { readonly einzahl: string; readonly mehrzahl: string }> = {
  Bogen: { einzahl: 'Bogen', mehrzahl: 'Bogen' },
  Bogenseite: { einzahl: 'Bogenseite', mehrzahl: 'Bogenseiten' },
  Laufmeter: { einzahl: 'Laufmeter', mehrzahl: 'Laufmeter' },
  m2: { einzahl: 'm²', mehrzahl: 'm²' },
  Platte: { einzahl: 'Platte', mehrzahl: 'Platten' },
  Stueck: { einzahl: 'Stück', mehrzahl: 'Stück' },
  Klick: { einzahl: 'Klick', mehrzahl: 'Klicks' },
  Stunde: { einzahl: 'Std.', mehrzahl: 'Std.' },
  Einsatz: { einzahl: 'Einsatz', mehrzahl: 'Einsätze' },
  Durchgang: { einzahl: 'Durchgang', mehrzahl: 'Durchgänge' },
  Exemplar: { einzahl: 'Exemplar', mehrzahl: 'Exemplare' },
  Nutzen: { einzahl: 'Nutzen', mehrzahl: 'Nutzen' },
  Blatt: { einzahl: 'Blatt', mehrzahl: 'Blatt' },
  Satz: { einzahl: 'Satz', mehrzahl: 'Sätze' },
  Lage: { einzahl: 'Lage', mehrzahl: 'Lagen' },
  Schnitt: { einzahl: 'Schnitt', mehrzahl: 'Schnitte' },
  Hub: { einzahl: 'Hub', mehrzahl: 'Hübe' },
  Ecke: { einzahl: 'Ecke', mehrzahl: 'Ecken' },
  Stapel: { einzahl: 'Stapel', mehrzahl: 'Stapel' },
  Buendel: { einzahl: 'Bündel', mehrzahl: 'Bündel' },
  Paket: { einzahl: 'Paket', mehrzahl: 'Pakete' },
  Auftrag: { einzahl: 'Auftrag', mehrzahl: 'Aufträge' },
};

export function einheitAnzeige(einheit: Einheit, wert?: number): string {
  const namen = ANZEIGENAMEN[einheit];
  return wert === 1 ? namen.einzahl : namen.mehrzahl;
}

export function formatMenge(m: Menge<Einheit>): string {
  const anzeigeName = einheitAnzeige(m.einheit, m.wert);

  if (m.einheit === 'm2' || m.einheit === 'Stunde' || m.einheit === 'Laufmeter') {
    return `${formatZahlDeutsch(m.wert, 2)} ${anzeigeName}`;
  } else if (istGanzzahligEinheit(m.einheit)) {
    return `${formatZahlDeutsch(m.wert, 0)} ${anzeigeName}`;
  } else {
    return `${formatZahlDeutsch(m.wert, 2)} ${anzeigeName}`;
  }
}
