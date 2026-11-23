"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErgebnisTabelle, type Ergebnis } from "./ErgebnisTabelle";
import { fehlerText, kalkApi } from "./api";

type Frage = {
  schluessel: string;
  titel: string;
  art: "auswahl" | "zahl" | "text" | "format";
  optionen: { wert: string; text: string }[];
};
type ArtikelKurz = { id: string; titel: string; einheit: string };
type Antwort = string | { breiteMm: string; hoeheMm: string };

const MAX_AUFLAGEN = 6;
const SELECT_KLASSE =
  "h-8 w-full rounded-2xl border border-transparent bg-input/50 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

/** Antworten aus dem Formular in die Form der Schnittstelle bringen (Format: mm → µm). */
export function antwortenFuerApi(fragen: Frage[], werte: Record<string, Antwort>): Record<string, string | { breiteUm: number; hoeheUm: number }> {
  const aus: Record<string, string | { breiteUm: number; hoeheUm: number }> = {};
  for (const f of fragen) {
    const w = werte[f.schluessel];
    if (w === undefined) continue;
    if (f.art === "format") {
      if (typeof w === "string") continue;
      const b = Number(w.breiteMm.replace(",", "."));
      const h = Number(w.hoeheMm.replace(",", "."));
      if (b > 0 && h > 0) aus[f.schluessel] = { breiteUm: Math.round(b * 1000), hoeheUm: Math.round(h * 1000) };
    } else if (typeof w === "string" && w.trim() !== "") aus[f.schluessel] = w.trim();
  }
  return aus;
}

/** Ad-hoc-Kalkulation: Artikel wählen, Fragen beantworten, Auflagen eintragen, Richtpreis ansehen. */
export function Rechner() {
  const router = useRouter();
  const anfrageId = useSearchParams().get("anfrage");
  const [artikel, setArtikel] = useState<ArtikelKurz[] | null>(null);
  const [leer, setLeer] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gewaehlt, setGewaehlt] = useState("");
  const [fragen, setFragen] = useState<Frage[] | null>(null);
  const [werte, setWerte] = useState<Record<string, Antwort>>({});
  const [auflagen, setAuflagen] = useState<string[]>(["100", "250", "500"]);
  const [rechnet, setRechnet] = useState(false);
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const r = await kalkApi<{ artikel: ArtikelKurz[] }>("/v1/artikel");
      if (!aktiv) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) router.push("/staff/login");
        else if (r.status === 409) setLeer(true);
        else setFehler(fehlerText(r));
        return;
      }
      setArtikel(r.daten.artikel);
    })();
    return () => {
      aktiv = false;
    };
  }, [router]);

  async function artikelWaehlen(id: string) {
    setGewaehlt(id);
    setErgebnis(null);
    setMeldung(null);
    setFragen(null);
    if (id === "") return;
    const r = await kalkApi<{ fragen: Frage[] }>(`/v1/artikel/${encodeURIComponent(id)}`);
    if (!r.ok) {
      setMeldung(fehlerText(r));
      return;
    }
    // Vorbelegung: bei Auswahl der erste Wert (so rechnet auch die Engine)
    const vor: Record<string, Antwort> = {};
    for (const f of r.daten.fragen) {
      if (f.art === "auswahl" && f.optionen[0]) vor[f.schluessel] = f.optionen[0].wert;
      if (f.art === "format") vor[f.schluessel] = { breiteMm: "", hoeheMm: "" };
    }
    setWerte(vor);
    setFragen(r.daten.fragen);
  }

  function auflagenZahlen(): number[] | null {
    const z = auflagen.filter((a) => a.trim() !== "").map((a) => Number(a));
    if (z.length === 0 || z.some((n) => !Number.isInteger(n) || n < 1 || n > 10_000_000)) return null;
    return z;
  }

  async function rechnen() {
    setMeldung(null);
    const z = auflagenZahlen();
    if (!z) {
      setMeldung("Bitte 1 bis 6 Auflagen als ganze Zahlen ab 1 eintragen.");
      return;
    }
    setRechnet(true);
    const r = await kalkApi<Ergebnis>(`/v1/artikel/${encodeURIComponent(gewaehlt)}/richtpreis`, {
      method: "POST",
      body: { auflagen: z, antworten: antwortenFuerApi(fragen ?? [], werte) },
    });
    setRechnet(false);
    if (!r.ok) {
      setErgebnis(null);
      setMeldung(fehlerText(r));
      return;
    }
    setErgebnis(r.daten);
  }

  async function zurAnfrage() {
    const z = auflagenZahlen();
    if (!anfrageId || !z) return;
    const r = await kalkApi(`/anfragen/${encodeURIComponent(anfrageId)}/richtpreis`, {
      method: "POST",
      body: { artikel: gewaehlt, auflagen: z, antworten: antwortenFuerApi(fragen ?? [], werte) },
    });
    if (!r.ok) toast.add({ description: fehlerText(r), type: "error" });
    else toast.add({ description: "Richtpreis zur Anfrage gespeichert.", type: "success" });
  }

  if (fehler) return <Alert variant="destructive">{fehler}</Alert>;
  if (leer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Noch keine Stammdaten</CardTitle>
          <CardDescription>
            Für die Kalkulation braucht es Material, Maschinen und Artikel. Laden Sie dazu eine Sicherung der Werkbank hoch oder öffnen Sie die Werkbank.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/staff/kalkulation/stammdaten" />}>Zu den Stammdaten</Button>
        </CardContent>
      </Card>
    );
  }
  if (!artikel) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1 · Was soll kalkuliert werden?</CardTitle>
          <CardDescription>Wählen Sie einen Artikel. Danach erscheinen seine Fragen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1" data-tour="kalkulation-artikel">
            <Label htmlFor="kalk-artikel">Artikel</Label>
            <select id="kalk-artikel" className={SELECT_KLASSE} value={gewaehlt} onChange={(e) => void artikelWaehlen(e.target.value)}>
              <option value="">– bitte wählen –</option>
              {artikel.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.titel} ({a.id})
                </option>
              ))}
            </select>
            {artikel.length === 0 && <p className="text-sm text-muted-foreground">Es gibt noch keine Artikel. Artikel legen Sie in der Werkbank an.</p>}
          </div>

          {fragen && fragen.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2" data-tour="kalkulation-fragen">
              {fragen.map((f) => (
                <div key={f.schluessel} className="space-y-1">
                  <Label htmlFor={`frage-${f.schluessel}`}>{f.titel}</Label>
                  {f.art === "auswahl" ? (
                    <select
                      id={`frage-${f.schluessel}`}
                      className={SELECT_KLASSE}
                      value={typeof werte[f.schluessel] === "string" ? (werte[f.schluessel] as string) : ""}
                      onChange={(e) => setWerte({ ...werte, [f.schluessel]: e.target.value })}
                    >
                      {f.optionen.map((o) => (
                        <option key={o.wert} value={o.wert}>
                          {o.text}
                        </option>
                      ))}
                    </select>
                  ) : f.art === "format" ? (
                    <div className="flex items-center gap-2">
                      <Input
                        id={`frage-${f.schluessel}`}
                        inputMode="decimal"
                        placeholder="Breite"
                        aria-label={`${f.titel}: Breite in mm`}
                        value={(werte[f.schluessel] as { breiteMm: string } | undefined)?.breiteMm ?? ""}
                        onChange={(e) => setWerte({ ...werte, [f.schluessel]: { breiteMm: e.target.value, hoeheMm: (werte[f.schluessel] as { hoeheMm: string } | undefined)?.hoeheMm ?? "" } })}
                      />
                      <span aria-hidden>×</span>
                      <Input
                        inputMode="decimal"
                        placeholder="Höhe"
                        aria-label={`${f.titel}: Höhe in mm`}
                        value={(werte[f.schluessel] as { hoeheMm: string } | undefined)?.hoeheMm ?? ""}
                        onChange={(e) => setWerte({ ...werte, [f.schluessel]: { hoeheMm: e.target.value, breiteMm: (werte[f.schluessel] as { breiteMm: string } | undefined)?.breiteMm ?? "" } })}
                      />
                      <span className="text-sm text-muted-foreground">mm</span>
                    </div>
                  ) : (
                    <Input
                      id={`frage-${f.schluessel}`}
                      inputMode={f.art === "zahl" ? "numeric" : "text"}
                      value={typeof werte[f.schluessel] === "string" ? (werte[f.schluessel] as string) : ""}
                      onChange={(e) => setWerte({ ...werte, [f.schluessel]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {fragen && fragen.length === 0 && <p className="text-sm text-muted-foreground">Dieser Artikel hat keine offenen Fragen.</p>}
        </CardContent>
      </Card>

      {fragen && (
        <Card>
          <CardHeader>
            <CardTitle>2 · Wie viele?</CardTitle>
            <CardDescription>Bis zu {MAX_AUFLAGEN} Auflagen gleichzeitig vergleichen.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3" data-tour="kalkulation-auflagen">
              {auflagen.map((a, i) => (
                <div key={i} className="w-28 space-y-1">
                  <Label htmlFor={`auflage-${i}`}>Auflage {i + 1}</Label>
                  <div className="flex gap-1">
                    <Input
                      id={`auflage-${i}`}
                      inputMode="numeric"
                      value={a}
                      onChange={(e) => setAuflagen(auflagen.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                    {auflagen.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Auflage ${i + 1} entfernen`} onClick={() => setAuflagen(auflagen.filter((_, j) => j !== i))}>
                        ×
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {auflagen.length < MAX_AUFLAGEN && (
                <Button type="button" variant="outline" onClick={() => setAuflagen([...auflagen, ""])}>
                  + Auflage
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => void rechnen()} disabled={rechnet} data-tour="kalkulation-berechnen">
                {rechnet ? "Rechnet …" : "Richtpreis berechnen"}
              </Button>
              {anfrageId && ergebnis && (
                <Button type="button" variant="secondary" onClick={() => void zurAnfrage()}>
                  Zur Anfrage speichern
                </Button>
              )}
            </div>
            {meldung && <Alert variant="destructive">{meldung}</Alert>}
          </CardContent>
        </Card>
      )}

      {ergebnis && (
        <Card>
          <CardHeader>
            <CardTitle>3 · Ergebnis für „{ergebnis.artikel.titel}“</CardTitle>
            <CardDescription>
              Unverbindlicher Richtpreis (Stichtag {ergebnis.stichtag ?? "heute"}). Die Zuschläge stellen Sie unter{" "}
              <Link className="underline" href="/staff/kalkulation/einstellungen">
                Preis-Einstellungen
              </Link>{" "}
              ein.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ErgebnisTabelle e={ergebnis} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
