"use client";

/* Fetch-on-mount data loading: setState runs after await (no cascading render). */

import { use, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout/PageHeader";
import { PRODUCT_HINTS } from "@/lib/ui-text";

/** Door B: Einmal-Link der Druckerei. Kein Login; der Link verfällt beim Senden. */
export default function LinkUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<"loading" | "active" | "dead">("loading");
  const [message, setMessage] = useState("");
  const [hint, setHint] = useState("flyer");
  const [freeText, setFreeText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetch(`/api/upload-links/${token}`).then(async (res) => {
      if (res.ok) {
        setState("active");
      } else {
        setState("dead");
        setMessage((await res.json()).error ?? "Link ungültig");
      }
    });
  }, [token]);

  async function submit() {
    if (!freeText.trim()) return toast.add({ description: "Bitte beschreiben Sie Ihren Druckauftrag.", type: "error" });
    if (files.length === 0) return toast.add({ description: "Bitte fügen Sie mindestens eine Datei hinzu.", type: "error" });
    setBusy(true);
    setProgress(20);
    try {
      let draftId = "";
      let done = 0;
      for (const f of files) {
        const form = new FormData();
        if (draftId) form.set("draftId", draftId);
        form.set("file", f);
        const up = await fetch(`/api/upload-links/${token}/files`, { method: "POST", body: form });
        const data = await up.json();
        if (!up.ok) throw new Error(data.error ?? "Upload fehlgeschlagen");
        draftId = data.draftId;
        done += 1;
        setProgress(20 + Math.round((70 * done) / files.length));
      }
      const res = await fetch(`/api/upload-links/${token}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId, productHint: hint, freeText }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Senden fehlgeschlagen");
      setDone(true);
      toast.add({ description: "Dateien erhalten — die Druckerei meldet sich bei Ihnen.", type: "success" });
    } catch (e) {
      toast.add({ description: e instanceof Error ? e.message : "Senden fehlgeschlagen", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <main className="p-8 text-sm text-muted-foreground">Wird geladen …</main>;
  if (state === "dead" || done) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <Card>
          <CardContent>
            <p className="text-sm">{done ? "Dateien erhalten — die Druckerei meldet sich bei Ihnen." : message}</p>
          </CardContent>
        </Card>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 md:px-6 py-8">
      <PageHeader
        titel="Druckdaten hochladen"
        beschreibung="Dateien hochladen und Auftrag beschreiben — der Link verfällt beim Senden."
        brotkrumen={[{ bezeichnung: "Start", href: "/" }, { bezeichnung: "Upload per Link" }]}
      />
      {busy && <Progress value={progress} />}
      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Dateien (mehrere möglich)</Label>
            <Input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && <p className="text-sm text-muted-foreground">{files.length} Datei(en) ausgewählt</p>}
          </div>
          <div className="space-y-1">
            <Label>Ihre Anfrage</Label>
            <Textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Produkt</Label>
            <Select value={hint} onValueChange={setHint} options={PRODUCT_HINTS} />
          </div>
          <Button onClick={submit} disabled={busy} data-umami-event="Dateien über Upload-Link gesendet">
            {busy ? "Wird gesendet …" : "Dateien senden"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
