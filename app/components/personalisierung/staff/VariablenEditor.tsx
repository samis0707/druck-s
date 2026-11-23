"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Haken, Zeile, ZahlFeld } from "@/components/personalisierung/staff/bausteine";
import { felderMitVariable } from "@/lib/personalisierung/ui/editor";
import type { Variable, Vorlage } from "@/lib/personalisierung/schema";

/**
 * Eine Eingabe, die Kunden ausfüllen: Bezeichnung (daraus entsteht der Platzhalter-Name automatisch),
 * Beispielwert, Pflicht, maximale Zeichenzahl, Hilfetext.
 */
export function VariableBearbeiten({
  vorlage,
  variable,
  onBezeichnung,
  onAendern,
  onLoeschen,
  dataTour,
  idPrefix = "",
}: {
  vorlage: Vorlage;
  variable: Variable;
  onBezeichnung: (bezeichnung: string) => void;
  onAendern: (teil: Partial<Omit<Variable, "schluessel">>, schluessel?: string) => void;
  onLoeschen?: () => void;
  dataTour?: string;
  /** Unterscheidet die Eingabefelder, wenn dieselbe Eingabe an zwei Stellen erscheint */
  idPrefix?: string;
}) {
  const k = variable.schluessel;
  const p = idPrefix;
  const felder = felderMitVariable(vorlage, k);
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3" data-tour={dataTour}>
      <Zeile label="Bezeichnung für Kunden" htmlFor={`${p}bez-${k}`} hilfe="So heißt die Eingabe im Formular und in der Tabelle, z. B. „Telefon“.">
        <Input id={`${p}bez-${k}`} value={variable.bezeichnung} maxLength={80} onChange={(e) => onBezeichnung(e.target.value)} />
      </Zeile>
      <p className="text-xs text-muted-foreground">
        Platzhalter: <code className="rounded bg-muted px-1">{`{{${k}}}`}</code> (entsteht automatisch)
      </p>
      <Zeile label="Beispielwert" htmlFor={`${p}bsp-${k}`} hilfe="Erscheint in der Vorschau und in der Beispieltabelle.">
        <Input id={`${p}bsp-${k}`} value={variable.beispiel} maxLength={300} onChange={(e) => onAendern({ beispiel: e.target.value }, `bsp-${k}`)} />
      </Zeile>
      <Zeile label="Hilfetext (optional)" htmlFor={`${p}hilfe-${k}`}>
        <Input id={`${p}hilfe-${k}`} value={variable.hilfe} maxLength={300} onChange={(e) => onAendern({ hilfe: e.target.value }, `hilfe-${k}`)} placeholder="z. B. mit Vorwahl" />
      </Zeile>
      <div className="grid grid-cols-2 items-end gap-3">
        <Haken label="Pflichtangabe" checked={variable.pflicht} onChange={(v) => onAendern({ pflicht: v })} />
        <ZahlFeld label="Max. Zeichen" wert={variable.maxLaenge ?? 0} min={0} max={2000} schritt={1} hilfe="0 = keine Grenze" onChange={(n) => onAendern({ maxLaenge: n > 0 ? Math.round(n) : null })} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{felder.length ? `Verwendet in: ${felder.map((f) => f.name || f.id).join(", ")}` : "Wird noch in keinem Feld verwendet."}</p>
        {onLoeschen && (
          <Button type="button" size="xs" variant="destructive" onClick={onLoeschen}>
            Entfernen
          </Button>
        )}
      </div>
    </div>
  );
}
