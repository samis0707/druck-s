"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { inquiryMessage } from "@/lib/inquiry/messages";
import { PRODUCT_HINTS } from "@/lib/ui-text";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

type ApiError = { error?: string; code?: string };

/** Anfrage ohne Kundenkonto: beschreiben, optional Dateien anhängen, danach per Code bestätigen. */
export default function AnfragePage() {
  const router = useRouter();
  const [product, setProduct] = useState("flyer");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function fail(message: string) {
    toast.add({ description: message, type: "error" });
  }

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const ok = picked.filter((f) => f.size > 0 && f.size <= MAX_FILE_BYTES);
    if (ok.length < picked.length) fail("Leere Dateien und Dateien über 100 MB wurden nicht übernommen.");
    setFiles((bisher) => [...bisher, ...ok].slice(0, 20));
  }

  async function send() {
    if (!description.trim()) return fail("Bitte beschreiben Sie kurz, was gedruckt werden soll.");
    if (!name.trim()) return fail("Bitte geben Sie Ihren Namen an.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return fail("Bitte geben Sie eine gültige E-Mail-Adresse an.");
    setBusy(true);
    try {
      const created = await fetch("/api/v1/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product,
          description,
          contact: { name, email, organisation: organisation || null, phone: phone || null },
        }),
      });
      const data = (await created.json()) as { inquiry?: { id: string } } & ApiError;
      if (!created.ok || !data.inquiry) throw new Error(inquiryMessage(data.code, "Die Anfrage konnte nicht angelegt werden."));
      const id = data.inquiry.id;
      if (files.length > 0) {
        const form = new FormData();
        for (const f of files) form.append("file", f);
        const up = await fetch(`/api/v1/inquiries/${id}/files`, { method: "POST", body: form });
        if (!up.ok) {
          const err = (await up.json()) as ApiError;
          throw new Error(inquiryMessage(err.code, "Die Dateien konnten nicht hochgeladen werden."));
        }
      }
      const code = await fetch(`/api/v1/inquiries/${id}/code`, { method: "POST" });
      if (!code.ok) {
        const err = (await code.json()) as ApiError;
        // Der Entwurf steht; die Bestätigungsseite kann den Code erneut anfordern.
        toast.add({ description: inquiryMessage(err.code, "Der Code konnte nicht gesendet werden."), type: "error" });
      } else {
        toast.add({ description: "Code wurde per E-Mail gesendet.", type: "success" });
      }
      router.push(`/anfrage/${id}`);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Die Anfrage konnte nicht angelegt werden.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 md:px-6 py-8">
      <PageHeader
        titel="Anfrage ohne Kundenkonto"
        beschreibung="Beschreiben Sie Ihr Vorhaben. Wir melden uns persönlich bei Ihnen."
        brotkrumen={[{ bezeichnung: "Start", href: "/" }, { bezeichnung: "Anfrage" }]}
      />
      <p className="text-sm text-muted-foreground">
        Sie sind schon Kunde? Dann geht es schneller über den{" "}
        <Link className="underline" href="/upload">
          Upload
        </Link>
        .
      </p>
      <Card>
        <CardContent className="space-y-5">
          <div className="space-y-1">
            <Label>Produkt</Label>
            <Select value={product} onValueChange={setProduct} options={PRODUCT_HINTS} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="beschreibung">Was soll gedruckt werden?</Label>
            <Textarea
              id="beschreibung"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Format, Auflage, Papier, Termin, Lieferung oder Abholung …"
              maxLength={5000}
            />
          </div>
          <div className="space-y-2">
            <Label id="dateien-label">Dateien (optional, mehrere möglich)</Label>
            <input ref={fileInput} type="file" multiple hidden onChange={pickFiles} aria-labelledby="dateien-label" />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
                Dateien auswählen
              </Button>
              <span className="text-sm text-muted-foreground">
                {files.length === 0 ? "Noch keine Datei. Sie können auch ohne Datei anfragen." : `${files.length} ${files.length === 1 ? "Datei" : "Dateien"}`}
              </span>
            </div>
            {files.length > 0 && (
              <ul className="space-y-1 text-sm">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{f.name}</span>
                    <button
                      type="button"
                      className="shrink-0 underline text-muted-foreground"
                      onClick={() => setFiles((bisher) => bisher.filter((_, j) => j !== i))}
                      disabled={busy}
                    >
                      Entfernen
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">E-Mail</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="firma">Firma oder Verein (optional)</Label>
              <Input id="firma" autoComplete="organization" value={organisation} onChange={(e) => setOrganisation(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="telefon">Telefon für Rückfragen (optional)</Label>
              <Input id="telefon" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Wir schicken Ihnen einen Code an diese Adresse. Erst wenn Sie ihn eingeben, geht die Anfrage bei uns ein. Es gilt
            unsere{" "}
            <Link className="underline" href="/datenschutz">
              Datenschutzerklärung
            </Link>
            .
          </p>
          <Button onClick={send} disabled={busy} data-umami-event="Anfrage ohne Konto gesendet">
            {busy ? "Wird gesendet …" : "Weiter zur Bestätigung"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
