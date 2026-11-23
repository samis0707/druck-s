"use client";

import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TRow, TH, TD } from "@/components/ui/table";
import { euroText, euroTextZehntelcent, teileGerundet, type PreisEinstellungen, type RichtpreisErgebnis } from "@/lib/kalkulation/richtpreis";

export type ErgebnisZeile = {
  titel: string;
  art: string;
  menge: number | null;
  einheit: string;
  mengeGesamt: number | null;
  kostenZehntelcent: number | null;
  zeitMs: number;
  rechenweg: string[];
  hinweise: string[];
};

export type ErgebnisAuflage = {
  auflage: number;
  kostenZehntelcent: number;
  vollstaendig: boolean;
  ohneKosten: string[];
  richtpreis: RichtpreisErgebnis;
};

export type Ergebnis = {
  artikel: { id: string; titel: string; einheit: string };
  auflagen: ErgebnisAuflage[];
  offen: string[];
  hinweise: string[];
  zeilen?: { auflage: number; zeilen: ErgebnisZeile[] }[];
  einstellungen?: PreisEinstellungen;
  hinweis?: string;
  stichtag?: string;
};

const zahl = (n: number | null) => (n === null ? "–" : n.toLocaleString("de-DE", { maximumFractionDigits: 3 }));

function dauer(ms: number): string {
  if (ms <= 0) return "–";
  const min = Math.round(ms / 60000);
  if (min < 1) return "< 1 Min.";
  return min >= 60 ? `${Math.floor(min / 60)} Std. ${min % 60} Min.` : `${min} Min.`;
}

/** Ergebnis einer Kalkulation: Tabelle je Auflage, Hinweise, aufklappbarer Rechenweg. */
export function ErgebnisTabelle({ e }: { e: Ergebnis }) {
  const gruende = [...new Set(e.auflagen.flatMap((a) => (a.richtpreis.status === "auf_anfrage" ? a.richtpreis.gruende : [])))];
  const mitPreis = e.auflagen.some((a) => a.richtpreis.status === "preis");
  return (
    <div className="space-y-4" data-tour="kalkulation-ergebnis">
      {gruende.length > 0 && (
        <Alert variant="destructive" data-testid="kalkulation-offene-punkte">
          <p className="font-medium">Für mindestens eine Auflage gibt es keinen Preis („Preis auf Anfrage“)</p>
          <ul className="list-disc pl-5">
            {gruende.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Alert>
      )}
      {e.hinweise.length > 0 && (
        <Alert>
          <p className="font-medium">Hinweise der Kalkulation</p>
          <ul className="list-disc pl-5">
            {e.hinweise.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <TRow>
              <TH>Auflage</TH>
              <TH className="text-right">Kosten</TH>
              <TH className="text-right">Richtpreis netto</TH>
              <TH className="text-right">Spanne netto</TH>
              <TH className="text-right">Richtpreis brutto</TH>
              <TH className="text-right">je Stück (netto)</TH>
              <TH className="text-right">je 1.000 (netto)</TH>
            </TRow>
          </THead>
          <tbody>
            {e.auflagen.map((a) => {
              const r = a.richtpreis;
              return (
                <TRow key={a.auflage}>
                  <TD className="font-medium">{a.auflage.toLocaleString("de-DE")}</TD>
                  <TD className="text-right tabular-nums">{euroText(teileGerundet(a.kostenZehntelcent, 10))}</TD>
                  {r.status === "preis" ? (
                    <>
                      <TD className="text-right font-semibold tabular-nums">
                        {euroText(r.preis.nettoCent)}
                        {r.mindestpreisAngewendet && <span title="Mindestpreis je Auftrag angewendet"> ¹</span>}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {euroText(r.von.nettoCent)} – {euroText(r.bis.nettoCent)}
                      </TD>
                      <TD className="text-right tabular-nums">{euroText(r.preis.bruttoCent)}</TD>
                      <TD className="text-right tabular-nums">{euroTextZehntelcent(r.jeStueckZehntelcent)}</TD>
                      <TD className="text-right tabular-nums">{euroText(r.je1000Cent)}</TD>
                    </>
                  ) : (
                    <TD colSpan={5}>
                      <Badge variant="destructive">Preis auf Anfrage</Badge>
                    </TD>
                  )}
                </TRow>
              );
            })}
          </tbody>
        </Table>
      </div>
      {mitPreis && (
        <p className="text-xs text-muted-foreground">
          {e.hinweis ?? "Unverbindlicher Richtpreis."} Kosten = Ergebnis der Kalkulation (Material, Maschinen, Zukauf) ohne Zuschläge.
          {e.einstellungen && e.auflagen.some((a) => a.richtpreis.status === "preis" && a.richtpreis.mindestpreisAngewendet)
            ? ` ¹ Mindestpreis je Auftrag (${euroText(e.einstellungen.mindestpreisCent)}) angewendet.`
            : ""}
        </p>
      )}
      <Rechenweg e={e} />
    </div>
  );
}

function Rechenweg({ e }: { e: Ergebnis }) {
  return (
    <details className="rounded-2xl border border-border p-3" data-tour="kalkulation-rechenweg">
      <summary className="cursor-pointer font-medium">Rechenweg anzeigen</summary>
      <div className="mt-3 space-y-6">
        {e.auflagen.map((a) => {
          const zeilen = e.zeilen?.find((z) => z.auflage === a.auflage)?.zeilen ?? [];
          const r = a.richtpreis;
          return (
            <section key={a.auflage} className="space-y-3">
              <h3 className="text-sm font-semibold">Auflage {a.auflage.toLocaleString("de-DE")}</h3>
              {a.ohneKosten.length > 0 && (
                <p className="text-sm text-destructive">Ohne Kosten: {a.ohneKosten.join("; ")}</p>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Position</TH>
                      <TH className="text-right">Menge</TH>
                      <TH className="text-right">Zeit</TH>
                      <TH className="text-right">Kosten</TH>
                      <TH>Wie gerechnet</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    {zeilen.map((z, i) => (
                      <TRow key={i}>
                        <TD className="align-top font-medium">{z.titel}</TD>
                        <TD className="text-right align-top tabular-nums">
                          {zahl(z.menge)} {z.einheit}
                          {z.mengeGesamt !== null && z.mengeGesamt !== z.menge ? <div className="text-xs text-muted-foreground">mit Zuschuss {zahl(z.mengeGesamt)}</div> : null}
                        </TD>
                        <TD className="text-right align-top tabular-nums">{dauer(z.zeitMs)}</TD>
                        <TD className="text-right align-top tabular-nums">{z.kostenZehntelcent === null ? "–" : euroTextZehntelcent(z.kostenZehntelcent)}</TD>
                        <TD className="align-top text-xs text-muted-foreground">
                          {[...z.rechenweg, ...z.hinweise].map((t, j) => (
                            <div key={j}>{t}</div>
                          ))}
                        </TD>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
              </div>
              {r.status === "preis" && e.einstellungen && (
                <dl className="grid max-w-xl grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
                  <dt>Kosten der Kalkulation</dt>
                  <dd className="text-right tabular-nums">{euroTextZehntelcent(r.rechenweg.kostenZehntelcent)}</dd>
                  <dt>+ Gemeinkosten/Vertrieb {e.einstellungen.gemeinkostenProzent.toLocaleString("de-DE")} %</dt>
                  <dd className="text-right tabular-nums">{euroTextZehntelcent(r.rechenweg.gemeinkostenZehntelcent)}</dd>
                  <dt>+ Gewinn {e.einstellungen.gewinnProzent.toLocaleString("de-DE")} %</dt>
                  <dd className="text-right tabular-nums">{euroTextZehntelcent(r.rechenweg.gewinnZehntelcent)}</dd>
                  <dt>= Zwischensumme (netto)</dt>
                  <dd className="text-right tabular-nums">{euroText(r.rechenweg.zwischensummeCent)}</dd>
                  <dt>nach Mindestpreis</dt>
                  <dd className="text-right tabular-nums">{euroText(r.rechenweg.nachMindestpreisCent)}</dd>
                  <dt>nach Rundung = Richtpreis netto</dt>
                  <dd className="text-right font-semibold tabular-nums">{euroText(r.rechenweg.nachRundungCent)}</dd>
                  <dt>+ MwSt {r.mwstProzent.toLocaleString("de-DE")} % = brutto</dt>
                  <dd className="text-right tabular-nums">{euroText(r.preis.bruttoCent)}</dd>
                </dl>
              )}
            </section>
          );
        })}
      </div>
    </details>
  );
}
