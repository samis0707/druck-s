"use client";

import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface AssistantPromptData {
  value: string;
  isDefault: boolean;
  defaultValue: string;
  updatedAt: string | null;
  updatedBy: string | null;
  history: { id: string; value: string; updatedBy: string | null; createdAt: string }[];
}

const MAX_LENGTH = 8000;
const ENDPOINT = "/api/staff/settings/assistant-prompt";

function zeitpunkt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

/** Bearbeitung der Anweisungen für den automatischen Hinweis (Assistent). */
export function AssistantPromptCard({
  daten,
  onChange,
}: {
  daten: AssistantPromptData;
  onChange: (next: AssistantPromptData) => void;
}) {
  const [text, setText] = useState(daten.value);
  const [speichert, setSpeichert] = useState(false);
  const [resetOffen, setResetOffen] = useState(false);

  const veraendert = text !== daten.value;
  const zuLang = text.length > MAX_LENGTH;
  const leer = text.trim().length === 0;

  async function senden(init: RequestInit, erfolg: string): Promise<boolean> {
    setSpeichert(true);
    try {
      const res = await fetch(ENDPOINT, { ...init, headers: { "content-type": "application/json" } });
      const json = (await res.json().catch(() => ({}))) as Partial<AssistantPromptData> & { error?: string };
      if (!res.ok) {
        toast.add({ description: json.error ?? "Speichern fehlgeschlagen.", type: "error" });
        return false;
      }
      const next = json as AssistantPromptData;
      onChange(next);
      setText(next.value);
      toast.add({ description: erfolg, type: "success" });
      return true;
    } catch {
      toast.add({ description: "Keine Verbindung zum Server.", type: "error" });
      return false;
    } finally {
      setSpeichert(false);
    }
  }

  function speichern() {
    void senden({ method: "PUT", body: JSON.stringify({ value: text }) }, "Prompt gespeichert.");
  }

  async function standardWiederherstellen() {
    const ok = await senden({ method: "POST", body: JSON.stringify({ action: "reset" }) }, "Standard wiederhergestellt.");
    if (ok) setResetOffen(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Automatischer Hinweis: Anweisungen
          <Badge variant="outline">{daten.isDefault ? "Standard" : "Angepasst"}</Badge>
        </CardTitle>
        <CardDescription>
          Dieser Text steuert Rolle, erlaubte Themen, Tonfall und Sprache des automatischen Hinweises. Änderungen
          wirken bei neu erzeugten Hinweisen zu Anfragen im Status „Eingegangen“; bereits gespeicherte Hinweise
          bleiben unverändert.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="assistant-prompt" className="text-sm font-medium">
            Anweisungstext
          </label>
          <Textarea
            id="assistant-prompt"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={18}
            spellCheck={false}
            aria-invalid={zuLang || leer}
            className="min-h-96 resize-y font-mono text-xs leading-relaxed md:text-xs"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {daten.updatedAt
                ? `Zuletzt geändert am ${zeitpunkt(daten.updatedAt)}${daten.updatedBy ? ` von ${daten.updatedBy}` : ""}`
                : "Es ist noch keine eigene Fassung gespeichert."}
            </span>
            <span className={zuLang ? "text-destructive" : undefined} aria-live="polite">
              {text.length.toLocaleString("de-DE")} / {MAX_LENGTH.toLocaleString("de-DE")} Zeichen
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          Fest im System hinterlegt und hier nicht änderbar: das Ausgabeformat (JSON mit Aufzählungspunkten,
          Quellenangaben und Kategorievorschlag), die Quellenpflicht, die Regel zur fehlenden Historie sowie die
          Sperre für Preise, Kosten, Rabatte, Rechnungen, Zahlungen und Liefertermine. Diese Vorgaben werden Ihrem
          Text immer angehängt und bei jedem Hinweis automatisch geprüft.
        </div>
        {zuLang && <p className="text-sm text-destructive">Der Text ist zu lang (höchstens {MAX_LENGTH} Zeichen).</p>}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button onClick={speichern} disabled={speichert || !veraendert || zuLang || leer}>
          Speichern
        </Button>
        <Button variant="outline" onClick={() => setText(daten.value)} disabled={speichert || !veraendert}>
          Verwerfen
        </Button>
        <Button variant="outline" onClick={() => setResetOffen(true)} disabled={speichert || daten.isDefault}>
          Standard wiederherstellen
        </Button>
      </CardFooter>

      <CardContent>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Verlauf ({daten.history.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {daten.history.length === 0 && (
              <li className="text-muted-foreground">Noch keine Änderungen vorhanden.</li>
            )}
            {daten.history.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="tabular-nums">{zeitpunkt(h.createdAt)}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.updatedBy ?? "unbekannt"} · {h.value.length.toLocaleString("de-DE")} Zeichen
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={speichert || h.value === text}
                  onClick={() => setText(h.value)}
                >
                  Diese Version laden
                </Button>
              </li>
            ))}
          </ul>
          {daten.history.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Eine geladene Version wird erst nach „Speichern“ wirksam.
            </p>
          )}
        </details>
      </CardContent>

      <AlertDialog open={resetOffen} onOpenChange={setResetOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Standard wiederherstellen?</AlertDialogTitle>
            <AlertDialogDescription>
              Ihre angepasste Fassung wird durch den Standardtext ersetzt. Sie bleibt im Verlauf erhalten und kann
              von dort erneut geladen werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void standardWiederherstellen();
              }}
            >
              Wiederherstellen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
