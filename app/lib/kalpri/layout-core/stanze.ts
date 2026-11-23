import { z } from 'zod';
import { RechteckSchema, liegtIn, ueberlappen, type Rechteck } from './geometrie';
import { ausZod, type Fehler, type PruefErgebnis } from './pruefung';

/** Positive ganze Zahl in µm (Endformat, Bogen, Slot-Nummern). */
const positiveZahl = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein');

/** Nicht negative ganze Zahl in µm (Ränder, Beschnitt, Steg, Abstand). */
const abstand = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

/** Nicht leerer Text (Name, Nutzen-ID). */
const text = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld');

/**
 * Tiegel: größtes Format der Stanze. Breite entlang der Greiferkante, Höhe von der Greiferkante
 * weg, Greiferrand an der Greiferkante.
 */
export const TiegelSchema = z.object({
  breiteUm: positiveZahl,
  hoeheUm: positiveZahl,
  greiferUm: abstand,
});

export type Tiegel = z.infer<typeof TiegelSchema>;

/** Ein Nutzen der Stanzform: Endformat-Rechteck mit ID, relativ zur Anlagekante des Teilbogens. */
export const StanzNutzenSchema = RechteckSchema.extend({ id: text });

export type StanzNutzen = z.infer<typeof StanzNutzenSchema>;

/** Stanzform: Name, Beschnitt und die frei gesetzten Nutzen. */
export const StanzformSchema = z.object({
  name: text,
  beschnittUm: abstand,
  nutzen: z.array(StanzNutzenSchema).min(1, 'Mindestens ein Nutzen'),
});

export type Stanzform = z.infer<typeof StanzformSchema>;

/** Eingabe der Prüfung: Tiegel, Teilbogen und die Stanzform darauf. */
export const StanzungEingabeSchema = z.object({
  tiegel: TiegelSchema,
  teilbogen: z.object({ breiteUm: positiveZahl, hoeheUm: positiveZahl }),
  stanzform: StanzformSchema,
});

export type StanzungEingabe = z.infer<typeof StanzungEingabeSchema>;

/** Eingabe für das regelmäßige Raster einer Stanzform (Spalten × Zeilen gleicher Endformate). */
export const RasterStanzformSchema = z.object({
  name: text,
  spalten: positiveZahl,
  zeilen: positiveZahl,
  endformat: z.object({ breiteUm: positiveZahl, hoeheUm: positiveZahl }),
  steg: z.object({ xUm: abstand, yUm: abstand }),
  abstand: z.object({ linksUm: abstand, vorneUm: abstand }),
  beschnittUm: abstand,
});

export type RasterStanzform = z.infer<typeof RasterStanzformSchema>;

/** Ein geprüfter Nutzen: Endformat und Beschnitt (der Beschnitt darf über den Teilbogen ragen). */
export type StanzSlot = { id: string; endformat: Rechteck; beschnitt: Rechteck };

/** Ergebnis der Prüfung: Nutzen mit Beschnitt, Anzahl und Warnungen. */
export type Stanzung = {
  tiegel: Tiegel;
  teilbogen: { breiteUm: number; hoeheUm: number };
  name: string;
  nutzen: StanzSlot[];
  anzahl: number;
  warnungen: string[];
};

const FEHLER_TEILBOGEN = 'Teilbogen ist größer als der Tiegel';
const FEHLER_ID_DOPPELT = 'Nutzen-ID doppelt';
const FEHLER_AUSSERHALB = 'Nutzen liegt nicht vollständig auf dem Teilbogen';
const WARNUNG_GREIFERRAND = 'Nutzen im Greiferrand des Tiegels';
const WARNUNG_BESCHNITT = 'Beschnitt benachbarter Nutzen überlappt';

/** Beschnitt-Rechteck: Endformat um den Beschnitt nach allen Seiten vergrößert. */
function beschnittVon(nutzen: StanzNutzen, beschnittUm: number): Rechteck {
  return {
    xUm: nutzen.xUm - beschnittUm,
    yUm: nutzen.yUm - beschnittUm,
    breiteUm: nutzen.breiteUm + 2 * beschnittUm,
    hoeheUm: nutzen.hoeheUm + 2 * beschnittUm,
  };
}

/** true, wenn sich die Beschnitt-Rechtecke zweier nicht überlappender Nutzen überschneiden. */
function beschnittUeberlappt(nutzen: StanzNutzen[], beschnittUm: number): boolean {
  for (let i = 0; i < nutzen.length; i += 1) {
    for (let j = i + 1; j < nutzen.length; j += 1) {
      const a = nutzen[i];
      const b = nutzen[j];
      if (
        a &&
        b &&
        !ueberlappen(a, b) &&
        ueberlappen(beschnittVon(a, beschnittUm), beschnittVon(b, beschnittUm))
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Prüft Stanzform, Teilbogen und Tiegel gegeneinander.
 * Fehler: Teilbogen größer als der Tiegel, doppelte Nutzen-ID, Nutzen außerhalb des Teilbogens,
 * überlappende Endformate. Warnungen: Nutzen im Greiferrand, überlappender Beschnitt.
 * Der Teilbogen wird so geprüft, wie er übergeben wird (kein automatisches Drehen).
 */
export function pruefeStanzung(eingabe: unknown): PruefErgebnis<Stanzung> {
  const geprueft = ausZod(StanzungEingabeSchema.safeParse(eingabe));
  if (!geprueft.ok) {
    return { ok: false, fehler: geprueft.fehler };
  }
  const { tiegel, teilbogen, stanzform } = geprueft.wert;

  const fehler: Fehler[] = [];

  // Der Teilbogen muss in den Tiegel passen.
  if (teilbogen.breiteUm > tiegel.breiteUm || teilbogen.hoeheUm > tiegel.hoeheUm) {
    fehler.push({ pfad: 'teilbogen', meldung: FEHLER_TEILBOGEN });
  }

  const teilbogenFlaeche: Rechteck = {
    xUm: 0,
    yUm: 0,
    breiteUm: teilbogen.breiteUm,
    hoeheUm: teilbogen.hoeheUm,
  };

  // IDs eindeutig, Endformate vollständig auf dem Teilbogen.
  const ids = new Set<string>();
  stanzform.nutzen.forEach((nutzen, i) => {
    if (ids.has(nutzen.id)) {
      fehler.push({ pfad: `stanzform.nutzen.${i}.id`, meldung: FEHLER_ID_DOPPELT });
    }
    ids.add(nutzen.id);
    if (!liegtIn(nutzen, teilbogenFlaeche)) {
      fehler.push({ pfad: `stanzform.nutzen.${i}`, meldung: FEHLER_AUSSERHALB });
    }
  });

  // Endformate dürfen sich nicht überschneiden.
  for (let i = 0; i < stanzform.nutzen.length; i += 1) {
    for (let j = i + 1; j < stanzform.nutzen.length; j += 1) {
      const a = stanzform.nutzen[i];
      const b = stanzform.nutzen[j];
      if (a && b && ueberlappen(a, b)) {
        fehler.push({
          pfad: 'stanzform.nutzen',
          meldung: `Nutzen ${a.id} und ${b.id} überlappen`,
        });
      }
    }
  }

  if (fehler.length > 0) {
    return { ok: false, fehler };
  }

  const nutzen: StanzSlot[] = stanzform.nutzen.map((nutzen) => ({
    id: nutzen.id,
    endformat: {
      xUm: nutzen.xUm,
      yUm: nutzen.yUm,
      breiteUm: nutzen.breiteUm,
      hoeheUm: nutzen.hoeheUm,
    },
    beschnitt: beschnittVon(nutzen, stanzform.beschnittUm),
  }));

  const warnungen: string[] = [];

  // Nutzen im Greiferrand des Tiegels (Anlagekante vorne).
  const imGreiferrand = stanzform.nutzen.filter((nutzen) => nutzen.yUm < tiegel.greiferUm);
  if (imGreiferrand.length > 0) {
    warnungen.push(
      `${WARNUNG_GREIFERRAND}: ${imGreiferrand.map((nutzen) => nutzen.id).join(', ')}`,
    );
  }

  // Beschnitt benachbarter Nutzen überlappt (Steg zu klein).
  if (stanzform.beschnittUm > 0 && beschnittUeberlappt(stanzform.nutzen, stanzform.beschnittUm)) {
    warnungen.push(WARNUNG_BESCHNITT);
  }

  return {
    ok: true,
    wert: {
      tiegel,
      teilbogen: { breiteUm: teilbogen.breiteUm, hoeheUm: teilbogen.hoeheUm },
      name: stanzform.name,
      nutzen,
      anzahl: nutzen.length,
      warnungen,
    },
  };
}

/**
 * Erzeugt eine regelmäßige Stanzform: Spalten × Zeilen gleicher Endformate, ab der Anlagekante
 * des Teilbogens, in der Zeile von links nach rechts (N1, N2, …).
 * Ob das Ergebnis auf Teilbogen und Tiegel passt, prüft `pruefeStanzung`.
 */
export function rasterStanzform(eingabe: unknown): PruefErgebnis<Stanzform> {
  const geprueft = ausZod(RasterStanzformSchema.safeParse(eingabe));
  if (!geprueft.ok) {
    return { ok: false, fehler: geprueft.fehler };
  }
  const e = geprueft.wert;

  const nutzen: StanzNutzen[] = [];
  for (let zeile = 0; zeile < e.zeilen; zeile += 1) {
    for (let spalte = 0; spalte < e.spalten; spalte += 1) {
      nutzen.push({
        id: `N${nutzen.length + 1}`,
        xUm: e.abstand.linksUm + spalte * (e.endformat.breiteUm + e.steg.xUm),
        yUm: e.abstand.vorneUm + zeile * (e.endformat.hoeheUm + e.steg.yUm),
        breiteUm: e.endformat.breiteUm,
        hoeheUm: e.endformat.hoeheUm,
      });
    }
  }

  return { ok: true, wert: { name: e.name, beschnittUm: e.beschnittUm, nutzen } };
}
