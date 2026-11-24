import { z } from 'zod/v3';

/**
 * Einkaufsgruppe (T70; fachliche Bezeichnung der T68-Materialgruppe, Code-Bezeichner
 * bleiben `gruppe`/`gruppeId`, weil gespeicherte Daten davon abhängen): eine Liste im
 * Lager, die der Nutzer selbst pflegt (anlegen, umbenennen, löschen). Sie ist nur für
 * die Preisanpassung da, damit sich Preisanpassungen auf ganze Materiallisten mit einem
 * Schlag anpassen lassen; nicht verwechseln mit den Preisgruppen im Verkauf.
 * oberflaeche = Bezug für Dicke und Volumen (ungestrichen, gestrichen, beschichtet);
 * beim Zuordnen übernimmt das Material sie, wenn es selbst keine hat.
 */
export const MaterialGruppeSchema = z.object({
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
    .max(60, 'höchstens 60 Zeichen'),
  oberflaeche: z
    .enum(['ungestrichen', 'gestrichen', 'beschichtet'], {
      message: 'Oberfläche muss ungestrichen, gestrichen oder beschichtet sein',
    })
    .optional(),
});

export type MaterialGruppe = z.infer<typeof MaterialGruppeSchema>;

/** Vorbelegte Gruppen, solange das Lager keine eigene Liste hat (Nutzer 30.10., ohne „halbmatt“).
 *  Fachlich heißen sie Einkaufsgruppen (T70). */
export const STANDARD_GRUPPEN: readonly MaterialGruppe[] = [
  { id: 'offset', name: 'Offset / ungestrichen', oberflaeche: 'ungestrichen' },
  { id: 'preprint', name: 'Preprint', oberflaeche: 'ungestrichen' },
  { id: 'matt', name: 'gestrichen matt', oberflaeche: 'gestrichen' },
  { id: 'glanz', name: 'gestrichen glänzend', oberflaeche: 'gestrichen' },
  { id: 'silk', name: 'gestrichen silk', oberflaeche: 'gestrichen' },
  { id: 'struktur', name: 'strukturiert' },
  { id: 'folie', name: 'Folie / beschichtet', oberflaeche: 'beschichtet' },
];
