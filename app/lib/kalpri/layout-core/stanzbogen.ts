import { z } from 'zod';
import type { Rechteck } from './geometrie';
import { ausZod, type Fehler, type PruefErgebnis } from './pruefung';
import { TiegelSchema, rasterStanzform } from './stanze';
import { berechneTeilung, type Kante, type Schnitt, type Teilbogen, type Teilung } from './teilung';

/** Positive ganze Zahl (µm oder Anzahl). */
const positiveZahl = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein');

/** Nicht negative ganze Zahl in µm. */
const abstand = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

/** Seitenanlage im Tiegel, vom Greiferrand aus in den Tiegel geschaut. */
export const SeitenanlageSchema = z.enum(['links', 'rechts'], {
  message: 'Seitenanlage muss links oder rechts sein',
});
export type Seitenanlage = z.infer<typeof SeitenanlageSchema>;

/**
 * Eingabe für den Stanzbogen (Weg A): Druckbogen gleichmäßig in Spalten × Zeilen teilen,
 * in jedem Teilbogen die Nutzen gleich anordnen (Spalten × Zeilen ab der Anlage).
 * Die Anlage ist immer eine Ecke: Greiferrand (vorne) plus Seitenanlage (links oder rechts).
 * Sie gilt für alle Teilbogen gleich, alle Teilbogen liegen gleich (keine Drehung untereinander).
 */
export const StanzbogenEingabeSchema = z.object({
  bogen: z.object({ breiteUm: positiveZahl, hoeheUm: positiveZahl }),
  teilung: z.object({
    spalten: positiveZahl.max(20, 'höchstens 20'),
    zeilen: positiveZahl.max(20, 'höchstens 20'),
    abfallUm: abstand,
  }),
  tiegel: TiegelSchema,
  seitenanlage: SeitenanlageSchema.default('links'),
  anordnung: z.object({
    spalten: positiveZahl,
    zeilen: positiveZahl,
    endformat: z.object({ breiteUm: positiveZahl, hoeheUm: positiveZahl }),
    gedreht: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).default(false),
    steg: z.object({ xUm: abstand, yUm: abstand }),
    /** seitlichUm: ab der Seitenanlage, vorneUm: ab dem Greiferrand, jeweils bis Endformat. */
    abstand: z.object({ seitlichUm: abstand, vorneUm: abstand }),
    beschnittUm: abstand,
  }),
  nutzenJeForm: positiveZahl.optional(),
});

export type StanzbogenEingabe = z.input<typeof StanzbogenEingabeSchema>;

export type Stanzbogen = Teilung & {
  /** Teilbogen in Druckbogen-Lage (Breite entlang der Greiferkante des Druckbogens). */
  teilbogenFormat: { breiteUm: number; hoeheUm: number };
  nutzenJeTeilbogen: number;
  seitenanlage: Seitenanlage;
};

const FEHLER_ABFALL = 'Abfall ist zu groß für diese Teilung';
const WARNUNG_SCHNITTKANTE = 'Anlage an einer Schnittkante:';

/**
 * Gleich große Streifen: Breite = floor((Länge − (n − 1) × Abfall) / n). Der Rest (weniger als
 * n µm) kommt in den letzten Abfallstreifen, damit alle Teilbogen genau gleich groß sind.
 * null, wenn nichts übrig bleibt.
 */
function gleicheSchnitte(
  laenge: number,
  n: number,
  abfallUm: number,
): { teil: number; schnitte: Schnitt[] } | null {
  const teil = Math.floor((laenge - (n - 1) * abfallUm) / n);
  if (teil <= 0) {
    return null;
  }
  const rest = laenge - n * teil - (n - 1) * abfallUm;
  const schnitte: Schnitt[] = [];
  for (let i = 1; i < n; i += 1) {
    const letzter = i === n - 1;
    schnitte.push({
      posUm: i * teil + (i - 1) * abfallUm,
      abfallUm: abfallUm + (letzter ? rest : 0),
    });
  }
  return { teil, schnitte };
}

/**
 * Rechteck aus Tiegel-Koordinaten (Ursprung Ecke Greiferrand/Seitenanlage, x entlang des
 * Greiferrands, y von ihm weg) auf den Druckbogen. Greiferrand ist die vordere Kante des
 * Teilbogens (normal) bzw. seine linke Kante (gedreht angelegt). Keine Spiegelung.
 */
function aufDenBogen(
  t: Rechteck,
  greifer: Kante,
  seite: Seitenanlage,
  kanteLaenge: number,
  n: Rechteck,
): Rechteck {
  // Bei Seitenanlage rechts wird entlang des Greiferrands von der anderen Ecke gemessen.
  const u = seite === 'links' ? n.xUm : kanteLaenge - n.xUm - n.breiteUm;
  if (greifer === 'links') {
    return {
      xUm: t.xUm + n.yUm,
      yUm: t.yUm + t.hoeheUm - u - n.breiteUm,
      breiteUm: n.hoeheUm,
      hoeheUm: n.breiteUm,
    };
  }
  return { xUm: t.xUm + u, yUm: t.yUm + n.yUm, breiteUm: n.breiteUm, hoeheUm: n.hoeheUm };
}

/**
 * Stanzbogen nach Weg A: teilt den Druckbogen gleichmäßig, ordnet die Nutzen im Teilbogen an
 * (rasterStanzform) und setzt sie mit derselben Anlage-Ecke in jeden Teilbogen.
 * Der Greiferrand ist die Kante des Teilbogens zur Greiferkante des Druckbogens. Passt der
 * Teilbogen so nicht in den Tiegel, aber gedreht, wird für alle Teilbogen die linke Kante
 * zum Greiferrand. Ob Original- oder Schnittkante, spielt keine Rolle.
 * Schnittlinien, Abfall, Teilbogen-Rechtecke und Prüfungen kommen aus berechneTeilung.
 */
export function berechneStanzbogen(eingabe: unknown): PruefErgebnis<Stanzbogen> {
  const geprueft = ausZod(StanzbogenEingabeSchema.safeParse(eingabe));
  if (!geprueft.ok) {
    return geprueft;
  }
  const e = geprueft.wert;

  const fehler: Fehler[] = [];
  const x = gleicheSchnitte(e.bogen.breiteUm, e.teilung.spalten, e.teilung.abfallUm);
  const y = gleicheSchnitte(e.bogen.hoeheUm, e.teilung.zeilen, e.teilung.abfallUm);
  if (x === null || y === null) {
    fehler.push({ pfad: 'teilung.abfallUm', meldung: FEHLER_ABFALL });
    return { ok: false, fehler };
  }

  const teilbogenFormat = { breiteUm: x.teil, hoeheUm: y.teil };
  const passtGerade =
    teilbogenFormat.breiteUm <= e.tiegel.breiteUm && teilbogenFormat.hoeheUm <= e.tiegel.hoeheUm;
  const passtGedreht =
    teilbogenFormat.hoeheUm <= e.tiegel.breiteUm && teilbogenFormat.breiteUm <= e.tiegel.hoeheUm;
  const gedrehtAngelegt = !passtGerade && passtGedreht;
  const greifer: Kante = gedrehtAngelegt ? 'links' : 'vorne';
  const imTiegel = gedrehtAngelegt
    ? { breiteUm: teilbogenFormat.hoeheUm, hoeheUm: teilbogenFormat.breiteUm }
    : teilbogenFormat;

  const a = e.anordnung;
  const endformat = a.gedreht
    ? { breiteUm: a.endformat.hoeheUm, hoeheUm: a.endformat.breiteUm }
    : a.endformat;
  // Die Stanzform wird immer ab der linken Ecke gerechnet; Seitenanlage rechts spiegelt nur die
  // Messrichtung beim Übertragen auf den Bogen (die Nutzen selbst werden nicht gespiegelt).
  const stanzform = rasterStanzform({
    name: 'Anordnung',
    spalten: a.spalten,
    zeilen: a.zeilen,
    endformat,
    steg: a.steg,
    abstand: { linksUm: a.abstand.seitlichUm, vorneUm: a.abstand.vorneUm },
    beschnittUm: a.beschnittUm,
  });
  if (!stanzform.ok) {
    return {
      ok: false,
      fehler: stanzform.fehler.map((f) => ({ pfad: `anordnung.${f.pfad}`, meldung: f.meldung })),
    };
  }

  const teilung = berechneTeilung({
    bogen: e.bogen,
    schnitte: { x: x.schnitte, y: y.schnitte },
    stanzung: { tiegel: e.tiegel, teilbogen: imTiegel, stanzform: stanzform.wert },
  });
  if (!teilung.ok) {
    return teilung;
  }
  const s = teilung.wert.stanzung;

  // Alle Teilbogen mit derselben Anlage-Ecke; berechneTeilung wählt die Kante selbst, das wird
  // hier für alle gleich überschrieben.
  const teilbogen: Teilbogen[] = teilung.wert.teilbogen.map((tb) => ({
    ...tb,
    anlage: greifer,
    drehung: greifer === 'links' ? 90 : 0,
    anlageOriginal: greifer === 'links' ? tb.rechteck.xUm === 0 : tb.rechteck.yUm === 0,
    nutzen: s.nutzen.map((n) => ({
      id: `${tb.id}-${n.id}`,
      gruppe: tb.id,
      nutzenId: n.id,
      endformat: aufDenBogen(tb.rechteck, greifer, e.seitenanlage, imTiegel.breiteUm, n.endformat),
      beschnitt: aufDenBogen(tb.rechteck, greifer, e.seitenanlage, imTiegel.breiteUm, n.beschnitt),
    })),
  }));

  const nutzenJeTeilbogen = s.anzahl;
  const warnungen = teilung.wert.warnungen.filter((w) => !w.startsWith(WARNUNG_SCHNITTKANTE));
  if (e.nutzenJeForm !== undefined && e.nutzenJeForm !== nutzenJeTeilbogen) {
    warnungen.push(
      `Nutzen je Teilbogen (${nutzenJeTeilbogen}) weichen von der Stanzform ab (${e.nutzenJeForm})`,
    );
  }

  return {
    ok: true,
    wert: {
      ...teilung.wert,
      teilbogen,
      warnungen,
      teilbogenFormat,
      nutzenJeTeilbogen,
      seitenanlage: e.seitenanlage,
    },
  };
}

/**
 * Beste Anordnung im Teilbogen: Spalten × Zeilen, hochkant oder quer, mit den meisten Nutzen.
 * teilbogen = Lage im Tiegel (Breite = Greiferrand). Ein Nutzen passt, wenn sein Endformat
 * vollständig auf dem Teilbogen liegt (wie pruefeStanzung). Gleichstand → nicht gedreht.
 * Passt nichts → null.
 */
export function besteAnordnung(e: {
  teilbogen: { breiteUm: number; hoeheUm: number };
  endformat: { breiteUm: number; hoeheUm: number };
  steg: { xUm: number; yUm: number };
  abstand: { seitlichUm: number; vorneUm: number };
}): { spalten: number; zeilen: number; gedreht: boolean } | null {
  const anzahl = (frei: number, laenge: number, steg: number): number =>
    frei < laenge ? 0 : Math.floor((frei + steg) / (laenge + steg));
  const freiB = e.teilbogen.breiteUm - e.abstand.seitlichUm;
  const freiH = e.teilbogen.hoeheUm - e.abstand.vorneUm;
  let beste: { spalten: number; zeilen: number; gedreht: boolean } | null = null;
  for (const gedreht of [false, true]) {
    const w = gedreht ? e.endformat.hoeheUm : e.endformat.breiteUm;
    const h = gedreht ? e.endformat.breiteUm : e.endformat.hoeheUm;
    const spalten = anzahl(freiB, w, e.steg.xUm);
    const zeilen = anzahl(freiH, h, e.steg.yUm);
    if (
      spalten * zeilen > 0 &&
      (beste === null || spalten * zeilen > beste.spalten * beste.zeilen)
    ) {
      beste = { spalten, zeilen, gedreht };
    }
  }
  return beste;
}
