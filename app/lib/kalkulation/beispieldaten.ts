/**
 * Entwicklungsdaten für die Kalkulation: Beispiel-Stammdaten der kalpri-Engine (Beispiel-Lager,
 * Beispiel-Produktion) mit Preisen und drei Artikeln, davon zwei für den Shop freigegeben.
 * Nur für lokale Entwicklung und Tests – NICHT Teil der Migrationen. Die Beträge sind erfunden.
 */
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  lagerAlsJson,
  produktionAlsJson,
  type Artikel,
  type Lager,
  type Produktion,
} from "@druck/resources";
import { SICHERUNG_ART } from "./bereiche";

export function beispielLager(): Lager {
  const bogen = (id: string, sorte: string, grammatur: number, dickeUm: number): Lager["materialien"][number] => ({
    id,
    form: "Bogen",
    sorte,
    kategorie: "papier",
    oberflaeche: "gestrichen",
    grammatur,
    dickeUm,
    breiteUm: 320000,
    hoeheUm: 450000,
    laufrichtung: "SB",
  });
  const materialien = [...BEISPIEL_LAGER.materialien, bogen("L10", "Bilderdruck matt SRA3", 135, 110), bogen("L11", "Bilderdruck matt SRA3", 170, 140)];
  // Preise je 1.000 Bogen in Zehntelcent (1 € = 1.000)
  const je1000 = (id: string, materialId: string, euro: number) => ({
    id,
    materialId,
    lieferant: "Großhandel Beispiel",
    basis: "je1000" as const,
    betragZehntelcent: euro * 1000,
    gueltigAb: "2026-01-01",
  });
  return {
    ...BEISPIEL_LAGER,
    materialien,
    preise: [
      je1000("P0001", "L1", 60),
      je1000("P0002", "L2", 150),
      je1000("P0003", "L3", 35),
      je1000("P0004", "L4", 150),
      je1000("P0005", "L10", 28),
      je1000("P0006", "L11", 36),
    ],
  };
}

export function beispielProduktion(): Produktion {
  return {
    ...BEISPIEL_PRODUKTION,
    arbeitsplaetze: BEISPIEL_PRODUKTION.arbeitsplaetze?.map((p) =>
      p.id === "AP-TON5C"
        ? {
            ...p,
            klickpreise: [
              { farbe: "farbig" as const, zehntelcent: 55, gueltigAb: "2026-01-01" },
              { farbe: "schwarz" as const, zehntelcent: 8, gueltigAb: "2026-01-01" },
            ],
          }
        : p,
    ),
  };
}

const fest = <T>(wert: T) => ({ zustand: "fest" as const, wert });
const waehlbar = <T>(...werte: T[]) => ({ zustand: "waehlbar" as const, werte });
const format = (b: number, h: number) => ({ breiteUm: b * 1000, hoeheUm: h * 1000 });
const farbig = { vorne: { farbe: "farbig" as const } };
const farbigBeidseitig = { vorne: { farbe: "farbig" as const }, hinten: { farbe: "farbig" as const } };

export function beispielArtikel(): Artikel[] {
  return [
    {
      id: "A-FLYER",
      titel: "Flyer",
      einheit: "Stueck",
      kunde: "intern",
      beschreibung: "Interne Notiz: Standard-Flyer im Digitaldruck.",
      endformat: waehlbar(format(105, 148), format(148, 210), format(99, 210)),
      teile: [
        {
          id: "T1",
          name: "Flyer",
          jeProdukt: 1,
          woraus: waehlbar({ art: "sorte" as const, sorte: "Bilderdruck matt SRA3", grammatur: 135 }, { art: "sorte" as const, sorte: "Bilderdruck matt SRA3", grammatur: 170 }),
          druck: waehlbar(farbig, farbigBeidseitig),
          wer: fest("haus" as const),
        },
      ],
      freigegeben: true,
      shopText: "Flyer in verschiedenen Formaten, ein- oder beidseitig farbig gedruckt.",
    },
    {
      id: "A-VISITENKARTE",
      titel: "Visitenkarten",
      einheit: "Stueck",
      kunde: "intern",
      endformat: fest(format(85, 55)),
      teile: [
        {
          id: "T1",
          name: "Karte",
          jeProdukt: 1,
          woraus: fest({ art: "sorte" as const, sorte: "Digitalkarton", grammatur: 350 }),
          druck: waehlbar(farbig, farbigBeidseitig),
          wer: fest("haus" as const),
        },
      ],
      freigegeben: true,
      shopText: "Visitenkarten auf kräftigem Karton, 85 × 55 mm.",
    },
    {
      id: "A-PLAKAT",
      titel: "Plakat (nur intern)",
      einheit: "Stueck",
      kunde: "intern",
      endformat: { zustand: "offen" as const },
      teile: [
        {
          id: "T1",
          name: "Plakat",
          jeProdukt: 1,
          woraus: { zustand: "offen" as const },
          druck: fest(farbig),
          wer: fest("haus" as const),
        },
      ],
    },
  ] as Artikel[];
}

/** Sicherung im Format der Werkbank („werkbank-sicherung“) mit den Beispieldaten. */
export function beispielSicherung(datum: string): { art: string; version: number; datum: string; daten: Record<string, unknown> } {
  return {
    art: SICHERUNG_ART,
    version: 1,
    datum,
    daten: {
      "werkbank.material.v1": JSON.parse(lagerAlsJson(beispielLager())),
      "werkbank.produktion.v1": JSON.parse(produktionAlsJson(beispielProduktion())),
      "werkbank.artikel.v1": { version: 1, artikel: beispielArtikel() },
    },
  };
}
