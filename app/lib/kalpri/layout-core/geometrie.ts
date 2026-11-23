import { z } from 'zod';

/** Rechteck in ganzzahligen µm. Ursprung ist die linke Ecke der Greiferkante. */
export const RechteckSchema = z.object({
  xUm: z
    .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
    .int('muss eine ganze Zahl sein')
    .min(0, 'darf nicht negativ sein'),
  yUm: z
    .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
    .int('muss eine ganze Zahl sein')
    .min(0, 'darf nicht negativ sein'),
  breiteUm: z
    .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
    .int('muss eine ganze Zahl sein')
    .gt(0, 'muss größer als 0 sein'),
  hoeheUm: z
    .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
    .int('muss eine ganze Zahl sein')
    .gt(0, 'muss größer als 0 sein'),
});

export type Rechteck = z.infer<typeof RechteckSchema>;

/** true, wenn innen vollständig in aussen liegt (Ränder dürfen sich berühren). */
export function liegtIn(innen: Rechteck, aussen: Rechteck): boolean {
  return (
    innen.xUm >= aussen.xUm &&
    innen.yUm >= aussen.yUm &&
    innen.xUm + innen.breiteUm <= aussen.xUm + aussen.breiteUm &&
    innen.yUm + innen.hoeheUm <= aussen.yUm + aussen.hoeheUm
  );
}

/** true, wenn sich die Flächen echt überschneiden (bloßes Berühren an einer Kante ist keine Überlappung). */
export function ueberlappen(a: Rechteck, b: Rechteck): boolean {
  return (
    a.xUm < b.xUm + b.breiteUm &&
    b.xUm < a.xUm + a.breiteUm &&
    a.yUm < b.yUm + b.hoeheUm &&
    b.yUm < a.yUm + a.hoeheUm
  );
}
