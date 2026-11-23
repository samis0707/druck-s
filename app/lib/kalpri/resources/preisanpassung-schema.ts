import { z } from 'zod';

const lieferantFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(80, 'höchstens 80 Zeichen');

const gruppeIdFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(40, 'höchstens 40 Zeichen');

const gueltigAbFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT')
  .refine(istEchtesDatum, 'Datum im Format JJJJ-MM-TT');

/** Prüft Text JJJJ-MM-TT auf ein echtes Kalenderdatum (2026-02-30 ist ungültig). */
function istEchtesDatum(wert: string): boolean {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
  if (!treffer) {
    return false;
  }
  const jahr = Number(treffer[1]);
  const monat = Number(treffer[2]);
  const tag = Number(treffer[3]);
  const datum = new Date(Date.UTC(jahr, monat - 1, tag));
  return (
    datum.getUTCFullYear() === jahr &&
    datum.getUTCMonth() === monat - 1 &&
    datum.getUTCDate() === tag
  );
}

/** Prozent der Sammelaktion (+/-); unter -100 ließe der Faktor keine positiven Preise zu. */
const prozentFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .finite('muss eine endliche Zahl sein')
  .gt(-100, 'muss größer als -100 sein');

/** ISO-Zeitstempel (UTC), wie ihn `new Date().toISOString()` liefert. */
const wannFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,
    'Zeitpunkt im Format ISO, z. B. 2026-10-30T12:00:00.000Z',
  );

const materialienFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

/**
 * Eingabe der Sammelaktion „Preise anpassen“ (T70): Lieferant, Einkaufsgruppe,
 * gültig ab und Prozent (+/-).
 */
export const PreisanpassungEingabeSchema = z.object({
  lieferant: lieferantFeld,
  gruppeId: gruppeIdFeld,
  gueltigAb: gueltigAbFeld,
  prozent: prozentFeld,
});

/** Ausführung: die Eingabe plus der Zeitpunkt des Ausführens (`wann`, „wer“ gibt es nicht). */
export const PreisanpassungBefehlSchema = PreisanpassungEingabeSchema.extend({ wann: wannFeld });

/** Gespeicherter Eintrag einer ausgeführten Anpassung (im Lager, nie überschrieben). */
export const PreisanpassungSchema = PreisanpassungBefehlSchema.extend({
  materialien: materialienFeld,
});

export type PreisanpassungEingabe = z.infer<typeof PreisanpassungEingabeSchema>;
export type Preisanpassung = z.infer<typeof PreisanpassungSchema>;
