"use client";

/* Daten werden nach dem Mounten geladen: setState läuft nach await. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, THead, TRow, TH, TD } from "@/components/ui/table";
import { ConfirmAction } from "@/components/requests/ConfirmAction";
import { fehlerText, kalkApi } from "./api";

type Stand = {
  bereiche: { schluessel: string; name: string; version: number; geaendertAm: string; geaendertVon: string; zaehlungen: Record<string, number> }[];
  dateien: { anzahl: number; bytes: number };
};
type Vorschau = {
  datum: string | null;
  pruefsumme: string;
  bereiche: { schluessel: string; name: string; status: "neu" | "gleich" | "geaendert"; heute: Record<string, number>; neu: Record<string, number> }[];
};

const LISTEN: Record<string, string> = {
  materialien: "Materialien",
  lieferanten: "Lieferanten",
  stanzformen: "Stanzformen",
  arbeitsschritte: "Arbeitsschritte",
  arbeitsplaetze: "Arbeitsplätze",
  kostenstellen: "Kostenstellen",
  partner: "Partner",
  artikel: "Artikel",
  kalkulationen: "Kalkulationen",
  bestaende: "Bestände",
  preise: "Preise",
};
const zaehlText = (z: Record<string, number>) =>
  Object.entries(z)
    .map(([k, n]) => `${n.toLocaleString("de-DE")} ${LISTEN[k] ?? k}`)
    .join(", ") || "–";
const STATUS_TEXT = { neu: "neu", gleich: "unverändert", geaendert: "wird ersetzt" } as const;
const zeit = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

/** Stammdaten der Kalkulation: Stand, Werkbank öffnen, Sicherung einspielen (mit Vorschau) und laden. */
export function Stammdaten() {
  const router = useRouter();
  const [stand, setStand] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [sicherung, setSicherung] = useState<unknown>(null);
  const [dateiname, setDateiname] = useState("");
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [prueft, setPrueft] = useState(false);
  const [feldKey, setFeldKey] = useState(0);

  const laden = useCallback(async () => {
    const r = await kalkApi<Stand>("/stand");
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) router.push("/staff/login");
      else setFehler(fehlerText(r));
      return;
    }
    setStand(r.daten);
  }, [router]);

  useEffect(() => {
    void laden();
  }, [laden]);

  async function dateiGewaehlt(datei: File | undefined) {
    setVorschau(null);
    setSicherung(null);
    setMeldung(null);
    if (!datei) return;
    if (datei.size > 30 * 1024 * 1024) {
      setMeldung("Die Datei ist größer als 30 MB.");
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(await datei.text());
    } catch {
      setMeldung("Die Datei ist keine gültige JSON-Datei.");
      return;
    }
    setDateiname(datei.name);
    setPrueft(true);
    const r = await kalkApi<Vorschau>("/import/vorschau", { method: "POST", body: { sicherung: json } });
    setPrueft(false);
    if (!r.ok) {
      setMeldung(fehlerText(r));
      return;
    }
    setSicherung(json);
    setVorschau(r.daten);
  }

  async function uebernehmen() {
    if (!vorschau) return;
    const r = await kalkApi<{ importiert: string[] }>("/import", { method: "POST", body: { sicherung, pruefsumme: vorschau.pruefsumme, bestaetigt: true } });
    if (!r.ok) {
      toast.add({ description: fehlerText(r), type: "error" });
      return;
    }
    toast.add({ description: `Stammdaten übernommen (${r.daten.importiert.length} Bereiche).`, type: "success" });
    setVorschau(null);
    setSicherung(null);
    setDateiname("");
    setFeldKey((k) => k + 1);
    await laden();
  }

  async function herunterladen() {
    const res = await fetch("/api/staff/kalkulation/v1/werkbank/sicherung");
    if (!res.ok) {
      toast.add({ description: "Die Sicherung konnte nicht geladen werden.", type: "error" });
      return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(await res.json(), null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kalkulation-stammdaten-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const nichtsNeu = vorschau?.bereiche.every((b) => b.status === "gleich") ?? false;

  return (
    <div className="space-y-6">
      <Card data-tour="kalkulation-werkbank">
        <CardHeader>
          <CardTitle>Stammdaten pflegen</CardTitle>
          <CardDescription>
            Material, Preise, Maschinen, Arbeitsschritte und Artikel pflegen Sie in der Werkbank. Sie speichert direkt in die Datenbank der Druckerei; mehrere Mitarbeiter können gleichzeitig arbeiten.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button render={<a href="/staff/kalkulation/werkbank/" target="_blank" rel="noopener" />}>Werkbank öffnen</Button>
          <Button type="button" variant="outline" onClick={() => void herunterladen()} data-tour="kalkulation-sicherung-laden">
            Sicherung herunterladen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aktueller Stand</CardTitle>
        </CardHeader>
        <CardContent>
          {fehler && <Alert variant="destructive">{fehler}</Alert>}
          {!fehler && !stand && <Skeleton className="h-24 w-full rounded-2xl" />}
          {stand && stand.bereiche.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Stammdaten vorhanden. Spielen Sie unten eine Sicherung ein oder öffnen Sie die Werkbank.</p>}
          {stand && stand.bereiche.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TRow>
                    <TH>Bereich</TH>
                    <TH>Inhalt</TH>
                    <TH className="text-right">Version</TH>
                    <TH>Zuletzt geändert</TH>
                  </TRow>
                </THead>
                <tbody>
                  {stand.bereiche.map((b) => (
                    <TRow key={b.schluessel}>
                      <TD className="font-medium">{b.name}</TD>
                      <TD>{zaehlText(b.zaehlungen)}</TD>
                      <TD className="text-right tabular-nums">{b.version}</TD>
                      <TD>
                        {zeit(b.geaendertAm)} · {b.geaendertVon}
                      </TD>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-tour="kalkulation-import">
        <CardHeader>
          <CardTitle>Sicherung einspielen</CardTitle>
          <CardDescription>
            Eine Sicherung der Werkbank („Alles sichern“) ersetzt die betroffenen Bereiche. Vorher sehen Sie, was sich ändert. Frühere Stände bleiben im Verlauf erhalten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sicherung-datei">Sicherungsdatei (.json)</Label>
            <Input key={feldKey} id="sicherung-datei" type="file" accept="application/json,.json" onChange={(e) => void dateiGewaehlt(e.target.files?.[0])} />
          </div>
          {prueft && <p className="text-sm text-muted-foreground">Die Sicherung wird geprüft …</p>}
          {meldung && <Alert variant="destructive">{meldung}</Alert>}
          {vorschau && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{dateiname}</strong>
                {vorschau.datum ? ` · Sicherung vom ${vorschau.datum}` : ""}
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Bereich</TH>
                      <TH>Status</TH>
                      <TH>Heute</TH>
                      <TH>Danach</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    {vorschau.bereiche.map((b) => (
                      <TRow key={b.schluessel}>
                        <TD className="font-medium">{b.name}</TD>
                        <TD>
                          <Badge variant={b.status === "gleich" ? "outline" : b.status === "neu" ? "secondary" : "default"}>{STATUS_TEXT[b.status]}</Badge>
                        </TD>
                        <TD>{zaehlText(b.heute)}</TD>
                        <TD>{zaehlText(b.neu)}</TD>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
              </div>
              {nichtsNeu ? (
                <p className="text-sm text-muted-foreground">Die Sicherung entspricht dem aktuellen Stand – nichts zu tun.</p>
              ) : (
                <ConfirmAction
                  triggerLabel="Sicherung übernehmen"
                  title="Sicherung übernehmen?"
                  description="Die genannten Bereiche werden durch den Inhalt der Sicherung ersetzt. Der bisherige Stand bleibt im Verlauf und kann in der Werkbank wiederhergestellt werden. Die Übernahme wird protokolliert."
                  confirmLabel="Übernehmen"
                  pendingLabel="Wird übernommen …"
                  onConfirm={uebernehmen}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
