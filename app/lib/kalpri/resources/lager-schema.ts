import { z } from 'zod/v3';
import { MaterialSchema, druckbogenMeldung } from './material';
import { MaterialGruppeSchema, STANDARD_GRUPPEN } from './material-gruppe-schema';
import { PreisanpassungSchema } from './preisanpassung-schema';
import { PreisSchema } from './preis-schema';
import { LieferantenSorteSchema, SortenPreisSchema } from './sorten-schema';
import { LagerStanzformSchema } from './stanzform-schema';
import { TagSchema } from './tag-schema';
import { ausZod, type PruefErgebnis } from './pruefung';

const lagerortFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld');

/** Menge in ganzen Einheiten (Bogen, Rolle, Stueck), nicht negativ. */
const mengeFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

const einheitFeld = z.enum(['Bogen', 'Rolle', 'Stueck'], {
  message: 'Einheit muss Bogen, Rolle oder Stueck sein',
});

const versionFeld = z.literal(1, {
  errorMap: (issue, ctx) => {
    if (issue.code === z.ZodIssueCode.invalid_literal) {
      return { message: issue.received === undefined ? 'Pflichtfeld' : 'Version muss 1 sein' };
    }
    return { message: ctx.defaultError };
  },
});

export const BestandSchema = z
  .object({
    materialId: z.string({
      required_error: 'Pflichtfeld',
      invalid_type_error: 'muss ein Text sein',
    }),
    lagerort: lagerortFeld,
    menge: mengeFeld,
    einheit: einheitFeld,
    reserviert: mengeFeld,
  })
  .superRefine((bestand, ctx) => {
    if (bestand.reserviert > bestand.menge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reserviert'],
        message: 'Reserviert ist größer als Menge',
      });
    }
  });

export type Bestand = z.infer<typeof BestandSchema>;

/** T180: benannte Aufschlag-Art für Verbrauchsmaterial (z. B. „Kleinteile 25 %“). */
export const AufschlagArtSchema = z.object({
  id: z.string().regex(/^AA-\d{4}$/, 'ID im Format AA-0001'),
  name: z.string().trim().min(1, 'Pflichtfeld').max(60, 'höchstens 60 Zeichen'),
  prozent: z
    .number({ invalid_type_error: 'muss eine Zahl sein' })
    .min(0, 'darf nicht negativ sein')
    .max(1000, 'höchstens 1000'),
});
export type AufschlagArt = z.infer<typeof AufschlagArtSchema>;

export const LagerSchema = z
  .object({
    version: versionFeld,
    materialien: z.array(MaterialSchema),
    bestaende: z.array(BestandSchema),
    preise: z.array(PreisSchema).optional(),
    stanzformen: z.array(LagerStanzformSchema).optional(),
    /** Materialgruppen (Nutzer 30.10.); fehlt: STANDARD_GRUPPEN. */
    gruppen: z.array(MaterialGruppeSchema).optional(),
    /** Tag-Katalog (T69, kontrollierte Liste), Startbestand leer. */
    tags: z.array(TagSchema).optional(),
    /** Einträge der Sammelaktion „Preise anpassen“ (T70); anhängend, Startbestand leer. */
    preisanpassungen: z.array(PreisanpassungSchema).optional(),
    /** T169: Lieferantensorten (Preis je 100 kg für alle Grammaturen eines Hauspapiers). */
    sorten: z.array(LieferantenSorteSchema).optional(),
    /** T169: Preise der Sorten, nur anhängen. */
    sortenPreise: z.array(SortenPreisSchema).optional(),
    /** T180: Standard-Aufschlag in % auf Verbrauchsmaterial (Verbrauch an Maschinen); ein
     *  Aufschlag am Material geht vor. Fehlt = 0 %. */
    verbrauchAufschlagProzent: z
      .number({ invalid_type_error: 'muss eine Zahl sein' })
      .min(0, 'darf nicht negativ sein')
      .max(1000, 'höchstens 1000')
      .optional(),
    /** T180: Aufschlag-Arten, je Material wählbar. */
    aufschlagArten: z.array(AufschlagArtSchema).optional(),
  })
  .superRefine((lager, ctx) => {
    // T180: Aufschlag-Arten eindeutig, Verweise der Materialien gültig
    const artIds = new Set<string>();
    (lager.aufschlagArten ?? []).forEach((a, index) => {
      if (artIds.has(a.id))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['aufschlagArten', index, 'id'],
          message: `ID doppelt: ${a.id}`,
        });
      artIds.add(a.id);
    });
    lager.materialien.forEach((m, index) => {
      if (m.aufschlagArtId !== undefined && !artIds.has(m.aufschlagArtId))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['materialien', index, 'aufschlagArtId'],
          message: `Aufschlag-Art ${m.aufschlagArtId} gibt es nicht`,
        });
    });
    // T169: Sorten – IDs eindeutig, Preise gehören zu einer Sorte
    const sortenIds = new Set<string>();
    (lager.sorten ?? []).forEach((sorte, index) => {
      if (sortenIds.has(sorte.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sorten', index, 'id'],
          message: `ID doppelt: ${sorte.id}`,
        });
      }
      sortenIds.add(sorte.id);
      if (
        sorte.grammaturVon !== undefined &&
        sorte.grammaturBis !== undefined &&
        sorte.grammaturVon > sorte.grammaturBis
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sorten', index, 'grammaturBis'],
          message: 'Grammatur bis ist kleiner als von',
        });
      }
    });
    const spIds = new Set<string>();
    (lager.sortenPreise ?? []).forEach((preis, index) => {
      if (spIds.has(preis.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sortenPreise', index, 'id'],
          message: `ID doppelt: ${preis.id}`,
        });
      }
      spIds.add(preis.id);
      if (!sortenIds.has(preis.sorteId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sortenPreise', index, 'sorteId'],
          message: `Sorte ${preis.sorteId} nicht gefunden`,
        });
      }
    });
    // Tags: ID und Name je einmal; Materialien kennen nur Tag-IDs aus dem Katalog
    const tagIds = new Set<string>();
    (lager.tags ?? []).forEach((tag, index) => {
      if (tagIds.has(tag.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tags', index, 'id'],
          message: `ID doppelt: ${tag.id}`,
        });
      }
      tagIds.add(tag.id);
    });
    lager.materialien.forEach((material, index) => {
      material.tags?.forEach((tagId, tagIndex) => {
        if (!tagIds.has(tagId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['materialien', index, 'tags', tagIndex],
            message: `Tag ${tagId} nicht gefunden`,
          });
        }
      });
    });
    // Gruppen: ID und Name je einmal; Material verweist nur auf vorhandene Gruppen
    const gruppen = lager.gruppen ?? STANDARD_GRUPPEN;
    const gruppenIds = new Set<string>();
    const gruppenNamen = new Set<string>();
    (lager.gruppen ?? []).forEach((g, index) => {
      if (gruppenIds.has(g.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gruppen', index, 'id'],
          message: `ID doppelt: ${g.id}`,
        });
      }
      gruppenIds.add(g.id);
      const name = g.name.toLowerCase();
      if (gruppenNamen.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gruppen', index, 'name'],
          message: `Gruppe doppelt: ${g.name}`,
        });
      }
      gruppenNamen.add(name);
    });
    lager.materialien.forEach((material, index) => {
      if (material.gruppeId !== undefined && !gruppen.some((g) => g.id === material.gruppeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['materialien', index, 'gruppeId'],
          message: `Gruppe ${material.gruppeId} nicht gefunden`,
        });
      }
    });

    lager.materialien.forEach((material, index) => {
      const meldung = druckbogenMeldung(material);
      if (meldung !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['materialien', index, 'druckbogen'],
          message: meldung,
        });
      }
    });

    const positionen = new Map<string, number>();
    lager.materialien.forEach((material, index) => {
      if (positionen.has(material.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['materialien', index, 'id'],
          message: `ID doppelt: ${material.id}`,
        });
      } else {
        positionen.set(material.id, index);
      }
    });

    const materialien = new Map(lager.materialien.map((material) => [material.id, material]));
    lager.bestaende.forEach((bestand, index) => {
      const material = materialien.get(bestand.materialId);
      if (!material) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bestaende', index, 'materialId'],
          message: `Material ${bestand.materialId} nicht gefunden`,
        });
        return;
      }
      if (bestand.einheit !== material.form) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bestaende', index, 'einheit'],
          message: `Einheit passt nicht zur Form: ${material.form} erwartet`,
        });
      }
    });

    const preisIds = new Set<string>();
    (lager.preise ?? []).forEach((preis, index) => {
      if (preisIds.has(preis.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['preise', index, 'id'],
          message: `ID doppelt: ${preis.id}`,
        });
      } else {
        preisIds.add(preis.id);
      }
      const material = materialien.get(preis.materialId);
      if (!material) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['preise', index, 'materialId'],
          message: `Material ${preis.materialId} nicht gefunden`,
        });
        return;
      }
      if (preis.basis === 'je100kg' && material.form !== 'Bogen' && material.form !== 'Rolle') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['preise', index, 'basis'],
          message: 'je 100 kg nur bei Bogen und Rolle',
        });
      }
      if (
        preis.basis === 'je1000' &&
        material.form !== 'Bogen' &&
        material.form !== 'Stueck' &&
        material.form !== 'Menge'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['preise', index, 'basis'],
          message: 'je 1000 nur bei Bogen und Stück',
        });
      }
    });

    const stanzformIds = new Set<string>();
    (lager.stanzformen ?? []).forEach((form, index) => {
      if (stanzformIds.has(form.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stanzformen', index, 'id'],
          message: `ID doppelt: ${form.id}`,
        });
      } else {
        stanzformIds.add(form.id);
      }
    });
  });

export type Lager = z.infer<typeof LagerSchema>;

export function pruefeLager(input: unknown): PruefErgebnis<Lager> {
  return ausZod(LagerSchema.safeParse(input));
}
