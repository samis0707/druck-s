"use client";

/* Engine-Läufe im Browser: Ergebnisse werden in State übernommen. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Meldungsbox } from "@/components/personalisierung/staff/bausteine";
import { Eigenschaften } from "@/components/personalisierung/staff/Eigenschaften";
import { VariableBearbeiten } from "@/components/personalisierung/staff/VariablenEditor";
import { PdfSeite, usePdfDokument } from "@/components/personalisierung/PdfSeite";
import type { SchrittProps } from "@/components/personalisierung/staff/Assistent";
import { cn } from "@/lib/utils";
import type { Meldung, Ressourcen } from "@/lib/personalisierung/render";
import { erzeugeBeispiel, erzeugeHintergrund, ladeRessourcen, type SchriftEintrag } from "@/lib/personalisierung/ui/browser-engine";
import {
  EINRAST_SCHWELLE_PX,
  FELD_ARTEN,
  GRIFFE,
  aktualisiereVariable,
  anzeigeMm,
  dupliziereFeld,
  entferneFeld,
  entferneVariable,
  feldWarnungen,
  fuegeFeldHinzu,
  fuegeVariableHinzu,
  istQuadratisch,
  laengeZuMm,
  laengeZuPx,
  mmZuPx,
  pfeilSchritt,
  rasteGroesse,
  rasteVerschieben,
  setzeBezeichnung,
  setzeRechteck,
  verschiebe,
  verschiebeEbene,
  type FeldArt,
  type Griff,
  type Hilfslinie,
  type Rechteck,
  type RastErgebnis,
} from "@/lib/personalisierung/ui/editor";
import type { Farbe, Feld, Seite, Vorlage } from "@/lib/personalisierung/schema";

const TYP_NAME: Record<Feld["typ"], string> = { text: "Text", qr: "QR", vcard: "vCard", barcode: "Barcode", bild: "Bild" };
const GRIFF_STIL: Record<Griff, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};

const rechteckVon = (f: Feld): Rechteck => ({ x: f.x, y: f.y, breite: f.breite, hoehe: f.hoehe });

interface EditorAktionen {
  live: (neu: Vorlage) => void;
  festhalten: (vorher: Vorlage) => void;
  rueckgaengig: () => void;
  wiederholen: () => void;
}

/** Ressourcen, Hintergrund (nur Design) und Beispiel-Ausgabe der Engine, alles im Browser. */
function useEngine(vorlage: Vorlage, schriften: SchriftEintrag[], farben: Farbe[]) {
  const [res, setRes] = useState<Ressourcen | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [hintergrund, setHintergrund] = useState<Uint8Array | null>(null);
  const [beispiel, setBeispiel] = useState<{ pdf: Uint8Array | null; meldungen: Meldung[]; fehler: string | null } | null>(null);
  const aktuell = useRef(vorlage);
  useEffect(() => {
    aktuell.current = vorlage;
  }, [vorlage]);

  const familien = [...new Set(vorlage.felder.flatMap((f) => ("schrift" in f ? [f.schrift.familie] : [])))].sort().join("|");
  const ressKey = JSON.stringify([vorlage.design.dateiId, vorlage.ausgabe.ueberlagerung?.dateiId, familien, schriften.map((s) => s.id), farben]);
  useEffect(() => {
    let aktiv = true;
    ladeRessourcen(aktuell.current, schriften, farben)
      .then((r) => {
        if (aktiv) {
          setRes(r);
          setLadefehler(null);
        }
      })
      .catch(() => aktiv && setLadefehler("Design oder Schriften konnten nicht geladen werden."));
    return () => {
      aktiv = false;
    };
    // schriften und farben stecken im Schlüssel
    // schriften und farben stecken im Schlüssel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ressKey]);

  const hgKey = JSON.stringify([vorlage.endformat, vorlage.beschnitt, vorlage.design]);
  useEffect(() => {
    if (!res?.design) {
      setHintergrund(null);
      return;
    }
    let aktiv = true;
    erzeugeHintergrund(aktuell.current, res)
      .then((b) => aktiv && setHintergrund(b))
      .catch(() => aktiv && setHintergrund(null));
    return () => {
      aktiv = false;
    };
  }, [res, hgKey]);

  const inhaltKey = JSON.stringify([vorlage.felder, vorlage.variablen, vorlage.endformat, vorlage.beschnitt, vorlage.design]);
  useEffect(() => {
    if (!res?.design) {
      setBeispiel(null);
      return;
    }
    let aktiv = true;
    const t = setTimeout(() => {
      erzeugeBeispiel(aktuell.current, res)
        .then((e) => aktiv && setBeispiel({ pdf: e.pdf, meldungen: e.meldungen, fehler: null }))
        .catch((e) => aktiv && setBeispiel({ pdf: null, meldungen: [], fehler: e instanceof Error ? e.message : "Vorschau nicht möglich" }));
    }, 450);
    return () => {
      aktiv = false;
      clearTimeout(t);
    };
  }, [res, inhaltKey]);

  return { ladefehler, hintergrund, beispiel };
}

/** Schritt 2: visueller Feld-Editor. */
export function SchrittFelder({
  vorlage,
  aendere,
  schriften,
  farben,
  editor,
  kannZurueck,
  kannVor,
}: SchrittProps & { schriften: SchriftEintrag[]; farben: Farbe[]; editor: EditorAktionen; kannZurueck: boolean; kannVor: boolean }) {
  const [seite, setSeite] = useState<Seite>("vorne");
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [beispielAn, setBeispielAn] = useState(false);
  const [linien, setLinien] = useState<Hilfslinie[]>([]);
  const [tab, setTab] = useState<"felder" | "eingaben">("felder");
  const [breite, setBreite] = useState(800);
  const flaeche = useRef<HTMLDivElement>(null);
  const bogen = useRef<HTMLDivElement>(null);
  const vorlageRef = useRef(vorlage);
  useEffect(() => {
    vorlageRef.current = vorlage;
  }, [vorlage]);
  const hatHinten = vorlage.design.hinten !== null;
  const aktSeite: Seite = hatHinten ? seite : "vorne";

  const { ladefehler, hintergrund, beispiel } = useEngine(vorlage, schriften, farben);
  const anzeigeBytes = beispielAn && beispiel?.pdf ? beispiel.pdf : hintergrund;
  const { dokument } = usePdfDokument(anzeigeBytes);

  // Verfügbare Breite messen
  useEffect(() => {
    const el = flaeche.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBreite(el.clientWidth));
    ro.observe(el);
    setBreite(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const b = vorlage.beschnitt;
  const W = vorlage.endformat.breite;
  const H = vorlage.endformat.hoehe;
  const fit = Math.max(1, Math.min(30, (breite - 32) / (W + 2 * b)));
  const pxProMm = fit * zoom;
  const massstab = useMemo(() => ({ pxProMm, beschnitt: b }), [pxProMm, b]);
  const seitePx = { b: (W + 2 * b) * pxProMm, h: (H + 2 * b) * pxProMm };
  const format = useMemo(() => ({ breite: W, hoehe: H, beschnitt: b }), [W, H, b]);

  const gewaehlt = vorlage.felder.find((f) => f.id === auswahl) ?? null;
  const felderSeite = vorlage.felder.filter((f) => f.seite === aktSeite);
  const warnungen = useMemo(() => feldWarnungen(vorlage), [vorlage]);
  const engineNachFeld = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const x of beispiel?.meldungen ?? []) {
      const f = vorlage.felder.find((y) => y.id === x.feld || (y.name || y.id) === x.feld);
      const key = f?.id ?? "";
      m.set(key, [...(m.get(key) ?? []), x.text]);
    }
    return m;
  }, [beispiel, vorlage.felder]);

  // ----- Ziehen und Größe ändern
  const drag = useRef<{ id: string; griff: Griff | null; x0: number; y0: number; start: Rechteck; vorher: Vorlage; bewegt: boolean; quadrat: boolean; seite: Seite } | null>(null);

  const beginne = useCallback(
    (e: React.PointerEvent<HTMLElement>, f: Feld, griff: Griff | null) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setAuswahl(f.id);
      drag.current = { id: f.id, griff, x0: e.clientX, y0: e.clientY, start: rechteckVon(f), vorher: vorlageRef.current, bewegt: false, quadrat: istQuadratisch(f.typ), seite: f.seite };
    },
    [],
  );
  const bewege = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      if (!d.bewegt && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 3) return;
      d.bewegt = true;
      const dx = laengeZuMm(e.clientX - d.x0, massstab);
      const dy = laengeZuMm(e.clientY - d.y0, massstab);
      const andere = vorlageRef.current.felder.filter((x) => x.id !== d.id && x.seite === d.seite).map(rechteckVon);
      const schwelle = e.altKey ? -1 : EINRAST_SCHWELLE_PX / massstab.pxProMm;
      const res: RastErgebnis = d.griff
        ? rasteGroesse(d.start, d.griff, dx, dy, format, andere, schwelle, { quadrat: d.quadrat })
        : rasteVerschieben({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }, format, andere, schwelle);
      let r = res.rechteck;
      if (!d.griff) r = { ...r, x: Math.min(Math.max(r.x, -b), W + b - r.breite), y: Math.min(Math.max(r.y, -b), H + b - r.hoehe) };
      editor.live(setzeRechteck(d.vorher, d.id, r));
      setLinien(res.linien);
    },
    [massstab, format, editor, b, W, H],
  );
  const beende = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    setLinien([]);
    if (d?.bewegt) editor.festhalten(d.vorher);
  }, [editor]);

  function feldTaste(e: React.KeyboardEvent, f: Feld) {
    const s = pfeilSchritt(e.shiftKey);
    const pfeile: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] };
    if (pfeile[e.key]) {
      e.preventDefault();
      const [dx, dy] = pfeile[e.key];
      aendere((v) => {
        const cur = v.felder.find((x) => x.id === f.id);
        return cur ? setzeRechteck(v, f.id, verschiebe(rechteckVon(cur), dx, dy)) : v;
      }, `pfeil-${f.id}`);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      aendere((v) => entferneFeld(v, f.id));
      setAuswahl(null);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplizieren(f.id);
    } else if (e.key === "Escape") setAuswahl(null);
  }

  function duplizieren(id: string) {
    let neueId: string | null = null;
    aendere((v) => {
      const r = dupliziereFeld(v, id);
      neueId = r?.id ?? null;
      return r?.vorlage ?? v;
    });
    // ID ist deterministisch aus der Vorlage berechenbar; Auswahl nach dem Update setzen
    const r = dupliziereFeld(vorlageRef.current, id);
    if (r) setAuswahl(r.id);
    void neueId;
  }

  function hinzufuegen(art: FeldArt) {
    const r = fuegeFeldHinzu(vorlageRef.current, art, aktSeite);
    aendere(r.vorlage);
    setAuswahl(r.id);
    setTab("felder");
  }

  function wurzelTaste(e: React.KeyboardEvent) {
    const ziel = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ziel.tagName) || ziel.isContentEditable) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) editor.wiederholen();
      else editor.rueckgaengig();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      editor.wiederholen();
    }
  }

  const waehle = (f: Feld) => {
    setAuswahl(f.id);
    if (hatHinten) setSeite(f.seite);
  };
  const pdfSeite = aktSeite === "hinten" ? 2 : 1;
  const zoomProzent = Math.round(zoom * 100);
  const hatDesign = !!vorlage.design.dateiId;

  return (
    <div onKeyDown={wurzelTaste} className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_22rem]">
      {/* ---------------- links: Felder hinzufügen, Ebenen, Eingaben */}
      <aside className="space-y-4" aria-label="Felder und Eingaben">
        <section className="space-y-2" data-tour="pers-feld-hinzufuegen">
          <h2 className="text-sm font-semibold">Feld hinzufügen</h2>
          <div className="grid grid-cols-1 gap-1.5">
            {FELD_ARTEN.map((a) => (
              <button
                key={a.art}
                type="button"
                onClick={() => hinzufuegen(a.art)}
                data-tour={`pers-add-${a.art}`}
                data-umami-event={`Personalisierung: Feld ${a.name}`}
                className="rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <span className="block text-sm font-medium">+ {a.name}</span>
                <span className="block text-xs text-muted-foreground">{a.hilfe}</span>
              </button>
            ))}
          </div>
        </section>

        <div role="tablist" aria-label="Liste" className="flex gap-1">
          {(["felder", "eingaben"] as const).map((t) => (
            <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} data-tour={`pers-tab-${t}`} className={cn("rounded-xl px-3 py-1.5 text-sm", tab === t ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-muted")}>
              {t === "felder" ? `Felder (${vorlage.felder.length})` : `Eingaben (${vorlage.variablen.length})`}
            </button>
          ))}
        </div>

        {tab === "felder" ? (
          vorlage.felder.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch kein Feld. Wählen Sie oben, was auf die Karte soll – es erscheint in der Mitte und lässt sich verschieben.</p>
          ) : (
            <ul className="space-y-1" data-tour="pers-ebenen" aria-label="Ebenen, oberste zuerst">
              {[...vorlage.felder].reverse().map((f) => {
                const probleme = warnungen.filter((w) => w.feldId === f.id && w.schwere === "fehler").length + (engineNachFeld.get(f.id)?.length ?? 0);
                return (
                  <li key={f.id} className={cn("flex items-center gap-1 rounded-xl border px-1.5 py-1", f.id === auswahl ? "border-primary bg-primary/10" : "border-border")}>
                    <button type="button" onClick={() => waehle(f)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm" aria-current={f.id === auswahl}>
                      <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] uppercase">{TYP_NAME[f.typ]}</span>
                      <span className="truncate">{f.name || f.id}</span>
                      {hatHinten && <span className="shrink-0 text-[10px] text-muted-foreground">{f.seite === "hinten" ? "Rückseite" : ""}</span>}
                      {probleme > 0 && <span className="ml-auto shrink-0 rounded-full bg-yellow-500/30 px-1.5 text-[10px]" title="Hinweise zu diesem Feld">!</span>}
                    </button>
                    <button type="button" className="rounded px-1 text-xs text-muted-foreground hover:bg-muted" aria-label={`${f.name || f.id} nach vorn`} onClick={() => aendere((v) => verschiebeEbene(v, f.id, 1))}>
                      ↑
                    </button>
                    <button type="button" className="rounded px-1 text-xs text-muted-foreground hover:bg-muted" aria-label={`${f.name || f.id} nach hinten`} onClick={() => aendere((v) => verschiebeEbene(v, f.id, -1))}>
                      ↓
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <div className="space-y-3" data-tour="pers-eingaben">
            <p className="text-xs text-muted-foreground">Das sind die Angaben, die Kunden später ausfüllen.</p>
            {vorlage.variablen.map((v) => (
              <VariableBearbeiten
                key={v.schluessel}
                idPrefix="liste-"
                vorlage={vorlage}
                variable={v}
                onBezeichnung={(bz) => aendere((x) => setzeBezeichnung(x, v.schluessel, bz), `bez-${v.schluessel}`)}
                onAendern={(teil, key) => aendere((x) => aktualisiereVariable(x, v.schluessel, teil), key)}
                onLoeschen={() => aendere((x) => entferneVariable(x, v.schluessel))}
              />
            ))}
            <Button type="button" size="sm" variant="secondary" onClick={() => aendere((v) => fuegeVariableHinzu(v, `Eingabe ${v.variablen.length + 1}`).vorlage)}>
              + Neue Eingabe
            </Button>
          </div>
        )}
      </aside>

      {/* ---------------- Mitte: Arbeitsfläche */}
      <section className="min-w-0 space-y-2" aria-label="Arbeitsfläche">
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Werkzeuge">
          <div className="flex gap-1" role="group" aria-label="Rückgängig">
            <Button type="button" size="sm" variant="secondary" disabled={!kannZurueck} onClick={editor.rueckgaengig} title="Rückgängig (Strg+Z)" data-tour="pers-rueckgaengig">
              ↶ Rückgängig
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={!kannVor} onClick={editor.wiederholen} title="Wiederholen (Strg+Y)">
              ↷ Wiederholen
            </Button>
          </div>
          {hatHinten && (
            <div className="flex gap-1" role="group" aria-label="Seite" data-tour="pers-seitenwahl">
              {(["vorne", "hinten"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={aktSeite === s} onClick={() => { setSeite(s); setAuswahl(null); }} className={cn("rounded-xl border px-3 py-1 text-sm", aktSeite === s ? "border-primary bg-primary/10 font-semibold" : "border-border")}>
                  {s === "vorne" ? "Vorderseite" : "Rückseite"}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1" role="group" aria-label="Zoom" data-tour="pers-zoom">
            <Button type="button" size="sm" variant="secondary" aria-label="Verkleinern" onClick={() => setZoom((z) => Math.max(0.5, Math.round(z * 0.8 * 100) / 100))}>
              −
            </Button>
            <button type="button" className="min-w-14 rounded-xl px-2 py-1 text-sm hover:bg-muted" onClick={() => setZoom(1)} title="Einpassen">
              {zoomProzent} %
            </button>
            <Button type="button" size="sm" variant="secondary" aria-label="Vergrößern" onClick={() => setZoom((z) => Math.min(6, Math.round(z * 1.25 * 100) / 100))}>
              +
            </Button>
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm" data-tour="pers-beispiel">
            <input type="checkbox" className="size-4" checked={beispielAn} onChange={(e) => setBeispielAn(e.target.checked)} />
            Mit Beispieldaten anzeigen
          </label>
        </div>

        <div ref={flaeche} className="max-h-[75vh] min-h-[24rem] overflow-auto rounded-2xl border bg-muted/40 p-4" data-tour="pers-flaeche">
          {!hatDesign ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Laden Sie zuerst im Schritt „Design“ ein PDF hoch.</p>
          ) : (
            <div
              ref={bogen}
              className="relative mx-auto select-none bg-white shadow-md"
              style={{ width: seitePx.b, height: seitePx.h, touchAction: "none" }}
              onPointerDown={() => setAuswahl(null)}
            >
              {dokument ? <PdfSeite dokument={dokument} seite={pdfSeite} breitePx={seitePx.b} className="pointer-events-none absolute left-0 top-0" label={`${aktSeite === "hinten" ? "Rückseite" : "Vorderseite"}${beispielAn ? " mit Beispieldaten" : ""}`} /> : null}
              {/* Beschnittzone, Endformat, Sicherheitsabstand */}
              <svg className="pointer-events-none absolute inset-0" width={seitePx.b} height={seitePx.h} aria-hidden>
                <path fillRule="evenodd" fill="rgba(179,38,30,0.12)" d={`M0 0H${seitePx.b}V${seitePx.h}H0Z M${laengeZuPx(b, massstab)} ${laengeZuPx(b, massstab)}H${laengeZuPx(b + W, massstab)}V${laengeZuPx(b + H, massstab)}H${laengeZuPx(b, massstab)}Z`} />
                <rect x={laengeZuPx(b, massstab)} y={laengeZuPx(b, massstab)} width={laengeZuPx(W, massstab)} height={laengeZuPx(H, massstab)} fill="none" stroke="#b3261e" strokeWidth={1} strokeDasharray="4 3" />
                <rect x={laengeZuPx(b + 3, massstab)} y={laengeZuPx(b + 3, massstab)} width={Math.max(0, laengeZuPx(W - 6, massstab))} height={Math.max(0, laengeZuPx(H - 6, massstab))} fill="none" stroke="rgba(93,100,142,0.6)" strokeWidth={1} strokeDasharray="1 4" />
                {linien.map((l, i) =>
                  l.achse === "x" ? <line key={i} x1={mmZuPx(l.pos, massstab)} x2={mmZuPx(l.pos, massstab)} y1={0} y2={seitePx.h} stroke="#e6007e" strokeWidth={1} /> : <line key={i} y1={mmZuPx(l.pos, massstab)} y2={mmZuPx(l.pos, massstab)} x1={0} x2={seitePx.b} stroke="#e6007e" strokeWidth={1} />,
                )}
              </svg>
              {felderSeite.map((f) => {
                const aktiv = f.id === auswahl;
                const hat = (engineNachFeld.get(f.id)?.length ?? 0) > 0 || warnungen.some((w) => w.feldId === f.id && w.schwere === "fehler");
                return (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={aktiv}
                    aria-label={`${f.name || f.id}, ${TYP_NAME[f.typ]}, X ${anzeigeMm(f.x)} Y ${anzeigeMm(f.y)} mm, ${anzeigeMm(f.breite)} mal ${anzeigeMm(f.hoehe)} mm. Pfeiltasten verschieben, Umschalt für 1 mm.`}
                    data-feld={f.id}
                    onPointerDown={(e) => beginne(e, f, null)}
                    onPointerMove={bewege}
                    onPointerUp={beende}
                    onPointerCancel={beende}
                    onFocus={() => setAuswahl(f.id)}
                    onKeyDown={(e) => feldTaste(e, f)}
                    className={cn(
                      "absolute cursor-move outline-none",
                      aktiv ? "border-2 border-primary bg-primary/10 ring-2 ring-primary/30" : "border border-dashed border-sky-600/70 bg-sky-500/5 hover:bg-sky-500/10",
                      hat && !aktiv && "border-yellow-500",
                      beispielAn && !aktiv && "bg-transparent",
                    )}
                    style={{ left: mmZuPx(f.x, massstab), top: mmZuPx(f.y, massstab), width: laengeZuPx(f.breite, massstab), height: laengeZuPx(f.hoehe, massstab) }}
                  >
                    {!beispielAn && <span className="pointer-events-none absolute -top-5 left-0 max-w-full truncate rounded bg-primary px-1 text-[10px] text-primary-foreground" style={{ display: aktiv ? "block" : "none" }}>{f.name || f.id}</span>}
                    {!beispielAn && !aktiv && <span className="pointer-events-none block truncate px-0.5 text-[10px] text-sky-900/80">{f.name || f.id}</span>}
                    {aktiv &&
                      GRIFFE.filter((g) => !istQuadratisch(f.typ) || ["nw", "ne", "se", "sw"].includes(g)).map((g) => (
                        <span
                          key={g}
                          data-griff={g}
                          onPointerDown={(e) => beginne(e, f, g)}
                          onPointerMove={bewege}
                          onPointerUp={beende}
                          onPointerCancel={beende}
                          className={cn("absolute size-3 rounded-sm border border-primary bg-white", GRIFF_STIL[g])}
                        />
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {ladefehler && <Meldungsbox ton="fehler">{ladefehler}</Meldungsbox>}
        {beispielAn && beispiel?.fehler && <Meldungsbox ton="fehler">Die Vorschau ist nicht möglich: {beispiel.fehler}</Meldungsbox>}
        <p className="text-xs text-muted-foreground">
          Felder ziehen und an den Griffen in der Größe ändern. Pfeiltasten verschieben um 0,1 mm, mit Umschalt um 1 mm. Alt gedrückt halten schaltet das Einrasten aus. Rot gestrichelt: Endformat; rötlich: Beschnitt; blau gepunktet: 3 mm Sicherheitsabstand.
        </p>
      </section>

      {/* ---------------- rechts: Eigenschaften oder Prüfung */}
      <aside className="space-y-3" aria-label="Eigenschaften">
        <h2 className="text-sm font-semibold">{gewaehlt ? `Eigenschaften: ${gewaehlt.name || gewaehlt.id}` : "Eigenschaften"}</h2>
        {gewaehlt ? (
          <Eigenschaften
            vorlage={vorlage}
            feld={gewaehlt}
            farben={farben}
            schriften={schriften}
            warnungen={warnungen.filter((w) => w.feldId === gewaehlt.id)}
            engineMeldungen={engineNachFeld.get(gewaehlt.id) ?? []}
            aendere={aendere}
            onAuswahl={setAuswahl}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Wählen Sie ein Feld auf der Fläche oder in der Liste, um Schrift, Farbe und Eingaben einzustellen.</p>
            <div data-tour="pers-pruefung" className="space-y-1.5">
              <h3 className="text-sm font-semibold">Prüfung</h3>
              {warnungen.length === 0 && (engineNachFeld.size === 0) ? (
                <Meldungsbox ton="ok">Keine Hinweise. Die Felder liegen im Druckbereich.</Meldungsbox>
              ) : (
                <>
                  {warnungen.map((w, i) => (
                    <button key={i} type="button" className="block w-full text-left" onClick={() => w.feldId && setAuswahl(w.feldId)}>
                      <Meldungsbox ton={w.schwere === "fehler" ? "fehler" : "hinweis"}>{w.text}</Meldungsbox>
                    </button>
                  ))}
                  {[...engineNachFeld.entries()].flatMap(([id, texte]) => texte.map((t, i) => (
                    <button key={`${id}${i}`} type="button" className="block w-full text-left" onClick={() => id && setAuswahl(id)}>
                      <Meldungsbox ton="hinweis">{t}</Meldungsbox>
                    </button>
                  )))}
                </>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
