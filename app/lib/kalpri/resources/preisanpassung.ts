import { malG, zehntelcent } from '@druck/units';
import { STANDARD_GRUPPEN } from './material-gruppe-schema';
import { pruefeLager, type Lager } from './lager-schema';
import {
  PreisanpassungBefehlSchema,
  PreisanpassungEingabeSchema,
  type Preisanpassung,
  type PreisanpassungEingabe,
} from './preisanpassung-schema';
import { preisHinzufuegen } from './preise';
import type { Preis } from './preis-schema';
import { ausZod, type PruefErgebnis } from './pruefung';

/** Verteilt Omit auf die Basis-Varianten des Preises (z. B. einheit mit Staffel oder je1000). */
type PreisOhneId<T> = T extends unknown ? Omit<T, 'id'> : never;

/** Eine Zeile der Vorschau: Material, alter Preis und der neue Preiseintrag (ohne ID). */
export type PreisanpassungZeile = {
  materialId: string;
  sorte: string;
  lieferant: string;
  alt: Preis;
  neu: PreisOhneId<Preis>;
};

/** Vorschau der Sammelaktion „Preise anpassen“: betroffene und übersprungene Materialien. */
export type PreisanpassungVorschau = {
  betroffen: PreisanpassungZeile[];
  uebersprungen: { materialId: string; sorte: string; grund: string }[];
};

/** Lieferantenschlüssel: getrimmt, ohne Groß-/Kleinschreibung (wie aktuellePreise). */
function lieferantSchluessel(lieferant: string): string {
  return lieferant.trim().toLowerCase();
}

function einkaufsgruppeVorhanden(lager: Lager, gruppeId: string): boolean {
  return (lager.gruppen ?? STANDARD_GRUPPEN).some((g) => g.id === gruppeId);
}

/** Faktor der Anpassung: Prozent (+/-) als 1 + p/100. */
function faktorVon(prozent: number): number {
  return 1 + prozent / 100;
}

/** Der Tag vor dem ISO-Datum (gültig ab minus einen Tag) – Stand des alten Preises. */
function tagVor(iso: string): string {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (treffer === null) {
    return iso;
  }
  const datum = new Date(Date.UTC(Number(treffer[1]), Number(treffer[2]) - 1, Number(treffer[3])));
  datum.setUTCDate(datum.getUTCDate() - 1);
  return [
    String(datum.getUTCFullYear()).padStart(4, '0'),
    String(datum.getUTCMonth() + 1).padStart(2, '0'),
    String(datum.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/** Der Preis des Lieferanten (Schlüssel, s. o.) mit gueltigAb <= stichtag; bei gleichem
 *  Datum der zuletzt angehängte. */
function preisBis(
  lager: Lager,
  materialId: string,
  lieferant: string,
  stichtag: string,
): Preis | undefined {
  let gefunden: Preis | undefined;
  for (const preis of lager.preise ?? []) {
    if (
      preis.materialId !== materialId ||
      lieferantSchluessel(preis.lieferant) !== lieferantSchluessel(lieferant) ||
      preis.gueltigAb > stichtag
    ) {
      continue;
    }
    if (gefunden === undefined || preis.gueltigAb >= gefunden.gueltigAb) {
      gefunden = preis;
    }
  }
  return gefunden;
}

/** Hat das Material von diesem Lieferanten einen Preis genau ab dem Datum? */
function hatPreisGenauAm(
  lager: Lager,
  materialId: string,
  lieferant: string,
  datum: string,
): boolean {
  return (lager.preise ?? []).some(
    (preis) =>
      preis.materialId === materialId &&
      lieferantSchluessel(preis.lieferant) === lieferantSchluessel(lieferant) &&
      preis.gueltigAb === datum,
  );
}

/** Alle Staffelbeträge bzw. den Betrag je Basis kaufmännisch auf ganze Zehntelcent mit
 *  demselben Faktor angepasst (Freigabe T70: rundeZC(Grundpreis × Faktor)). */
function angepassterPreis(alt: Preis, faktor: number, gueltigAb: string): PreisOhneId<Preis> {
  const gemeinsam = {
    materialId: alt.materialId,
    lieferant: alt.lieferant,
    ...(alt.artikelnummer === undefined ? {} : { artikelnummer: alt.artikelnummer }),
    gueltigAb,
  };
  if (alt.basis === 'einheit') {
    return {
      ...gemeinsam,
      basis: 'einheit',
      einheitName: alt.einheitName,
      inhalt: alt.inhalt,
      staffel: alt.staffel.map((stufe) => ({
        ab: stufe.ab,
        betragZehntelcent: malG(zehntelcent(stufe.betragZehntelcent), faktor).zehntelcent,
      })),
    };
  }
  return {
    ...gemeinsam,
    basis: alt.basis,
    betragZehntelcent: malG(zehntelcent(alt.betragZehntelcent), faktor).zehntelcent,
  };
}

/**
 * Vorschau der Sammelaktion „Preise anpassen“ (T70, reine Funktion): alle Materialien der
 * Einkaufsgruppe – betroffen sind die mit einem gültigen Preis dieses Lieferanten am Tag
 * vor dem Anpassungsdatum (das ist der alte Preis), übersprungen die ohne Preis bzw. mit
 * einem Preis genau ab dem Anpassungsdatum (kein zweiter Eintrag am selben Tag).
 */
export function preisanpassungVorschau(
  lager: Lager,
  eingabe: unknown,
): PruefErgebnis<PreisanpassungVorschau> {
  const pruefung = ausZod(PreisanpassungEingabeSchema.safeParse(eingabe));
  if (!pruefung.ok) {
    return pruefung;
  }
  const e: PreisanpassungEingabe = pruefung.wert;
  if (!einkaufsgruppeVorhanden(lager, e.gruppeId)) {
    return {
      ok: false,
      fehler: [{ pfad: 'gruppeId', meldung: `Gruppe ${e.gruppeId} nicht gefunden` }],
    };
  }
  const vorTag = tagVor(e.gueltigAb);
  const betroffen: PreisanpassungZeile[] = [];
  const uebersprungen: PreisanpassungVorschau['uebersprungen'] = [];
  for (const m of lager.materialien) {
    if (m.gruppeId !== e.gruppeId) {
      continue;
    }
    if (hatPreisGenauAm(lager, m.id, e.lieferant, e.gueltigAb)) {
      uebersprungen.push({
        materialId: m.id,
        sorte: m.sorte,
        grund: 'bereits Preis ab diesem Datum',
      });
      continue;
    }
    const alt = preisBis(lager, m.id, e.lieferant, vorTag);
    if (alt === undefined) {
      uebersprungen.push({
        materialId: m.id,
        sorte: m.sorte,
        grund: `kein gültiger Preis von ${e.lieferant}`,
      });
      continue;
    }
    betroffen.push({
      materialId: m.id,
      sorte: m.sorte,
      lieferant: alt.lieferant,
      alt,
      neu: angepassterPreis(alt, faktorVon(e.prozent), e.gueltigAb),
    });
  }
  return { ok: true, wert: { betroffen, uebersprungen } };
}

/**
 * Führt die Sammelaktion aus: hängt für jede betroffene Zeile einen neuen Preiseintrag ab
 * dem Datum an (Preise werden nie überschrieben, alle Staffeln mit demselben Faktor) und
 * speichert den Anpassungseintrag (wann, was, wie viele Materialien). Auf Basis der Vorschau.
 */
export function preisanpassungAusfuehren(lager: Lager, eingabe: unknown): PruefErgebnis<Lager> {
  const pruefung = ausZod(PreisanpassungBefehlSchema.safeParse(eingabe));
  if (!pruefung.ok) {
    return pruefung;
  }
  const vorschau = preisanpassungVorschau(lager, eingabe);
  if (!vorschau.ok) {
    return vorschau;
  }
  if (vorschau.wert.betroffen.length === 0) {
    return { ok: false, fehler: [{ pfad: '', meldung: 'Keine Materialien betroffen' }] };
  }
  let naechstes = lager;
  for (const zeile of vorschau.wert.betroffen) {
    const ergebnis = preisHinzufuegen(naechstes, zeile.neu);
    if (!ergebnis.ok) {
      return {
        ok: false,
        fehler: [
          {
            pfad: 'gueltigAb',
            meldung: `Neuer Preis für Material ${zeile.materialId} nicht speicherbar`,
          },
        ],
      };
    }
    naechstes = ergebnis.wert;
  }
  const b = pruefung.wert;
  const eintrag: Preisanpassung = {
    wann: b.wann,
    lieferant: b.lieferant,
    gruppeId: b.gruppeId,
    gueltigAb: b.gueltigAb,
    prozent: b.prozent,
    materialien: vorschau.wert.betroffen.length,
  };
  return pruefeLager({
    ...naechstes,
    preisanpassungen: [...(naechstes.preisanpassungen ?? []), eintrag],
  });
}

/** Die gespeicherten Anpassungseinträge des Lagers (anhängend, in Ausführungsreihenfolge). */
export function preisanpassungenVon(lager: Lager): Preisanpassung[] {
  return lager.preisanpassungen ?? [];
}
