"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { FileThumb } from "@/components/brand/FileThumb";
import { PageHeader } from "@/components/layout/PageHeader";
import { Fotoband } from "@/components/upload/Fotoband";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { PRODUCT_HINTS } from "@/lib/ui-text";
import { PageTour } from "@/components/tour/PageTour";

/** Serverregel (app/api/drafts/[id]/files/route.ts): leere Dateien und >100 MB werden abgelehnt. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

type Step = "form" | "email" | "code";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Stabile, leichte Schräglage je Datei (−2,5° … +2,5°), damit die Blätter wie hingelegt wirken. */
function tiltFor(file: File): string {
  let h = file.size;
  for (const ch of file.name) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return `${((h % 51) - 25) / 10}deg`;
}

function phaseLabel(progress: number): string {
  if (progress >= 100) return "Fertig";
  if (progress > 10) return "Dateien werden übertragen …";
  return "Auftrag wird angelegt …";
}

/** Door A: erst alles ausfüllen und hochladen, nach Send per E-Mail + Code bestätigen. */
export default function UploadPage() {
  const router = useRouter();
  const [hint, setHint] = useState("flyer");
  const [reference, setReference] = useState("");
  const [freeText, setFreeText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [ablehnung, setAblehnung] = useState<string | null>(null);
  const [dragAktiv, setDragAktiv] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const eingabeRef = useRef<HTMLInputElement>(null);

  function fail(message: string) {
    toast.add({ description: message, type: "error" });
  }

  function verarbeiteDateien(neueDateien: File[]) {
    if (neueDateien.length === 0 || busy) return;
    const gueltig: File[] = [];
    const abgelehnt: string[] = [];
    for (const d of neueDateien) {
      if (d.size === 0) abgelehnt.push(`${d.name}: Datei ist leer`);
      else if (d.size > MAX_FILE_BYTES) abgelehnt.push(`${d.name}: Datei überschreitet 100 MB`);
      else gueltig.push(d);
    }
    if (gueltig.length > 0) setFiles((bisher) => [...bisher, ...gueltig]);
    setAblehnung(abgelehnt.length > 0 ? abgelehnt.join(" · ") : null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragAktiv(false);
    verarbeiteDateien(Array.from(e.dataTransfer.files ?? []));
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const neueDateien = Array.from(e.target.files ?? []);
    e.target.value = "";
    verarbeiteDateien(neueDateien);
  }

  function entferneDatei(index: number) {
    setFiles((bisher) => bisher.filter((_, i) => i !== index));
  }

  async function send() {
    if (!freeText.trim()) return fail("Bitte beschreiben Sie Ihren Druckauftrag.");
    if (files.length === 0) return fail("Bitte fügen Sie mindestens eine Datei hinzu.");
    setBusy(true);
    setProgress(10);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productHint: hint, referenceText: reference || null, freeText }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload fehlgeschlagen");
      const { draftId: id } = (await res.json()) as { draftId: string };
      const form = new FormData();
      for (const f of files) form.append("file", f);
      setProgress(45);
      const up = await fetch(`/api/drafts/${id}/files`, { method: "POST", body: form });
      if (!up.ok) throw new Error((await up.json()).error ?? "Datei-Upload fehlgeschlagen");
      setProgress(100);
      setDraftId(id);
      setStep("email");
      toast.add({ description: "Dateien erhalten — bitte E-Mail bestätigen.", type: "success" });
    } catch (e) {
      fail(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function requestCode() {
    setBusy(true);
    try {
      const res = await fetch(`/api/drafts/${draftId}/otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Code konnte nicht gesendet werden");
      setStep("code");
      toast.add({ description: "Code wurde per E-Mail gesendet.", type: "success" });
    } catch (e) {
      fail(e instanceof Error ? e.message : "Code konnte nicht gesendet werden");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    try {
      const res = await fetch(`/api/drafts/${draftId}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bestätigung fehlgeschlagen");
      toast.add({ description: "Auftrag eingegangen.", type: "success" });
      try {
        sessionStorage.setItem("dam-neuer-auftrag", data.request.id);
      } catch {
        /* Storage nicht verfügbar — Detailseite ohne Dialog. */
      }
      router.push(`/requests/${data.request.id}`);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Bestätigung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 md:px-6 py-8">
      <PageHeader
        titel="Druckdaten hochladen"
        beschreibung="Dateien hochladen, Auftrag beschreiben, per Code bestätigen."
        brotkrumen={[{ bezeichnung: "Start", href: "/" }, { bezeichnung: "Upload" }]}
        aktionen={step === "form" ? <PageTour id="upload" /> : undefined}
      />
      {busy && (
        <Progress value={progress} aria-label="Upload-Fortschritt">
          <ProgressLabel>{phaseLabel(progress)}</ProgressLabel>
          <ProgressValue />
        </Progress>
      )}
      {step === "form" && (
        <Fotoband
          gesperrt={busy}
          panels={[
            {
              id: "dateien",
              titel: "Dateien hochladen",
              zusammenfassung: `${files.length} ${files.length === 1 ? "Datei" : "Dateien"} · ${formatBytes(files.reduce((summe, f) => summe + f.size, 0))}`,
              gueltig: files.length > 0,
              hinweis: "Bitte fügen Sie mindestens eine Datei hinzu.",
              inhalt: (
                <div className="space-y-1">
                  <Label id="dateien-label">Dateien (PDF, Bilder, Word, Excel — mehrere möglich)</Label>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-labelledby="dateien-label"
                    aria-label="Dateien per Klick oder Drag and Drop hinzufügen"
                    className={`auftrag-dropzone ${dragAktiv ? "auftrag-dropzone-drag" : ""}`}
                    onClick={() => eingabeRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        eingabeRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!busy) setDragAktiv(true);
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      setDragAktiv(false);
                    }}
                    onDrop={handleDrop}
                  >
                    {dragAktiv && (
                      <svg className="ants" aria-hidden="true">
                        <rect />
                      </svg>
                    )}
                    <span className="auftrag-dropzone-icon" aria-hidden="true">
                      <HugeiconsIcon icon={CloudUploadIcon} size={22} />
                    </span>
                    <p className="auftrag-dropzone-main">
                      Dateien hierher ziehen oder <strong className="underline underline-offset-[3px]">durchsuchen</strong>
                    </p>
                    <input
                      ref={eingabeRef}
                      type="file"
                      multiple
                      aria-label="Dateien auswählen"
                      className="sr-only"
                      onChange={handleInput}
                    />
                  </div>
                  {files.length > 0 && (
                    <ul className="flex flex-wrap gap-x-5 gap-y-6 px-1 pt-4 pb-1">
                      {files.map((f, i) => (
                        <li
                          key={`${f.name}-${f.size}-${i}`}
                          className="file-sheet group/file relative w-[104px]"
                          style={{ ["--tilt" as string]: tiltFor(f) } as React.CSSProperties}
                        >
                          <FileThumb file={f} scanning={busy} />
                          <button
                            type="button"
                            aria-label={`${f.name} entfernen`}
                            disabled={busy}
                            onClick={() => entferneDatei(i)}
                            className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-(--shadow-e2) hover:text-destructive disabled:pointer-events-none disabled:opacity-45"
                          >
                            <HugeiconsIcon icon={Cancel01Icon} size={14} />
                          </button>
                          <p className="mt-2 truncate text-xs font-medium" title={f.name}>
                            {f.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">{formatBytes(f.size)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {ablehnung !== null && (
                    <p role="alert" className="text-[13px] text-destructive">
                      {ablehnung}
                    </p>
                  )}
                </div>
              ),
            },
            {
              id: "anfrage",
              titel: "Ihre Anfrage",
              zusammenfassung: freeText.trim().replace(/\s+/g, " ").slice(0, 160),
              gueltig: freeText.trim().length > 0,
              hinweis: "Bitte beschreiben Sie Ihren Druckauftrag.",
              inhalt: (
                <div className="space-y-1">
                  <Label htmlFor="freetext">Beschreiben Sie Ihren Druckauftrag</Label>
                  <Textarea
                    id="freetext"
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    placeholder="Was soll gedruckt werden? Mengen, Extras, Termine …"
                  />
                </div>
              ),
            },
            {
              id: "produkt",
              titel: "Mögliches Produkt",
              zusammenfassung: PRODUCT_HINTS.find((p) => p.value === hint)?.label ?? hint,
              gueltig: true,
              inhalt: (
                <div className="space-y-1">
                  <Label>Produkt</Label>
                  <Select value={hint} onValueChange={setHint} options={PRODUCT_HINTS} />
                </div>
              ),
            },
            {
              id: "referenz",
              titel: "Referenz",
              zusammenfassung: reference.trim() || "Keine Referenz angegeben",
              gueltig: true,
              inhalt: (
                <div className="space-y-1">
                  <Label htmlFor="ref">Referenz (optional, z. B. wie letztes Mal, Auftrag Nr. …)</Label>
                  <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              ),
              aktion: (
                <Button onClick={send} disabled={busy} data-umami-event="Anfrage gesendet">
                  {busy ? "Wird gesendet …" : "Anfrage senden"}
                </Button>
              ),
            },
          ]}
        />
      )}
      {step === "email" && (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Dateien erhalten. Geben Sie Ihre hinterlegte E-Mail-Adresse ein — wir senden Ihnen einen Code.
            </p>
            <div className="space-y-1">
              <Label htmlFor="email">E-Mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button onClick={requestCode} disabled={busy}>
              {busy ? "Wird gesendet …" : "Code senden"}
            </Button>
          </CardContent>
        </Card>
      )}
      {step === "code" && (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Geben Sie den 6-stelligen Code aus der E-Mail ein.</p>
            <div className="space-y-1">
              <Label htmlFor="code">Code</Label>
              <Input id="code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <Button onClick={verify} disabled={busy} data-umami-event="Upload bestätigt">
              {busy ? "Wird geprüft …" : "Upload bestätigen"}
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
