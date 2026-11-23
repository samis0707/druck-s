"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErgebnisTabelle, type Ergebnis } from "@/components/kalkulation/ErgebnisTabelle";
import { kalkApi } from "@/components/kalkulation/api";

type Snapshot = {
  id: string;
  artikelId: string;
  artikelTitel: string | null;
  auflagen: number[];
  ergebnis: Ergebnis;
  preisEinstellungen: Ergebnis["einstellungen"];
  createdAt: string;
};

/** Richtpreis-Snapshots einer Anfrage („Richtpreis (unverbindlich)“); ohne Snapshot nichts. */
export function RichtpreisKarte({ requestId }: { requestId: string }) {
  const [liste, setListe] = useState<Snapshot[]>([]);

  useEffect(() => {
    let aktiv = true;
    void kalkApi<{ richtpreise: Snapshot[] }>(`/anfragen/${encodeURIComponent(requestId)}/richtpreis`).then((r) => {
      if (aktiv && r.ok) setListe(r.daten.richtpreise);
    });
    return () => {
      aktiv = false;
    };
  }, [requestId]);

  if (liste.length === 0) return null;
  return (
    <Card size="sm" data-tour="staff-richtpreis">
      <CardContent className="space-y-4">
        <CardTitle>Richtpreis (unverbindlich)</CardTitle>
        {liste.map((s, i) => (
          <div key={s.id} className="space-y-2">
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{s.artikelTitel ?? s.artikelId}</span>
              <span>· berechnet am {new Date(s.createdAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}</span>
              {i === 0 && liste.length > 1 && <Badge variant="secondary">neuester</Badge>}
            </CardDescription>
            <ErgebnisTabelle e={{ ...s.ergebnis, einstellungen: s.preisEinstellungen, artikel: s.ergebnis.artikel ?? { id: s.artikelId, titel: s.artikelTitel ?? s.artikelId, einheit: "" } }} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
