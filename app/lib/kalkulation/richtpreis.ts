/**
 * Preisschicht: aus den Kosten der kalpri-Engine (ganze Zehntelcent) einen unverbindlichen
 * Verkaufs-Richtpreis machen.
 *
 *   Kosten + Gemeinkosten/Vertrieb % -> + Gewinn % (auf die Summe) -> Mindestpreis je Auftrag
 *   -> Rundung -> Spanne (unten/oben %) -> Brutto (MwSt)
 *
 * Alles rechnet ganzzahlig: Prozentsätze werden zu Hundertstel-Prozent (Basispunkte) und jeder
 * Schritt rundet genau einmal kaufmännisch (Mitte weg von null) bzw. nach der gewählten Rundung.
 * Es gibt keine Gleitkomma-Zwischenwerte. Reine Funktionen ohne Datenbank, damit sie auch im
 * Browser (Beispielrechnung in den Einstellungen) laufen.
 *
 * Ist die Kalkulation unvollständig (nicht vollständig, offene Fragen, Zeilen ohne Kosten), gibt
 * es KEINEN Preis, sondern „Preis auf Anfrage“ mit Gründen.
 */

export const RICHTPREIS_KENNZEICHEN = "unverbindlicher Richtpreis";
export const RICHTPREIS_HINWEIS =
  "Unverbindlicher Richtpreis (Schätzung auf Basis Ihrer Angaben). Der verbindliche Preis ergibt sich aus dem Angebot der Druckerei.";

/** Schritte der Rundung in Cent; 1 = auf den Cent. */
export const RUNDUNG_SCHRITTE_CENT = [1, 10, 100, 500, 1000] as const;
export type RundungSchrittCent = (typeof RUNDUNG_SCHRITTE_CENT)[number];
export type RundungRichtung = "auf" | "kaufmaennisch";

export type PreisEinstellungen = {
  /** Zuschlag für Gemeinkosten/Vertrieb auf die Kosten, in Prozent (0–300, bis 2 Nachkommastellen). */
  gemeinkostenProzent: number;
  /** Gewinnaufschlag auf Kosten + Gemeinkosten, in Prozent (0–300). */
  gewinnProzent: number;
  /** Mindestpreis je Auftrag (netto) in Cent; 0 = keiner. */
  mindestpreisCent: number;
  /** Rundung des Netto-Richtpreises: Schritt in Cent (1 = auf den Cent, 100 = volle Euro, …). */
  rundungSchrittCent: RundungSchrittCent;
  /** auf = immer aufrunden, kaufmaennisch = zum nächsten Schritt. */
  rundungRichtung: RundungRichtung;
  /** Spanne nach unten und oben um den Richtpreis, in Prozent (0–90 bzw. 0–300). */
  spanneUntenProzent: number;
  spanneObenProzent: number;
  /** Mehrwertsteuersatz in Prozent (0–30). */
  mwstProzent: number;
};

export const STANDARD_PREIS_EINSTELLUNGEN: PreisEinstellungen = {
  gemeinkostenProzent: 15,
  gewinnProzent: 10,
  mindestpreisCent: 2500,
  rundungSchrittCent: 100,
  rundungRichtung: "auf",
  spanneUntenProzent: 10,
  spanneObenProzent: 15,
  mwstProzent: 19,
};

/** Prozent -> Hundertstel-Prozent als ganze Zahl (15,5 % -> 1550); rundet die Eingabe sauber. */
export function basispunkte(prozent: number): number {
  return Math.round(prozent * 100);
}

/** Ganzzahl-Division mit kaufmännischer Rundung (Mitte weg von null); b > 0. */
export function teileGerundet(a: number, b: number): number {
  const q = Math.floor(Math.abs(a) / b);
  const r = Math.abs(a) - q * b;
  const betrag = r * 2 >= b ? q + 1 : q;
  return a < 0 ? -betrag : betrag;
}

/** Ganzzahl-Division, aufgerundet; a >= 0, b > 0. */
export function teileAuf(a: number, b: number): number {
  const r = a % b;
  return (a - r) / b + (r > 0 ? 1 : 0);
}

/** Wert in Cent auf den Rundungsschritt bringen. */
export function runde(cent: number, schritt: number, richtung: RundungRichtung): number {
  if (schritt <= 1) return cent;
  return (richtung === "auf" ? teileAuf(cent, schritt) : teileGerundet(cent, schritt)) * schritt;
}

/** Eingabe einer Auflage für die Preisschicht (Kosten aus kalpri, Zehntelcent). */
export type KostenEingabe = {
  auflage: number;
  kostenZehntelcent: number;
  vollstaendig: boolean;
  ohneKosten: readonly string[];
  /** Nicht beantwortete Fragen (Titel oder Schlüssel), die für einen Preis nötig wären. */
  offen?: readonly string[];
};

export type PreisBetrag = { nettoCent: number; bruttoCent: number };

export type RichtpreisErgebnis =
  | {
      status: "preis";
      auflage: number;
      kennzeichnung: typeof RICHTPREIS_KENNZEICHEN;
      /** Richtpreis (Mitte) sowie untere und obere Grenze der Spanne. */
      preis: PreisBetrag;
      von: PreisBetrag;
      bis: PreisBetrag;
      mwstProzent: number;
      jeStueckZehntelcent: number;
      /** Netto-Richtpreis je 1.000 Stück in Cent. */
      je1000Cent: number;
      /** true, wenn der Mindestpreis den errechneten Preis angehoben hat. */
      mindestpreisAngewendet: boolean;
      /** Rechenweg in ganzen Zehntelcent (Kosten) bzw. Cent. */
      rechenweg: {
        kostenZehntelcent: number;
        gemeinkostenZehntelcent: number;
        gewinnZehntelcent: number;
        zwischensummeCent: number;
        nachMindestpreisCent: number;
        nachRundungCent: number;
      };
    }
  | {
      status: "auf_anfrage";
      auflage: number;
      kennzeichnung: "Preis auf Anfrage";
      gruende: string[];
    };

function brutto(nettoCent: number, mwstBp: number): PreisBetrag {
  return { nettoCent, bruttoCent: nettoCent + teileGerundet(nettoCent * mwstBp, 10000) };
}

/** Gründe, aus denen es keinen Preis gibt (leer = Preis möglich). */
export function gruendeAufAnfrage(e: KostenEingabe): string[] {
  const g: string[] = [];
  if ((e.offen?.length ?? 0) > 0) g.push(`Angaben fehlen: ${e.offen!.join(", ")}`);
  if (!e.vollstaendig) g.push("Die Kalkulation ist unvollständig");
  for (const o of e.ohneKosten) g.push(`Kosten fehlen: ${o}`);
  if (g.length === 0 && !(e.kostenZehntelcent > 0)) g.push("Keine Kosten ermittelt");
  return g;
}

/** Richtpreis einer Auflage. */
export function richtpreis(e: KostenEingabe, s: PreisEinstellungen): RichtpreisErgebnis {
  const gruende = gruendeAufAnfrage(e);
  if (gruende.length > 0 || !Number.isInteger(e.kostenZehntelcent) || e.auflage < 1) {
    return {
      status: "auf_anfrage",
      auflage: e.auflage,
      kennzeichnung: "Preis auf Anfrage",
      gruende: gruende.length > 0 ? gruende : ["Eingabe ungültig"],
    };
  }
  const k = e.kostenZehntelcent;
  const gemeinBp = basispunkte(s.gemeinkostenProzent);
  const gewinnBp = basispunkte(s.gewinnProzent);
  const mwstBp = basispunkte(s.mwstProzent);

  const gemein = teileGerundet(k * gemeinBp, 10000);
  const zwischen = k + gemein;
  const gewinn = teileGerundet(zwischen * gewinnBp, 10000);
  const roh = zwischen + gewinn; // Zehntelcent
  const rohCent = teileGerundet(roh, 10);

  const mindest = Math.max(0, Math.round(s.mindestpreisCent));
  const nachMindest = Math.max(rohCent, mindest);
  const schritt = s.rundungSchrittCent;
  const mitte = runde(nachMindest, schritt, s.rundungRichtung);

  // Spanne um den ungerundeten Wert, dann gleich gerundet; nie außerhalb von unten ≤ Mitte ≤ oben
  // und nie unter dem Mindestpreis.
  const untenBp = 10000 - Math.min(10000, basispunkte(s.spanneUntenProzent));
  const obenBp = 10000 + basispunkte(s.spanneObenProzent);
  const untenRoh = teileGerundet(nachMindest * untenBp, 10000);
  const obenRoh = teileGerundet(nachMindest * obenBp, 10000);
  const unten = Math.min(mitte, Math.max(runde(untenRoh, schritt, "kaufmaennisch"), mindest));
  const oben = Math.max(mitte, runde(obenRoh, schritt, s.rundungRichtung));

  return {
    status: "preis",
    auflage: e.auflage,
    kennzeichnung: RICHTPREIS_KENNZEICHEN,
    preis: brutto(mitte, mwstBp),
    von: brutto(unten, mwstBp),
    bis: brutto(oben, mwstBp),
    mwstProzent: s.mwstProzent,
    jeStueckZehntelcent: teileGerundet(mitte * 10, e.auflage),
    je1000Cent: teileGerundet(mitte * 1000, e.auflage),
    mindestpreisAngewendet: mindest > rohCent,
    rechenweg: {
      kostenZehntelcent: k,
      gemeinkostenZehntelcent: gemein,
      gewinnZehntelcent: gewinn,
      zwischensummeCent: rohCent,
      nachMindestpreisCent: nachMindest,
      nachRundungCent: mitte,
    },
  };
}

/** Euro-Text aus Cent, z. B. 123456 -> „1.234,56 €“ (ohne Gleitkomma-Rechnung). */
export function euroText(cent: number): string {
  const neg = cent < 0;
  const a = Math.abs(Math.round(cent));
  const euro = Math.floor(a / 100);
  const rest = String(a % 100).padStart(2, "0");
  const tausend = String(euro).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${tausend},${rest} €`;
}

/** Euro-Text aus Zehntelcent mit drei Nachkommastellen bei Bedarf (z. B. je Stück 0,125 €). */
export function euroTextZehntelcent(zc: number): string {
  if (zc % 10 === 0) return euroText(zc / 10);
  const neg = zc < 0;
  const a = Math.abs(Math.round(zc));
  const euro = Math.floor(a / 1000);
  const rest = String(a % 1000).padStart(3, "0");
  const tausend = String(euro).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${tausend},${rest} €`;
}

// ---------------------------------------------------------------------------
// Prüfung der Einstellungen (ohne zod, damit die Datei auch im Browser schlank bleibt)

const GRENZEN: Record<string, [number, number]> = {
  gemeinkostenProzent: [0, 300],
  gewinnProzent: [0, 300],
  spanneUntenProzent: [0, 90],
  spanneObenProzent: [0, 300],
  mwstProzent: [0, 30],
};

export function pruefeEinstellungen(
  roh: unknown,
): { ok: true; wert: PreisEinstellungen } | { ok: false; fehler: string[] } {
  const fehler: string[] = [];
  const o = (typeof roh === "object" && roh !== null ? roh : {}) as Record<string, unknown>;
  const wert: PreisEinstellungen = { ...STANDARD_PREIS_EINSTELLUNGEN };
  const NAMEN: Record<string, string> = {
    gemeinkostenProzent: "Gemeinkosten/Vertrieb",
    gewinnProzent: "Gewinn",
    spanneUntenProzent: "Spanne nach unten",
    spanneObenProzent: "Spanne nach oben",
    mwstProzent: "Mehrwertsteuer",
  };
  for (const [k, [min, max]] of Object.entries(GRENZEN)) {
    if (o[k] === undefined) continue;
    const v = o[k];
    // höchstens zwei Nachkommastellen: sonst wäre der Basispunkt-Wert nicht exakt
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) {
      fehler.push(`${NAMEN[k]}: Zahl von ${min} bis ${max} (höchstens zwei Nachkommastellen)`);
    } else (wert as Record<string, unknown>)[k] = v;
  }
  if (o.mindestpreisCent !== undefined) {
    const v = o.mindestpreisCent;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100_000_000)
      fehler.push("Mindestpreis: ganze Zahl in Cent, 0 bis 1.000.000 €");
    else wert.mindestpreisCent = v;
  }
  if (o.rundungSchrittCent !== undefined) {
    const v = o.rundungSchrittCent;
    if (!RUNDUNG_SCHRITTE_CENT.includes(v as RundungSchrittCent))
      fehler.push(`Rundung: Schritt ${RUNDUNG_SCHRITTE_CENT.join(", ")} Cent`);
    else wert.rundungSchrittCent = v as RundungSchrittCent;
  }
  if (o.rundungRichtung !== undefined) {
    if (o.rundungRichtung !== "auf" && o.rundungRichtung !== "kaufmaennisch")
      fehler.push("Rundung: „auf“ oder „kaufmaennisch“");
    else wert.rundungRichtung = o.rundungRichtung;
  }
  return fehler.length > 0 ? { ok: false, fehler } : { ok: true, wert };
}
