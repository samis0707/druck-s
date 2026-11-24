import { z } from 'zod/v3';

/**
 * Tag des kontrollierten Katalogs (T69). Die ID ist ein Bezeichner ohne Umlaute
 * (Buchstaben, Ziffern, `_`, `-`), der Name ist der Anzeigename.
 */
export const TagSchema = z.object({
  id: z
    .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
    .trim()
    .min(1, 'Pflichtfeld')
    .max(40, 'höchstens 40 Zeichen')
    .regex(/^[A-Za-z0-9_-]+$/, 'nur Buchstaben, Ziffern, _ und -'),
  name: z
    .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
    .trim()
    .min(1, 'Pflichtfeld')
    .max(80, 'höchstens 80 Zeichen'),
});

export type Tag = z.infer<typeof TagSchema>;
