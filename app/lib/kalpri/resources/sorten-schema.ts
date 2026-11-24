import { z } from 'zod/v3';

/**
 * T169: Lieferantensorten mit Preis je 100 kg (Nutzer 17.11.: „pro Lieferant einfach die Sorten
 * anpassen“). Eine Sorte gehört zu einem **Hauspapier** – dem eigenen Papiernamen, den die
 * Materialien im Feld `sorte` tragen (z. B. „Bilderdruck halbmatt“). Alle Materialien dieses
 * Hauspapiers (jede Grammatur, jedes Format, jede Laufrichtung) bekommen den Sortenpreis; der
 * Bogenpreis ergibt sich aus Gewicht × Preis je 100 kg.
 *
 * Preise werden nur angehängt (Historie), wie bei den Materialpreisen.
 */
const idFeld = (praefix: string) =>
  z
    .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
    .trim()
    .regex(new RegExp(`^${praefix}-\\d{4,}$`), `ID im Format ${praefix}-0001`);

const text = (max: number) =>
  z
    .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
    .trim()
    .min(1, 'Pflichtfeld')
    .max(max, `höchstens ${max} Zeichen`);

export const LieferantenSorteSchema = z.object({
  id: idFeld('LS'),
  /** Hauspapier = `sorte` der Materialien (ohne Groß-/Kleinschreibung verglichen). */
  papier: text(120),
  /** Name beim Lieferanten, z. B. „GardaMatt Art“. */
  name: text(120),
  /** Lieferant (Name wie in den Preisen; Partner über Name oder „Namen in Preisen“). */
  lieferant: text(80),
  artikelnummer: text(60).optional(),
  /** Nur diese Grammaturen (g/m²); fehlt: alle Grammaturen des Hauspapiers. */
  grammaturVon: z.number().int().positive().optional(),
  grammaturBis: z.number().int().positive().optional(),
});
export type LieferantenSorte = z.infer<typeof LieferantenSorteSchema>;

export const SortenPreisSchema = z.object({
  id: idFeld('SP'),
  sorteId: idFeld('LS'),
  gueltigAb: z
    .string({ required_error: 'Pflichtfeld' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT'),
  /** Preis je 100 kg in Zehntelcent. */
  je100kgZehntelcent: z
    .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
    .int('muss eine ganze Zahl sein')
    .positive('muss größer als 0 sein'),
  /** Woher: „von Hand“, „Anpassung +4 %“ … */
  anlass: text(120).optional(),
});
export type SortenPreis = z.infer<typeof SortenPreisSchema>;
