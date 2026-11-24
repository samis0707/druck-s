import { z } from 'zod/v3';

const idFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(40, 'höchstens 40 Zeichen')
  .regex(/^[A-Za-z0-9_-]+$/, 'nur Buchstaben, Ziffern, _ und -');

function pflichtText(max: number) {
  return z
    .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
    .trim()
    .min(1, 'Pflichtfeld')
    .max(max, `höchstens ${max} Zeichen`);
}

/** Freiwilliger Text: fehlt oder ist nicht leer (leere Felder lässt das Formular weg). */
function freiText(max: number) {
  return pflichtText(max).optional();
}

const LISTE = { required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Liste sein' };

const zahlFeld = z.number({
  required_error: 'Pflichtfeld',
  invalid_type_error: 'muss eine Zahl sein',
});

const ganzNichtNegativ = zahlFeld
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

/** Abrechnung bei Mehr-/Minderlieferung innerhalb der Toleranz. */
export const ABRECHNUNGEN = ['staffel', 'geliefert'] as const;
export type Abrechnung = (typeof ABRECHNUNGEN)[number];

/** Liefermengen-Regel: Toleranz in % (0 = genaue Menge) und Abrechnung. */
export const MengenregelSchema = z.object({
  toleranzProzent: zahlFeld.min(0, 'darf nicht negativ sein').max(50, 'höchstens 50').optional(),
  abrechnung: z.enum(ABRECHNUNGEN, { message: 'Abrechnung unbekannt' }).optional(),
});

export type Mengenregel = z.infer<typeof MengenregelSchema>;

/** Standard, wenn nichts angegeben ist: ± 10 % (übliche AGB), Staffelpreis bleibt. */
export const STANDARD_MENGENREGEL: { toleranzProzent: number; abrechnung: Abrechnung } = {
  toleranzProzent: 10,
  abrechnung: 'staffel',
};

/** Schlüssel eines Stichworts für Vergleiche: getrimmt, klein, Leerraum zusammengefasst. */
export function stichwortSchluessel(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// T165: Partner (Geschäftspartner) – Lieferant, Kunde oder beides

/** Rolle eines Partners. Ohne Angabe: Lieferant (alte Daten). */
export const PARTNER_ROLLEN = ['lieferant', 'kunde'] as const;
export type PartnerRolle = (typeof PARTNER_ROLLEN)[number];

/** Art einer Adresse: Firmensitz, Rechnung, Lieferung, Angebot. */
export const ADRESS_ARTEN = ['firma', 'rechnung', 'lieferung', 'angebot'] as const;
export type AdressArt = (typeof ADRESS_ARTEN)[number];

const emailFeld = z
  .string({ invalid_type_error: 'muss ein Text sein' })
  .trim()
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'E-Mail-Adresse ungültig')
  .max(120, 'höchstens 120 Zeichen')
  .optional();

/** Web-Adresse mit http:// oder https:// (keine Zugangsdaten in der Adresse). */
const webFeld = z
  .string({ invalid_type_error: 'muss ein Text sein' })
  .trim()
  .max(300, 'höchstens 300 Zeichen')
  .regex(
    /^https?:\/\/[^\s/@]+\.[^\s@]*$/i,
    'Adresse mit https:// angeben, z. B. https://shop.example.de',
  )
  .optional();

/** Ansprechpartner: Name, Funktion (z. B. Einkauf, Buchhaltung), E-Mail, Telefon. */
export const KontaktSchema = z.object({
  name: pflichtText(80),
  funktion: freiText(60),
  email: emailFeld,
  telefon: freiText(40),
});
export type Kontakt = z.infer<typeof KontaktSchema>;

/** Adresse mit Art; `standard` = die übliche Adresse dieser Art. */
export const AdresseSchema = z.object({
  art: z.enum(ADRESS_ARTEN, { message: 'Art unbekannt' }),
  zusatz: freiText(80),
  strasse: freiText(120),
  plz: freiText(10),
  ort: freiText(80),
  land: freiText(40),
  standard: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
});
export type Adresse = z.infer<typeof AdresseSchema>;

/**
 * Lieferant (für Fremdarbeit): Kontakt, Stichwörter (frei, zum Filtern, z. B. „Offsetdruck“),
 * Beschreibung (was der Lieferant macht), Standards für Lieferzeit, Liefermengen-Regel und
 * Aufschlag, Notiz (z. B. AGB). Doppelte Stichwörter (ohne Groß-/Kleinschreibung) sind ein Fehler.
 * Geld in Zehntelcent.
 */
export const LieferantSchema = MengenregelSchema.extend({
  id: idFeld,
  name: pflichtText(80),
  ansprechpartner: freiText(80),
  email: z
    .string({ invalid_type_error: 'muss ein Text sein' })
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'E-Mail-Adresse ungültig')
    .max(120, 'höchstens 120 Zeichen')
    .optional(),
  telefon: freiText(40),
  /** T165: Lieferant, Kunde oder beides; fehlt = Lieferant. */
  rollen: z
    .array(z.enum(PARTNER_ROLLEN, { message: 'Rolle unbekannt' }), LISTE)
    .min(1, 'mindestens eine Rolle')
    .optional(),
  webseite: webFeld,
  /** Onlineshop/Portal des Lieferanten (nur die Adresse – Zugangsdaten gehören nicht hierher). */
  shop: webFeld,
  /** Unsere Kundennummer bei diesem Lieferanten. */
  unsereKundennummer: freiText(40),
  /** Kundennummer in Paginanet (für Kunden; Paginanet bleibt das Original). */
  kundennummer: freiText(40),
  mindestbestellwertZehntelcent: ganzNichtNegativ.optional(),
  versandkostenZehntelcent: ganzNichtNegativ.optional(),
  versandfreiAbZehntelcent: ganzNichtNegativ.optional(),
  /** T182: Vorgaben für den Einstand neuer Preise dieses Lieferanten. */
  skontoProzent: z
    .number({ invalid_type_error: 'muss eine Zahl sein' })
    .min(0, 'darf nicht negativ sein')
    .max(100, 'höchstens 100')
    .optional(),
  rabattProzent: z
    .number({ invalid_type_error: 'muss eine Zahl sein' })
    .min(0, 'darf nicht negativ sein')
    .max(100, 'höchstens 100')
    .optional(),
  zahlungsbedingung: freiText(200),
  kontakte: z.array(KontaktSchema, LISTE).optional(),
  adressen: z.array(AdresseSchema, LISTE).optional(),
  /** Wie der Lieferant in Materialpreisen heißt (z. B. „Berberich“), falls anders als der Name. */
  namenInPreisen: z.array(pflichtText(80), LISTE).optional(),
  stichworte: z.array(pflichtText(40), LISTE).optional(),
  beschreibung: freiText(2000),
  lieferzeitTage: ganzNichtNegativ.optional(),
  aufschlagProzent: zahlFeld
    .min(0, 'darf nicht negativ sein')
    .max(1000, 'höchstens 1000')
    .optional(),
  aufschlagFestZehntelcent: ganzNichtNegativ.optional(),
  /** Gewinnaufschlag der Kalkulation zusätzlich zu diesem Aufschlag (Standard: ja). */
  gewinnZusaetzlich: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  notiz: freiText(2000),
}).superRefine((l, ctx) => {
  // T165: je Adressart höchstens eine Standardadresse; Rollen nicht doppelt
  for (const art of ADRESS_ARTEN) {
    const standard = (l.adressen ?? [])
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.art === art && a.standard === true);
    for (const { i } of standard.slice(1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adressen', i, 'standard'],
        message: `nur eine Standardadresse je Art (${art})`,
      });
    }
  }
  if (l.rollen !== undefined && new Set(l.rollen).size !== l.rollen.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rollen'], message: 'Rolle doppelt' });
  }
  const gesehen = new Set<string>();
  (l.stichworte ?? []).forEach((wort, i) => {
    const schluessel = stichwortSchluessel(wort);
    if (gesehen.has(schluessel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stichworte', i],
        message: `Stichwort doppelt: ${wort}`,
      });
    }
    gesehen.add(schluessel);
  });
});

/**
 * Stellt Lieferanten aus T38 um (vor der Prüfung): leistungen (Arbeitsschritt-IDs) → Stichwörter
 * mit dem Namen aus dem Katalog (unbekannte ID bleibt als Text), leistungenFrei → Beschreibung
 * (eine je Zeile). Alles andere bleibt unverändert.
 */
export function alteLieferantenfelder(roh: unknown): unknown {
  if (typeof roh !== 'object' || roh === null || Array.isArray(roh)) return roh;
  const produktion = roh as { arbeitsschritte?: unknown; lieferanten?: unknown };
  if (!Array.isArray(produktion.lieferanten)) return roh;
  const namen = new Map<string, string>();
  if (Array.isArray(produktion.arbeitsschritte)) {
    for (const s of produktion.arbeitsschritte as { id?: unknown; name?: unknown }[]) {
      if (typeof s?.id === 'string' && typeof s.name === 'string') namen.set(s.id, s.name);
    }
  }
  const lieferanten = produktion.lieferanten.map((eintrag: unknown) => {
    if (typeof eintrag !== 'object' || eintrag === null) return eintrag;
    const alt = eintrag as Record<string, unknown>;
    if (!('leistungen' in alt) && !('leistungenFrei' in alt)) return eintrag;
    const neu: Record<string, unknown> = { ...alt };
    delete neu['leistungen'];
    delete neu['leistungenFrei'];
    const worte = Array.isArray(alt['leistungen'])
      ? (alt['leistungen'] as unknown[]).map((id) =>
          typeof id === 'string' ? (namen.get(id) ?? id) : id,
        )
      : [];
    const vorhanden = Array.isArray(alt['stichworte']) ? (alt['stichworte'] as unknown[]) : [];
    if (worte.length + vorhanden.length > 0) neu['stichworte'] = [...vorhanden, ...worte];
    if (Array.isArray(alt['leistungenFrei']) && alt['leistungenFrei'].length > 0) {
      const text = (alt['leistungenFrei'] as unknown[]).map(String).join('\n');
      neu['beschreibung'] =
        typeof alt['beschreibung'] === 'string' ? `${alt['beschreibung']}\n${text}` : text;
    }
    return neu;
  });
  return { ...(roh as Record<string, unknown>), lieferanten };
}

export type Lieferant = z.infer<typeof LieferantSchema>;

/** T165: Rollen eines Partners (fehlt = Lieferant). */
export function partnerRollen(l: Pick<Lieferant, 'rollen'>): readonly PartnerRolle[] {
  return l.rollen ?? ['lieferant'];
}

const namensSchluessel = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * T166: Der Partner zu einem Lieferanten-Namen aus einem Materialpreis: gleicher Name oder einer
 * der „Namen in Preisen“ (ohne Groß-/Kleinschreibung). Kein Treffer → undefined.
 */
export function partnerZumPreisnamen(
  partner: readonly Lieferant[],
  name: string,
): Lieferant | undefined {
  const s = namensSchluessel(name);
  return partner.find(
    (p) =>
      namensSchluessel(p.name) === s ||
      (p.namenInPreisen ?? []).some((n) => namensSchluessel(n) === s),
  );
}
