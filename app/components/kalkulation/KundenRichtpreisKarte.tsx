"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fehlerText, kalkApi } from "./api";

type Stand = {
  aktiv: boolean;
  zuordnung: Record<string, string[]>;
  produkte: { value: string; label: string }[];
  artikel: { id: string; titel: string; freigegeben: boolean }[];
  stammdatenVorhanden: boolean;
};

/**
 * Richtpreis für Kunden: Schalter (Standard aus) und Zuordnung Produkt → Artikel. Nur zugeordnete,
 * für den Shop freigegebene Artikel erscheinen in der offenen Anfrage und auf der Website.
 */
export function KundenRichtpreisKarte() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [aktiv, setAktiv] = useState(false);
  const [zuordnung, setZuordnung] = useState<Record<string, string[]>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    let lebt = true;
    void kalkApi<Stand>("/einstellungen/kunden").then((r) => {
      if (!lebt) return;
      if (!r.ok) return setFehler(fehlerText(r));
      setStand(r.daten);
      setAktiv(r.daten.aktiv);
      setZuordnung(r.daten.zuordnung);
    });
    return () => {
      lebt = false;
    };
  }, []);

  function umschalten(artikelId: string, produkt: string, an: boolean) {
    const liste = new Set(zuordnung[produkt] ?? []);
    if (an) liste.add(artikelId);
    else liste.delete(artikelId);
    setZuordnung({ ...zuordnung, [produkt]: [...liste] });
  }

  async function speichern() {
    setSpeichert(true);
    setFehler(null);
    const r = await kalkApi<{ aktiv: boolean }>("/einstellungen/kunden", { method: "PUT", body: { aktiv, zuordnung } });
    setSpeichert(false);
    if (!r.ok) return setFehler(fehlerText(r));
    toast.add({ description: aktiv ? "Richtpreis für Kunden ist an." : "Richtpreis für Kunden ist aus.", type: "success" });
  }

  if (fehler && !stand) return <Alert variant="destructive">{fehler}</Alert>;
  if (!stand) return <Skeleton className="h-48 w-full rounded-2xl" />;

  const freigegeben = stand.artikel.filter((a) => a.freigegeben);

  return (
    <Card data-tour="kalkulation-kunden-richtpreis">
      <CardHeader>
        <CardTitle>Richtpreis für Kunden anzeigen</CardTitle>
        <CardDescription>
          Wenn an, können Besucher in der offenen Anfrage (und auf digitalemedien.de) einen ungefähren, unverbindlichen Preis sehen. Standard ist aus, solange die Stammdaten nicht geprüft sind.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-start gap-3 text-sm">
          <input id="kunden-richtpreis-aktiv" type="checkbox" className="mt-1 size-4" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} />
          <span>
            <span className="font-medium">Richtpreis für Kunden anzeigen</span>
            <span className="block text-muted-foreground">Aus: Besucher sehen keinen Preis, die Anfrage funktioniert wie bisher.</span>
          </span>
        </label>

        {aktiv && !stand.stammdatenVorhanden && <Alert variant="destructive">Es sind noch keine Stammdaten vorhanden; es erscheint kein Preis.</Alert>}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Zu welchem Produkt gehört welcher Artikel?</h3>
          <p className="text-xs text-muted-foreground">
            Das Produkt wählt der Kunde in der Anfrage, der Artikel stellt die Fragen und rechnet. Ohne Zuordnung erscheint für das Produkt kein Preis. Nur für den Shop freigegebene Artikel sind wählbar.
          </p>
          {freigegeben.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch kein Artikel für den Shop freigegeben (in der Werkbank unter Artikel).</p>
          ) : (
            <ul className="divide-y rounded-2xl border">
              {freigegeben.map((a) => (
                <li key={a.id} className="space-y-2 p-3">
                  <div className="text-sm font-medium">
                    {a.titel} <span className="font-normal text-muted-foreground">({a.id})</span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {stand.produkte.map((p) => (
                      <label key={p.value} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="size-4" checked={(zuordnung[p.value] ?? []).includes(a.id)} onChange={(e) => umschalten(a.id, p.value, e.target.checked)} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {fehler && <Alert variant="destructive">{fehler}</Alert>}
        <Button type="button" onClick={() => void speichern()} disabled={speichert}>
          {speichert ? "Speichert …" : "Speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}
