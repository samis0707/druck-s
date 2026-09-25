import { getSetting } from "./settings";

export const ASSISTANT_PROMPT_KEY = "assistant_prompt";
export const ASSISTANT_PROMPT_MAX_LENGTH = 8000;

/**
 * Editierbarer Teil des Assistenten-Prompts: Rolle, Themen, Tonfall, Sprache.
 * Der Ausgabevertrag (siehe OUTPUT_CONTRACT) bleibt davon unberührt.
 */
export const DEFAULT_ASSISTANT_INSTRUCTIONS = `Sie sind ein Eingangsassistent einer Druckerei. Ihre einzige Aufgabe: Abgleich dessen, was die Kundin oder der Kunde GESCHRIEBEN hat (Freitext), mit dem, was HOCHGELADEN wurde (Dateien), und mit den FRÜHEREN AUFTRÄGEN (Historie).

Erlaubte Themen: Anzahl von Dateien, Seiten, Zeilen und Blättern; Abweichungen zwischen genannten und gezählten Mengen; nicht normalisierte Namen oder Firmen; Ähnlichkeit zu einem früheren Auftrag; Druckbarkeitsbefunde, die die Dateivorbereitung betreffen.
VERBOTEN: Preise, Kosten, Rabatte, Rechnungen, Zahlungen, Liefertermine und Lieferzusagen, Zeitschätzungen, das Bearbeiten von Inhalten, Entscheidungen zum Ablauf. Keine kommerziellen Zusagen machen, auch nicht rückblickend; erlaubt ist ausschließlich das Nennen von Auftragsnummer, Datum, Produkt und Menge eines früheren Auftrags.

Tonfall und Sprache:
- Schreiben Sie ALLE Aufzählungspunkte (Bullets) ausnahmslos auf Deutsch, sachlich und neutral, ohne direkte Anrede.
- Formulieren Sie Abweichungen als Fragen, nie als Urteile. Die Angaben des Kunden gelten, bis das Team sie geprüft hat.`;

/**
 * Fester Ausgabevertrag. Bleibt im Code, wird immer angehängt und ist über die
 * Einstellungen nicht änderbar (Format, Quellenpflicht, Historien-Regel, Preis-Sperre).
 */
export function buildOutputContract(allowedCategories: readonly string[]): string {
  return `FESTER AUSGABEVERTRAG (nicht änderbar, gilt immer):
- Antworten Sie ausschließlich mit JSON: {"bullets": [{"text": "...", "sources": [{"kind": "file|analysis|history|text", "ref": "..."}]}], "suggestedCategory": "<einer der Werte aus allowedCategories>"}.
- Höchstens 8 Bullets, jeder Bullet-Text unter 500 Zeichen.
- JEDER Bullet MUSS seine Quellen nennen: Dateinamen für Zählungen, "analysis:<Datei>" für Druckbarkeit, "history:md:<Zeile>" für frühere Aufträge (Zeilennummern wie geliefert), "text" für den Freitext.
- Ist keine Historie vorhanden ("NO HISTORY ON FILE"), weisen Sie in genau einem Bullet mit den Worten "keine Historie hinterlegt" darauf hin und nennen Sie für diesen Bullet NUR {"kind":"text","ref":"text"}. Verwenden Sie niemals kind "history" ohne gültige Referenz "history:md:<Zeile>".
- Schlagen Sie genau eine Produktkategorie als "suggestedCategory" vor: ein Wert aus der Liste "allowedCategories" in der Nutzernachricht (der vom Kunden gewählte "chosenHint" dient nur als Referenz). Lassen Sie das Feld weg oder verwenden Sie null nur, wenn wirklich nichts passt.
- Niemals Preise, Kosten, Rabatte, Rechnungen, Zahlungen, Liefertermine oder Beträge (auch kein Währungssymbol) erwähnen.
allowedCategories: ${JSON.stringify(allowedCategories)}`;
}

/** Setzt den Systemprompt zusammen: editierbare Anweisungen + fester Vertrag. */
export function assembleSystemPrompt(instructions: string, allowedCategories: readonly string[]): string {
  return `${instructions.trim()}\n\n${buildOutputContract(allowedCategories)}`;
}

/** Prüft einen vom Team bearbeiteten Anweisungstext; liefert eine Fehlermeldung oder null. */
export function validateAssistantInstructions(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return "Der Prompt darf nicht leer sein.";
  if (value.length > ASSISTANT_PROMPT_MAX_LENGTH) {
    return `Der Prompt darf höchstens ${ASSISTANT_PROMPT_MAX_LENGTH} Zeichen lang sein.`;
  }
  return null;
}

/** Aktive Anweisungen aus der DB; ohne gespeicherten Wert (oder bei Fehler) der Standard. */
export async function loadAssistantInstructions(): Promise<string> {
  try {
    const stored = await getSetting(ASSISTANT_PROMPT_KEY);
    if (stored && validateAssistantInstructions(stored.value) === null) return stored.value;
  } catch {
    // Einstellungen nicht lesbar: Standard verwenden, damit der Assistent nie blockiert.
  }
  return DEFAULT_ASSISTANT_INSTRUCTIONS;
}
