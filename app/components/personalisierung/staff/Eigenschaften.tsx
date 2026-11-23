"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FarbWahl, Haken, Meldungsbox, Segment, Zeile, ZahlFeld } from "@/components/personalisierung/staff/bausteine";
import { VariableBearbeiten } from "@/components/personalisierung/staff/VariablenEditor";
import {
  aktualisiereFeld,
  aktualisiereVariable,
  dupliziereFeld,
  entferneFeld,
  fuegePlatzhalterEin,
  fuegeVariableHinzu,
  istQuadratisch,
  setzeBezeichnung,
  setzeRechteck,
  type FeldWarnung,
} from "@/lib/personalisierung/ui/editor";
import {
  SYMBOLOGIE_NAMEN,
  SYMBOLOGIEN,
  VCARD_EIGENSCHAFTEN,
  variablenInFeld,
  type BarcodeFeld,
  type Farbe,
  type Feld,
  type QrFeld,
  type TextFeld,
  type VCardEigenschaft,
  type VCardFeld,
  type Vorlage,
} from "@/lib/personalisierung/schema";
import type { SchriftEintrag } from "@/lib/personalisierung/ui/browser-engine";

const VCARD_NAMEN: Record<VCardEigenschaft, string> = {
  vorname: "Vorname",
  nachname: "Nachname",
  firma: "Firma",
  funktion: "Funktion",
  telefon: "Telefon",
  mobil: "Mobil",
  fax: "Fax",
  email: "E-Mail",
  web: "Webseite",
  strasse: "Straße",
  plz: "PLZ",
  ort: "Ort",
  land: "Land",
  notiz: "Notiz",
};

export interface EigenschaftenProps {
  vorlage: Vorlage;
  feld: Feld;
  farben: Farbe[];
  schriften: SchriftEintrag[];
  warnungen: FeldWarnung[];
  engineMeldungen: string[];
  aendere: (neu: Vorlage | ((v: Vorlage) => Vorlage), schluessel?: string) => void;
  onAuswahl: (id: string | null) => void;
}

/** Textfeld für Inhalte mit Platzhaltern; die Einfüge-Hilfe setzt {{…}} an der Cursorposition. */
function InhaltMitEinfuegehilfe({ vorlage, feld, wert, einzeilig, onText, aendere, bezeichnung }: { vorlage: Vorlage; feld: Feld; wert: string; einzeilig?: boolean; onText: (t: string) => void; aendere: EigenschaftenProps["aendere"]; bezeichnung: string }) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  function einfuegen(schluessel: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? wert.length;
    const ende = el?.selectionEnd ?? wert.length;
    const r = fuegePlatzhalterEin(wert, start, ende, schluessel);
    onText(r.text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.cursor, r.cursor);
    });
  }
  function neueEingabe() {
    const name = window.prompt("Wie soll die neue Eingabe heißen? (z. B. „Telefon“)", "");
    if (!name?.trim()) return;
    const r = fuegeVariableHinzu(vorlage, name.trim(), "");
    const start = ref.current?.selectionStart ?? wert.length;
    const ende = ref.current?.selectionEnd ?? wert.length;
    const text = fuegePlatzhalterEin(wert, start, ende, r.schluessel).text;
    aendere(aktualisiereFeld(r.vorlage, feld.id, (feld.typ === "text" ? { vorlage: text } : { inhalt: text }) as Partial<Feld>));
  }
  return (
    <div className="space-y-2">
      <Zeile label={bezeichnung} htmlFor={`inhalt-${feld.id}`} hilfe="Hier dürfen feste Texte und Eingaben stehen, z. B. „Tel. {{telefon}}“. Zeilen, deren Eingaben leer sind, entfallen.">
        {einzeilig ? (
          <Input id={`inhalt-${feld.id}`} ref={ref as React.RefObject<HTMLInputElement>} value={wert} maxLength={1000} onChange={(e) => onText(e.target.value)} className="font-mono text-sm" />
        ) : (
          <Textarea id={`inhalt-${feld.id}`} ref={ref as React.RefObject<HTMLTextAreaElement>} value={wert} rows={4} maxLength={2000} onChange={(e) => onText(e.target.value)} className="font-mono text-sm" />
        )}
      </Zeile>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Eingabe einfügen" data-tour="pers-einfuegen">
        <span className="text-xs text-muted-foreground">Eingabe einfügen:</span>
        {vorlage.variablen.map((v) => (
          <button key={v.schluessel} type="button" onClick={() => einfuegen(v.schluessel)} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs hover:border-ring">
            + {v.bezeichnung}
          </button>
        ))}
        <button type="button" onClick={neueEingabe} className="rounded-full border border-dashed border-primary px-2.5 py-0.5 text-xs text-primary hover:bg-primary/10">
          + Neue Eingabe …
        </button>
      </div>
    </div>
  );
}

function TextEigenschaften({ vorlage, feld, farben, schriften, aendere }: { vorlage: Vorlage; feld: TextFeld; farben: Farbe[]; schriften: SchriftEintrag[]; aendere: EigenschaftenProps["aendere"] }) {
  const familien = ["Helvetica", ...new Set(schriften.map((s) => s.familie))];
  const set = (teil: Partial<TextFeld>, key?: string) => aendere((v) => aktualisiereFeld(v, feld.id, teil as Partial<Feld>), key);
  const schnitte = schriften.filter((s) => s.familie === feld.schrift.familie).map((s) => s.schnitt);
  const eingebaut = feld.schrift.familie === "Helvetica";
  const hatFett = eingebaut || schnitte.some((s) => s === "bold" || s === "bolditalic");
  const hatKursiv = eingebaut || schnitte.some((s) => s === "italic" || s === "bolditalic");
  return (
    <>
      <InhaltMitEinfuegehilfe vorlage={vorlage} feld={feld} wert={feld.vorlage} einzeilig={feld.umbruch === "einzeilig"} onText={(t) => set({ vorlage: t || " " }, `inhalt-${feld.id}`)} aendere={aendere} bezeichnung="Inhalt" />
      <Zeile label="Schrift">
        <Select value={feld.schrift.familie} onValueChange={(f) => set({ schrift: { ...feld.schrift, familie: f } })} options={familien.map((f) => ({ value: f, label: f === "Helvetica" ? "Helvetica (Standard)" : f }))} />
      </Zeile>
      <div className="flex flex-wrap gap-4">
        <Haken label="Fett" checked={feld.schrift.fett} onChange={(b) => set({ schrift: { ...feld.schrift, fett: b } })} />
        <Haken label="Kursiv" checked={feld.schrift.kursiv} onChange={(b) => set({ schrift: { ...feld.schrift, kursiv: b } })} />
      </div>
      {((feld.schrift.fett && !hatFett) || (feld.schrift.kursiv && !hatKursiv)) && <Meldungsbox ton="hinweis">Für „{feld.schrift.familie}“ fehlt dieser Schnitt in der Schriftenbibliothek. Laden Sie ihn unter „Schriften &amp; Farben“ hoch.</Meldungsbox>}
      <div className="grid grid-cols-2 gap-3">
        <ZahlFeld label="Schriftgröße" einheit="pt" wert={feld.groesse} min={2} max={500} onChange={(n) => set({ groesse: n }, `gr-${feld.id}`)} />
        {feld.umbruch === "mehrzeilig" && <ZahlFeld label="Zeilenabstand" wert={feld.zeilenabstand} min={0.7} max={3} schritt={0.05} hilfe="1,2 = 120 %" onChange={(n) => set({ zeilenabstand: n }, `za-${feld.id}`)} />}
      </div>
      <Zeile label="Farbe">
        <FarbWahl label="Textfarbe" wert={feld.farbe} farben={farben} onChange={(n) => n && set({ farbe: n })} />
      </Zeile>
      <Zeile label="Ausrichtung">
        <Segment
          label="Ausrichtung"
          wert={feld.ausrichtung}
          onChange={(a) => set({ ausrichtung: a })}
          optionen={[
            { wert: "links", text: "Links" },
            { wert: "zentriert", text: "Mitte" },
            { wert: "rechts", text: "Rechts" },
            { wert: "block", text: "Block" },
          ]}
        />
      </Zeile>
      <Zeile label="Vertikal im Feld">
        <Segment
          label="Vertikale Ausrichtung"
          wert={feld.vertikal}
          onChange={(a) => set({ vertikal: a })}
          optionen={[
            { wert: "oben", text: "Oben" },
            { wert: "mitte", text: "Mitte" },
            { wert: "unten", text: "Unten" },
          ]}
        />
      </Zeile>
      <Haken label="Alles in Großbuchstaben" checked={feld.grossschreibung === "gross"} onChange={(b) => set({ grossschreibung: b ? "gross" : "keine" })} />
      <div className="space-y-2" data-tour="pers-verkleinern">
        <Haken label="Automatisch verkleinern, bis es passt" checked={feld.verkleinernBis !== null} onChange={(b) => set({ verkleinernBis: b ? Math.max(2, Math.round(feld.groesse * 0.7 * 10) / 10) : null })} hilfe="Lange Namen werden kleiner gesetzt, statt abgeschnitten zu werden." />
        {feld.verkleinernBis !== null && <ZahlFeld label="Mindestgröße" einheit="pt" wert={feld.verkleinernBis} min={2} max={feld.groesse} onChange={(n) => set({ verkleinernBis: n }, `mg-${feld.id}`)} hilfe="Wird es noch kleiner, meldet die Prüfung den Text als zu lang." />}
      </div>
      <Zeile label="Umbruch">
        <Segment label="Umbruch" wert={feld.umbruch} onChange={(u) => set({ umbruch: u })} optionen={[{ wert: "einzeilig", text: "Eine Zeile" }, { wert: "mehrzeilig", text: "Mehrere Zeilen" }]} />
      </Zeile>
    </>
  );
}

function CodeFarben({ feld, farben, aendere }: { feld: BarcodeFeld | QrFeld | VCardFeld; farben: Farbe[]; aendere: EigenschaftenProps["aendere"] }) {
  const set = (teil: Record<string, unknown>, key?: string) => aendere((v) => aktualisiereFeld(v, feld.id, teil as Partial<Feld>), key);
  return (
    <>
      <Zeile label="Farbe des Codes">
        <FarbWahl label="Farbe des Codes" wert={feld.farbe} farben={farben} onChange={(n) => n && set({ farbe: n })} />
      </Zeile>
      <Zeile label="Hintergrund" hilfe="Ein heller Untergrund verbessert das Scannen auf dunklen Designs.">
        <FarbWahl label="Hintergrund" wert={feld.hintergrund} farben={farben} keine="Transparent" onChange={(n) => set({ hintergrund: n })} />
      </Zeile>
      <ZahlFeld label="Ruhezone" einheit="Module" wert={feld.ruhezone} min={0} max={10} schritt={1} hilfe="Freier Rand um den Code, empfohlen: 2 bis 4." onChange={(n) => set({ ruhezone: n }, `rz-${feld.id}`)} />
    </>
  );
}

function VCardEigenschaften({ vorlage, feld, aendere }: { vorlage: Vorlage; feld: VCardFeld; aendere: EigenschaftenProps["aendere"] }) {
  const NEU = "__neu__";
  const KEINE = "__keine__";
  const wertFuer = (e: VCardEigenschaft): string => {
    const t = (feld.zuordnung[e] ?? "").trim();
    const m = t.match(/^\{\{\s*([a-z][a-z0-9_]*)\s*\}\}$/);
    return m ? m[1] : t ? "__text__" : KEINE;
  };
  function setze(e: VCardEigenschaft, w: string) {
    if (w === NEU) {
      aendere((v) => {
        const r = fuegeVariableHinzu(v, VCARD_NAMEN[e]);
        return aktualisiereFeld(r.vorlage, feld.id, { zuordnung: { ...(r.vorlage.felder.find((f) => f.id === feld.id) as VCardFeld).zuordnung, [e]: `{{${r.schluessel}}}` } } as Partial<Feld>);
      });
      return;
    }
    const z = { ...feld.zuordnung };
    if (w === KEINE) delete z[e];
    else z[e] = `{{${w}}}`;
    aendere((v) => aktualisiereFeld(v, feld.id, { zuordnung: z } as Partial<Feld>));
  }
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">Kontaktdaten im QR-Code</legend>
      <p className="text-xs text-muted-foreground">Wählen Sie je Kontaktdatum die passende Eingabe. Was frei bleibt, wird nicht gespeichert.</p>
      {VCARD_EIGENSCHAFTEN.map((e) => (
        <div key={e} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
          <span className="text-sm">{VCARD_NAMEN[e]}</span>
          <Select
            value={wertFuer(e)}
            onValueChange={(w) => setze(e, w)}
            options={[
              { value: KEINE, label: "— nicht verwenden —" },
              ...vorlage.variablen.map((v) => ({ value: v.schluessel, label: v.bezeichnung })),
              ...(wertFuer(e) === "__text__" ? [{ value: "__text__", label: `Eigener Text: ${feld.zuordnung[e]}` }] : []),
              { value: NEU, label: `+ Neue Eingabe „${VCARD_NAMEN[e]}“` },
            ]}
          />
        </div>
      ))}
    </fieldset>
  );
}

/** Eigenschaften des gewählten Felds, rechts neben der Arbeitsfläche. */
export function Eigenschaften({ vorlage, feld, farben, schriften, warnungen, engineMeldungen, aendere, onAuswahl }: EigenschaftenProps) {
  const hatHinten = vorlage.design.hinten !== null;
  const set = (teil: Partial<Feld>, key?: string) => aendere((v) => aktualisiereFeld(v, feld.id, teil), key);
  const genutzt = vorlage.variablen.filter((v) => variablenInFeld(feld).includes(v.schluessel));
  const quadrat = istQuadratisch(feld.typ);
  return (
    <div className="space-y-4" data-tour="pers-eigenschaften">
      {(warnungen.length > 0 || engineMeldungen.length > 0) && (
        <div className="space-y-1.5">
          {warnungen.map((w, i) => (
            <Meldungsbox key={i} ton={w.schwere === "fehler" ? "fehler" : "hinweis"}>
              {w.text}
            </Meldungsbox>
          ))}
          {engineMeldungen.map((t, i) => (
            <Meldungsbox key={`e${i}`} ton="hinweis">
              {t}
            </Meldungsbox>
          ))}
        </div>
      )}
      <Zeile label="Name des Felds (nur im Editor)" htmlFor="feld-name">
        <Input id="feld-name" value={feld.name} maxLength={80} onChange={(e) => set({ name: e.target.value }, `fn-${feld.id}`)} />
      </Zeile>
      {hatHinten && (
        <Zeile label="Seite">
          <Segment label="Seite" wert={feld.seite} onChange={(s) => set({ seite: s })} optionen={[{ wert: "vorne", text: "Vorderseite" }, { wert: "hinten", text: "Rückseite" }]} />
        </Zeile>
      )}

      {feld.typ === "text" && <TextEigenschaften vorlage={vorlage} feld={feld} farben={farben} schriften={schriften} aendere={aendere} />}
      {feld.typ === "qr" && (
        <>
          <InhaltMitEinfuegehilfe vorlage={vorlage} feld={feld} wert={feld.inhalt} einzeilig onText={(t) => set({ inhalt: t || " " }, `inhalt-${feld.id}`)} aendere={aendere} bezeichnung="Inhalt des QR-Codes" />
          <Zeile label="Fehlerkorrektur" hilfe="Höher = auch bei Verschmutzung lesbar, aber dichter.">
            <Segment label="Fehlerkorrektur" wert={feld.fehlerkorrektur} onChange={(f) => set({ fehlerkorrektur: f })} optionen={[{ wert: "L", text: "L 7 %" }, { wert: "M", text: "M 15 %" }, { wert: "Q", text: "Q 25 %" }, { wert: "H", text: "H 30 %" }]} />
          </Zeile>
          <CodeFarben feld={feld} farben={farben} aendere={aendere} />
        </>
      )}
      {feld.typ === "vcard" && (
        <>
          <VCardEigenschaften vorlage={vorlage} feld={feld} aendere={aendere} />
          <Zeile label="Fehlerkorrektur">
            <Segment label="Fehlerkorrektur" wert={feld.fehlerkorrektur} onChange={(f) => set({ fehlerkorrektur: f })} optionen={[{ wert: "L", text: "L 7 %" }, { wert: "M", text: "M 15 %" }, { wert: "Q", text: "Q 25 %" }, { wert: "H", text: "H 30 %" }]} />
          </Zeile>
          <CodeFarben feld={feld} farben={farben} aendere={aendere} />
        </>
      )}
      {feld.typ === "barcode" && (
        <>
          <Zeile label="Art des Barcodes">
            <Select value={feld.symbologie} onValueChange={(s) => set({ symbologie: s as BarcodeFeld["symbologie"] })} options={SYMBOLOGIEN.map((s) => ({ value: s, label: SYMBOLOGIE_NAMEN[s] }))} />
          </Zeile>
          <InhaltMitEinfuegehilfe vorlage={vorlage} feld={feld} wert={feld.inhalt} einzeilig onText={(t) => set({ inhalt: t || " " }, `inhalt-${feld.id}`)} aendere={aendere} bezeichnung="Inhalt des Barcodes" />
          <Haken label="Klartext unter dem Code anzeigen" checked={feld.klartext} onChange={(b) => set({ klartext: b })} />
          <Zeile label="Ausrichtung">
            <Segment label="Ausrichtung" wert={feld.ausrichtung} onChange={(a) => set({ ausrichtung: a })} optionen={[{ wert: "links", text: "Links" }, { wert: "zentriert", text: "Mitte" }, { wert: "rechts", text: "Rechts" }]} />
          </Zeile>
          <CodeFarben feld={feld} farben={farben} aendere={aendere} />
        </>
      )}

      <section className="space-y-2" aria-label="Eingaben dieses Felds">
        <h3 className="text-sm font-semibold">Eingaben für Kunden</h3>
        {genutzt.length === 0 ? (
          <p className="text-xs text-muted-foreground">Dieses Feld verwendet keine Eingabe.</p>
        ) : (
          genutzt.map((v, i) => (
            <VariableBearbeiten
              key={v.schluessel}
              dataTour={i === 0 ? "pers-eingabe" : undefined}
              vorlage={vorlage}
              variable={v}
              onBezeichnung={(b) => aendere((x) => setzeBezeichnung(x, v.schluessel, b), `bez-${v.schluessel}`)}
              onAendern={(teil, key) => aendere((x) => aktualisiereVariable(x, v.schluessel, teil), key)}
            />
          ))
        )}
      </section>

      <section className="space-y-2" aria-label="Position und Größe">
        <h3 className="text-sm font-semibold">Position und Größe (für Präzise)</h3>
        <p className="text-xs text-muted-foreground">Maße in Millimetern ab der linken oberen Ecke des Endformats. Negative Werte ragen in den Beschnitt.</p>
        <div className="grid grid-cols-2 gap-3" data-tour="pers-position">
          <ZahlFeld label="X" einheit="mm" wert={feld.x} onChange={(n) => aendere((v) => setzeRechteck(v, feld.id, { x: n, y: feld.y, breite: feld.breite, hoehe: feld.hoehe }), `x-${feld.id}`)} />
          <ZahlFeld label="Y" einheit="mm" wert={feld.y} onChange={(n) => aendere((v) => setzeRechteck(v, feld.id, { x: feld.x, y: n, breite: feld.breite, hoehe: feld.hoehe }), `y-${feld.id}`)} />
          <ZahlFeld label="Breite" einheit="mm" wert={feld.breite} min={1} onChange={(n) => aendere((v) => setzeRechteck(v, feld.id, { x: feld.x, y: feld.y, breite: n, hoehe: quadrat ? n : feld.hoehe }), `b-${feld.id}`)} />
          <ZahlFeld label="Höhe" einheit="mm" wert={feld.hoehe} min={1} onChange={(n) => aendere((v) => setzeRechteck(v, feld.id, { x: feld.x, y: feld.y, breite: quadrat ? n : feld.breite, hoehe: n }), `h-${feld.id}`)} />
        </div>
        {quadrat && <p className="text-xs text-muted-foreground">QR-Codes bleiben quadratisch.</p>}
      </section>

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button type="button" size="sm" variant="secondary" onClick={() => aendere((v) => dupliziereFeld(v, feld.id)?.vorlage ?? v)}>
          Duplizieren
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => {
            aendere((v) => entferneFeld(v, feld.id));
            onAuswahl(null);
          }}
        >
          Feld löschen
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Gelöscht? Mit Strg+Z (Mac: Cmd+Z) holen Sie das Feld zurück.</p>
    </div>
  );
}
