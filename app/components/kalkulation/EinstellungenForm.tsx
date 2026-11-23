"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  STANDARD_PREIS_EINSTELLUNGEN,
  euroText,
  pruefeEinstellungen,
  richtpreis,
  type PreisEinstellungen,
  type RundungSchrittCent,
} from "@/lib/kalkulation/richtpreis";
import { fehlerText, kalkApi } from "./api";

const SELECT_KLASSE =
  "h-8 w-full rounded-2xl border border-transparent bg-input/50 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

type Eingabe = Record<"gemeinkosten" | "gewinn" | "mindestpreis" | "spanneUnten" | "spanneOben" | "mwst", string>;

const zuText = (n: number) => String(n).replace(".", ",");
const zuZahl = (t: string) => (t.trim() === "" ? Number.NaN : Number(t.trim().replace(",", ".")));

function ausEinstellungen(e: PreisEinstellungen): Eingabe {
  return {
    gemeinkosten: zuText(e.gemeinkostenProzent),
    gewinn: zuText(e.gewinnProzent),
    mindestpreis: zuText(e.mindestpreisCent / 100),
    spanneUnten: zuText(e.spanneUntenProzent),
    spanneOben: zuText(e.spanneObenProzent),
    mwst: zuText(e.mwstProzent),
  };
}

const BEISPIEL_KOSTEN_ZEHNTELCENT = 50_000; // Kosten 50,00 €

/** Einstellungen der Preisschicht mit Beispielrechnung, die sich beim Tippen mitändert. */
export function EinstellungenForm() {
  const router = useRouter();
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [eingabe, setEingabe] = useState<Eingabe>(ausEinstellungen(STANDARD_PREIS_EINSTELLUNGEN));
  const [schritt, setSchritt] = useState<RundungSchrittCent>(STANDARD_PREIS_EINSTELLUNGEN.rundungSchrittCent);
  const [richtung, setRichtung] = useState<PreisEinstellungen["rundungRichtung"]>(STANDARD_PREIS_EINSTELLUNGEN.rundungRichtung);
  const [speichert, setSpeichert] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const r = await kalkApi<{ einstellungen: PreisEinstellungen }>("/einstellungen");
      if (!aktiv) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) router.push("/staff/login");
        else setFehler(fehlerText(r));
        return;
      }
      setEingabe(ausEinstellungen(r.daten.einstellungen));
      setSchritt(r.daten.einstellungen.rundungSchrittCent);
      setRichtung(r.daten.einstellungen.rundungRichtung);
      setGeladen(true);
    })();
    return () => {
      aktiv = false;
    };
  }, [router]);

  const pruefung = useMemo(
    () =>
      pruefeEinstellungen({
        gemeinkostenProzent: zuZahl(eingabe.gemeinkosten),
        gewinnProzent: zuZahl(eingabe.gewinn),
        mindestpreisCent: Math.round(zuZahl(eingabe.mindestpreis) * 100),
        rundungSchrittCent: schritt,
        rundungRichtung: richtung,
        spanneUntenProzent: zuZahl(eingabe.spanneUnten),
        spanneObenProzent: zuZahl(eingabe.spanneOben),
        mwstProzent: zuZahl(eingabe.mwst),
      }),
    [eingabe, schritt, richtung],
  );

  const beispiel = useMemo(() => {
    if (!pruefung.ok) return null;
    return richtpreis({ auflage: 100, kostenZehntelcent: BEISPIEL_KOSTEN_ZEHNTELCENT, vollstaendig: true, ohneKosten: [] }, pruefung.wert);
  }, [pruefung]);

  async function speichern() {
    if (!pruefung.ok) return;
    setSpeichert(true);
    setMeldung(null);
    const r = await kalkApi<{ einstellungen: PreisEinstellungen }>("/einstellungen", { method: "PUT", body: pruefung.wert });
    setSpeichert(false);
    if (!r.ok) {
      setMeldung(fehlerText(r));
      return;
    }
    toast.add({ description: "Preis-Einstellungen gespeichert.", type: "success" });
  }

  const feld = (k: keyof Eingabe, label: string, einheit: string, hilfe: string) => (
    <div className="space-y-1">
      <Label htmlFor={`einst-${k}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={`einst-${k}`} inputMode="decimal" value={eingabe[k]} onChange={(e) => setEingabe({ ...eingabe, [k]: e.target.value })} className="max-w-32" />
        <span className="text-sm text-muted-foreground">{einheit}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hilfe}</p>
    </div>
  );

  if (fehler) return <Alert variant="destructive">{fehler}</Alert>;
  if (!geladen) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card data-tour="kalkulation-einstellungen">
        <CardHeader>
          <CardTitle>So wird aus den Kosten ein Richtpreis</CardTitle>
          <CardDescription>
            Die Kalkulation liefert nur Kosten. Hier legen Sie fest, was daraufkommt. Änderungen gelten sofort für neue Berechnungen; gespeicherte Richtpreise zu Anfragen behalten ihre damaligen Werte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            {feld("gemeinkosten", "Gemeinkosten / Vertrieb", "%", "Zuschlag auf die Kosten (Verwaltung, Vertrieb).")}
            {feld("gewinn", "Gewinn", "%", "Aufschlag auf Kosten plus Gemeinkosten.")}
            {feld("mindestpreis", "Mindestpreis je Auftrag (netto)", "€", "Kleinere Aufträge werden auf diesen Betrag angehoben. 0 = keiner.")}
            {feld("mwst", "Mehrwertsteuer", "%", "Für den Bruttopreis (Standard 19 %).")}
            {feld("spanneUnten", "Spanne nach unten", "%", "Untere Grenze der Spanne unter dem Richtpreis.")}
            {feld("spanneOben", "Spanne nach oben", "%", "Obere Grenze der Spanne über dem Richtpreis.")}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="einst-schritt">Runden auf</Label>
              <select id="einst-schritt" className={SELECT_KLASSE} value={schritt} onChange={(e) => setSchritt(Number(e.target.value) as RundungSchrittCent)}>
                <option value={1}>1 Cent (genau)</option>
                <option value={10}>10 Cent</option>
                <option value={100}>volle 1 €</option>
                <option value={500}>volle 5 €</option>
                <option value={1000}>volle 10 €</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="einst-richtung">Rundungsart</Label>
              <select id="einst-richtung" className={SELECT_KLASSE} value={richtung} onChange={(e) => setRichtung(e.target.value as PreisEinstellungen["rundungRichtung"])}>
                <option value="auf">immer aufrunden</option>
                <option value="kaufmaennisch">kaufmännisch (zum nächsten Wert)</option>
              </select>
            </div>
          </div>
          {!pruefung.ok && (
            <Alert variant="destructive">
              <ul className="list-disc pl-5">
                {pruefung.fehler.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </Alert>
          )}
          {meldung && <Alert variant="destructive">{meldung}</Alert>}
          <div className="flex gap-3">
            <Button type="button" onClick={() => void speichern()} disabled={!pruefung.ok || speichert}>
              {speichert ? "Speichert …" : "Speichern"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEingabe(ausEinstellungen(STANDARD_PREIS_EINSTELLUNGEN));
                setSchritt(STANDARD_PREIS_EINSTELLUNGEN.rundungSchrittCent);
                setRichtung(STANDARD_PREIS_EINSTELLUNGEN.rundungRichtung);
              }}
            >
              Standardwerte einsetzen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm" data-tour="kalkulation-beispiel" aria-live="polite">
        <CardHeader>
          <CardTitle>Beispielrechnung</CardTitle>
          <CardDescription>Kosten von {euroText(BEISPIEL_KOSTEN_ZEHNTELCENT / 10)} bei 100 Stück.</CardDescription>
        </CardHeader>
        <CardContent>
          {beispiel && beispiel.status === "preis" ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
              <dt>Kosten</dt>
              <dd className="text-right tabular-nums">{euroText(BEISPIEL_KOSTEN_ZEHNTELCENT / 10)}</dd>
              <dt>+ Gemeinkosten</dt>
              <dd className="text-right tabular-nums">{euroText(Math.round(beispiel.rechenweg.gemeinkostenZehntelcent / 10))}</dd>
              <dt>+ Gewinn</dt>
              <dd className="text-right tabular-nums">{euroText(Math.round(beispiel.rechenweg.gewinnZehntelcent / 10))}</dd>
              <dt>= Zwischensumme</dt>
              <dd className="text-right tabular-nums">{euroText(beispiel.rechenweg.zwischensummeCent)}</dd>
              <dt>nach Mindestpreis</dt>
              <dd className="text-right tabular-nums">{euroText(beispiel.rechenweg.nachMindestpreisCent)}</dd>
              <dt className="font-medium">Richtpreis netto (gerundet)</dt>
              <dd className="text-right font-semibold tabular-nums">{euroText(beispiel.preis.nettoCent)}</dd>
              <dt>Spanne netto</dt>
              <dd className="text-right tabular-nums">
                {euroText(beispiel.von.nettoCent)} – {euroText(beispiel.bis.nettoCent)}
              </dd>
              <dt>Richtpreis brutto</dt>
              <dd className="text-right tabular-nums">{euroText(beispiel.preis.bruttoCent)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Bitte die markierten Angaben korrigieren.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
