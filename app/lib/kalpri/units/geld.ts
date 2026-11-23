import { rundeKaufmaennisch } from './runden';

export type Geld = { readonly zehntelcent: number; readonly __art: 'Geld' };

function normiereNull(wert: number): number {
  if (Object.is(wert, -0)) {
    return 0;
  }
  return wert;
}

export function euro(wert: number): Geld {
  if (Number.isNaN(wert) || !Number.isFinite(wert)) {
    throw new RangeError(`Ungültiger Geldbetrag: ${wert}`);
  }
  const zehntel = rundeKaufmaennisch(wert * 1000);
  return { zehntelcent: normiereNull(zehntel), __art: 'Geld' };
}

export function zehntelcent(wert: number): Geld {
  if (Number.isNaN(wert) || !Number.isFinite(wert)) {
    throw new RangeError(`Ungültiger Geldbetrag: ${wert}`);
  }
  if (!Number.isInteger(wert)) {
    throw new RangeError(`Ungültiger Geldbetrag: ${wert}`);
  }
  return { zehntelcent: normiereNull(wert), __art: 'Geld' };
}

export function plusG(a: Geld, b: Geld): Geld {
  return { zehntelcent: normiereNull(a.zehntelcent + b.zehntelcent), __art: 'Geld' };
}

export function minusG(a: Geld, b: Geld): Geld {
  return { zehntelcent: normiereNull(a.zehntelcent - b.zehntelcent), __art: 'Geld' };
}

export function malG(a: Geld, faktor: number): Geld {
  if (Number.isNaN(faktor) || !Number.isFinite(faktor)) {
    throw new RangeError(`Ungültiger Geldbetrag: ${faktor}`);
  }
  const result = rundeKaufmaennisch(a.zehntelcent * faktor);
  return { zehntelcent: normiereNull(result), __art: 'Geld' };
}

export function summeG(liste: readonly Geld[]): Geld {
  if (liste.length === 0) {
    return { zehntelcent: 0, __art: 'Geld' };
  }
  let sum = 0;
  for (const g of liste) {
    sum += g.zehntelcent;
  }
  return { zehntelcent: normiereNull(sum), __art: 'Geld' };
}

export function formatEuro(g: Geld): string {
  const cent = rundeKaufmaennisch(g.zehntelcent / 10);
  const euroWert = cent / 100;
  const formatted = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euroWert);
  return `${formatted} €`;
}
