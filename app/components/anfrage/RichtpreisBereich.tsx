"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  ergebnisBruttoText,
  ergebnisJeStueckText,
  ergebnisNettoText,
  kundenFrageHilfe,
  kundenFrageTitel,
  voreinstellungen,
  type KundenFrage,
  type OeffentlichesErgebnis,
} from "@/lib/kalkulation/kundenFragen";

type Artikel = { id: string; titel: string; einheit: string; text: string | null; produkte: string[]; fragen: KundenFrage[] };
type Antwort = string | { breiteMm: number; hoeheMm: number };

/** Angaben, die mit der Anfrage mitgehen (der Server rechnet beim Bestätigen neu). */
export type RichtpreisAngaben = { artikel: string; antworten: Record<string, Antwort>; auflagen: number[] };

const MAX_AUFLAGEN = 3;
const SELECT_KLASSE =
  "h-10 w-full rounded-2xl border-[1.5px] border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

/**
 * Optionaler Bereich „Ungefähren Preis anzeigen“ der offenen Anfrage. Erscheint nur, wenn der
 * Richtpreis aktiv ist und es für das Produkt einen freigegebenen Artikel gibt; sonst unsichtbar.
 */
export function RichtpreisBereich({ produkt, onChange }: { produkt: string; onChange: (a: RichtpreisAngaben | null) => void }) {
  const [liste, setListe] = useState<Artikel[] | null>(null);
  const [offen, setOffen] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<{ produkt: string; id: string } | null>(null);
  // Eingaben je Artikel; was nicht geändert wurde, bleibt die Voreinstellung
  const [geaendert, setGeaendert] = useState<Record<string, Record<string, string>>>({});
  const [formate, setFormate] = useState<Record<string, Record<string, { b: string; h: string }>>>({});
  const [auflagen, setAuflagen] = useState<string[]>(["500"]);
  // Antwort gehört zu genau den Angaben (Schlüssel), für die sie berechnet wurde
  const [antwort, setAntwort] = useState<{ key: string; ergebnis: OeffentlichesErgebnis[] | null; fehler: string | null } | null>(null);
  const id = useId();

  useEffect(() => {
    let aktiv = true;
    fetch("/api/v1/richtpreis/artikel")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { aktiv?: boolean; artikel?: Artikel[] } | null) => {
        if (aktiv) setListe(j?.aktiv && Array.isArray(j.artikel) ? j.artikel : []);
      })
      .catch(() => {
        if (aktiv) setListe([]);
      });
    return () => {
      aktiv = false;
    };
  }, []);

  const passend = useMemo(() => (liste ?? []).filter((a) => a.produkte.includes(produkt)), [liste, produkt]);
  const artikel = passend.find((a) => gewaehlt?.produkt === produkt && a.id === gewaehlt.id) ?? passend[0] ?? null;
  const eingaben = useMemo(() => (artikel ? { ...voreinstellungen(artikel.fragen), ...(geaendert[artikel.id] ?? {}) } : {}), [artikel, geaendert]);
  const format = useMemo(() => (artikel ? (formate[artikel.id] ?? {}) : {}), [artikel, formate]) as Record<string, { b: string; h: string }>;

  const angaben = useMemo<RichtpreisAngaben | null>(() => {
    if (!artikel) return null;
    const nummern = auflagen.map((a) => Number(a.trim()));
    if (nummern.length === 0 || nummern.some((n) => !Number.isInteger(n) || n < 1 || n > 1_000_000)) return null;
    const antworten: Record<string, Antwort> = {};
    for (const f of artikel.fragen) {
      if (f.art === "format") {
        const x = format[f.schluessel];
        const b = Number(x?.b);
        const h = Number(x?.h);
        if (x && Number.isInteger(b) && Number.isInteger(h) && b >= 10 && h >= 10 && b <= 3000 && h <= 3000) antworten[f.schluessel] = { breiteMm: b, hoeheMm: h };
      } else if (eingaben[f.schluessel]?.trim()) antworten[f.schluessel] = eingaben[f.schluessel].trim();
    }
    return { artikel: artikel.id, antworten, auflagen: nummern };
  }, [artikel, eingaben, format, auflagen]);
  const key = angaben ? JSON.stringify(angaben) : "";

  // Nur was der Besucher geöffnet und gesehen hat, geht mit der Anfrage mit.
  useEffect(() => {
    onChange(offen && angaben ? angaben : null);
  }, [offen, angaben, onChange]);

  // Live-Ergebnis, entprellt
  useEffect(() => {
    if (!offen || !angaben) return;
    const abbruch = new AbortController();
    const nachricht = "Der Preis lässt sich gerade nicht berechnen. Die Anfrage können Sie trotzdem absenden.";
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/v1/richtpreis", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(angaben),
          signal: abbruch.signal,
        });
        const j = (await res.json().catch(() => ({}))) as { auflagen?: OeffentlichesErgebnis[] };
        if (res.ok && j.auflagen) setAntwort({ key, ergebnis: j.auflagen, fehler: null });
        else setAntwort({ key, ergebnis: null, fehler: res.status === 429 ? "Gerade zu viele Berechnungen. Sie können die Anfrage trotzdem absenden." : nachricht });
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") setAntwort({ key, ergebnis: null, fehler: nachricht });
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      abbruch.abort();
    };
  }, [offen, angaben, key]);

  const aktuell = antwort && antwort.key === key ? antwort : null;
  const ergebnis = aktuell?.ergebnis ?? null;
  const fehler = aktuell?.fehler ?? null;
  const setzeEingabe = (schluessel: string, wert: string) => artikel && setGeaendert({ ...geaendert, [artikel.id]: { ...(geaendert[artikel.id] ?? {}), [schluessel]: wert } });
  const setzeFormat = (schluessel: string, teil: Partial<{ b: string; h: string }>) =>
    artikel && setFormate({ ...formate, [artikel.id]: { ...(formate[artikel.id] ?? {}), [schluessel]: { ...(formate[artikel.id]?.[schluessel] ?? { b: "", h: "" }), ...teil } } });

  if (!artikel) return null;

  return (
    <Card data-tour="anfrage-richtpreis">
      <CardContent className="space-y-4">
        {!offen ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Möchten Sie vorab wissen, was das ungefähr kostet? Das ist freiwillig und unverbindlich.</p>
            <Button type="button" variant="outline" onClick={() => setOffen(true)} data-umami-event="richtpreis-geoeffnet">
              Ungefähren Preis anzeigen
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium">Ungefährer Preis</h2>
                <p className="text-sm text-muted-foreground">Beantworten Sie ein paar Fragen. Der Preis aktualisiert sich von selbst.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOffen(false)}>
                Ausblenden
              </Button>
            </div>

            {passend.length > 1 && (
              <div className="space-y-1">
                <Label htmlFor={`${id}-artikel`}>Variante</Label>
                <select id={`${id}-artikel`} className={SELECT_KLASSE} value={artikel.id} onChange={(e) => setGewaehlt({ produkt, id: e.target.value })}>
                  {passend.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.titel}
                    </option>
                  ))}
                </select>
                {artikel.text && <p className="text-xs text-muted-foreground">{artikel.text}</p>}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {artikel.fragen.map((f) => {
                const fid = `${id}-${f.schluessel.replace(/[^a-z0-9]/gi, "_")}`;
                const hilfe = kundenFrageHilfe(f);
                return (
                  <div key={f.schluessel} className="space-y-1">
                    <Label htmlFor={f.art === "format" ? `${fid}-b` : fid}>{kundenFrageTitel(f.titel)}</Label>
                    {f.art === "auswahl" ? (
                      <select id={fid} className={SELECT_KLASSE} value={eingaben[f.schluessel] ?? ""} onChange={(e) => setzeEingabe(f.schluessel, e.target.value)}>
                        {f.optionen.map((o) => (
                          <option key={o.wert} value={o.wert}>
                            {o.text}
                          </option>
                        ))}
                      </select>
                    ) : f.art === "format" ? (
                      <div className="flex items-center gap-2">
                        <Input id={`${fid}-b`} inputMode="numeric" aria-label="Breite in Millimetern" placeholder="Breite" value={format[f.schluessel]?.b ?? ""} onChange={(e) => setzeFormat(f.schluessel, { b: e.target.value })} />
                        <span aria-hidden>×</span>
                        <Input id={`${fid}-h`} inputMode="numeric" aria-label="Höhe in Millimetern" placeholder="Höhe" value={format[f.schluessel]?.h ?? ""} onChange={(e) => setzeFormat(f.schluessel, { h: e.target.value })} />
                        <span className="text-sm text-muted-foreground">mm</span>
                      </div>
                    ) : (
                      <Input id={fid} inputMode={f.art === "zahl" ? "numeric" : "text"} value={eingaben[f.schluessel] ?? ""} onChange={(e) => setzeEingabe(f.schluessel, e.target.value)} maxLength={80} />
                    )}
                    {hilfe && <p className="text-xs text-muted-foreground">{hilfe}</p>}
                  </div>
                );
              })}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Auflage (Stückzahl)</legend>
              <p className="text-xs text-muted-foreground">Bis zu {MAX_AUFLAGEN} Auflagen nebeneinander vergleichen.</p>
              <div className="flex flex-wrap items-center gap-3">
                {auflagen.map((a, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input
                      inputMode="numeric"
                      className="w-28"
                      aria-label={`Auflage ${i + 1}`}
                      value={a}
                      onChange={(e) => setAuflagen(auflagen.map((x, j) => (j === i ? e.target.value.replace(/[^\d]/g, "") : x)))}
                    />
                    {auflagen.length > 1 && (
                      <button type="button" className="px-2 text-sm text-muted-foreground underline" aria-label={`Auflage ${i + 1} entfernen`} onClick={() => setAuflagen(auflagen.filter((_, j) => j !== i))}>
                        Entfernen
                      </button>
                    )}
                  </div>
                ))}
                {auflagen.length < MAX_AUFLAGEN && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setAuflagen([...auflagen, ""])}>
                    Auflage hinzufügen
                  </Button>
                )}
              </div>
            </fieldset>

            <div aria-live="polite" aria-busy={angaben !== null && !aktuell} className="space-y-3 rounded-2xl bg-muted/50 p-4">
              {!angaben ? (
                <p className="text-sm text-muted-foreground">Bitte Auflage (1 bis 1.000.000) und Format vollständig angeben.</p>
              ) : fehler ? (
                <p className="text-sm">{fehler}</p>
              ) : !ergebnis ? (
                <p className="text-sm text-muted-foreground">Preis wird berechnet …</p>
              ) : (
                <ul className="space-y-3">
                  {ergebnis.map((e) => (
                    <li key={e.auflage} className="text-sm">
                      <span className="font-medium">{e.auflage.toLocaleString("de-DE")} Stück: </span>
                      <span className="font-semibold">{ergebnisNettoText(e)}</span>
                      {e.status === "preis" && (
                        <span className="block text-muted-foreground">
                          ({ergebnisBruttoText(e)}) · {ergebnisJeStueckText(e)}
                        </span>
                      )}
                      {e.status === "auf_anfrage" && <span className="block text-muted-foreground">Dazu nennen wir Ihnen den Preis gern im Angebot.</span>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                <strong>Unverbindlicher Richtpreis.</strong> Der verbindliche Preis kommt mit dem Angebot.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
