"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { inquiryMessage } from "@/lib/inquiry/messages";
import { company } from "@/lib/company";
import { CUSTOMER_STATUS } from "@/lib/ui-text";

type Inquiry = {
  id: string;
  status: string;
  number: string | null;
  productLabel: string;
  draft: {
    expiresAt: string;
    description: string;
    reference: string | null;
    files: { name: string; sizeBytes: number }[];
    contact: { name: string; email: string; organisation: string | null } | null;
    codeSent: boolean;
  } | null;
};

type ApiError = { error?: string; code?: string };

/** Schlüssel, unter dem /upload die eingegebene Adresse übergibt (nur für diesen Tab). */
const EMAIL_KEY = "dam-anfrage-email";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Bestätigungsseite einer offenen Anfrage. Hierher führt der Link aus der Code-Mail, die
 * Seite /anfrage, der Upload mit unbekannter Adresse und jede Anfrage, die ein Assistent
 * über die Schnittstelle vorbereitet hat: ansehen, Code eingeben, bestätigen.
 */
export default function AnfrageBestaetigenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [missing, setMissing] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function fetchInquiry(): Promise<Inquiry | null> {
    const res = await fetch(`/api/v1/inquiries/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { inquiry: Inquiry }).inquiry;
  }

  async function reload() {
    const aktuell = await fetchInquiry();
    if (aktuell) setInquiry(aktuell);
    else setMissing(true);
  }

  useEffect(() => {
    let aktiv = true;
    fetchInquiry().then((geladen) => {
      if (!aktiv) return;
      if (!geladen) {
        setMissing(true);
        return;
      }
      setInquiry(geladen);
      try {
        const adresse = sessionStorage.getItem(EMAIL_KEY);
        if (adresse) setEmail(adresse);
      } catch {
        /* Storage nicht verfügbar — Feld bleibt leer. */
      }
    });
    return () => {
      aktiv = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function fail(text: string) {
    toast.add({ description: text, type: "error" });
  }

  async function sendCode(withContact: boolean) {
    if (withContact) {
      if (!name.trim()) return fail("Bitte geben Sie Ihren Namen an.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return fail("Bitte geben Sie eine gültige E-Mail-Adresse an.");
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/inquiries/${id}/code`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          withContact ? { contact: { name, email, organisation: organisation || null, phone: phone || null } } : {},
        ),
      });
      const data = (await res.json()) as ApiError;
      if (!res.ok) throw new Error(inquiryMessage(data.code, "Der Code konnte nicht gesendet werden."));
      try {
        sessionStorage.removeItem(EMAIL_KEY);
      } catch {
        /* ohne Belang */
      }
      toast.add({ description: "Code wurde per E-Mail gesendet.", type: "success" });
      await reload();
    } catch (e) {
      fail(e instanceof Error ? e.message : "Der Code konnte nicht gesendet werden.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!/^\d{6}$/.test(code.replace(/\s+/g, ""))) return fail("Bitte geben Sie die sechs Ziffern aus der E-Mail ein.");
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/inquiries/${id}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { inquiry?: Inquiry; message?: string } & ApiError;
      if (!res.ok || !data.inquiry) throw new Error(inquiryMessage(data.code, "Die Bestätigung ist fehlgeschlagen."));
      setInquiry(data.inquiry);
      setMessage(data.message ?? "");
    } catch (e) {
      fail(e instanceof Error ? e.message : "Die Bestätigung ist fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const draft = inquiry?.draft ?? null;
  const done = inquiry !== null && inquiry.status !== "draft";

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 md:px-6 py-8">
      <PageHeader
        titel={done ? "Anfrage eingegangen" : "Anfrage bestätigen"}
        beschreibung={done ? undefined : "Prüfen Sie Ihre Angaben und bestätigen Sie mit dem Code aus Ihrer E-Mail."}
        brotkrumen={[{ bezeichnung: "Start", href: "/" }, { bezeichnung: "Anfrage" }]}
      />

      {missing && (
        <Card>
          <CardContent className="space-y-4">
            <p>Diese Anfrage gibt es nicht mehr. Entwürfe verfallen nach kurzer Zeit, wenn sie nicht bestätigt werden.</p>
            <Button render={<Link href="/anfrage" />}>Neue Anfrage beginnen</Button>
          </CardContent>
        </Card>
      )}

      {done && inquiry && (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-lg font-semibold tabular-nums">Nummer {inquiry.number}</p>
            <p>{message || CUSTOMER_STATUS[inquiry.status.toUpperCase()] || "Ihre Anfrage liegt bei uns."}</p>
            <p className="text-sm text-muted-foreground">
              Fragen? {company.phone} oder {company.email}. Nennen Sie dabei bitte die Nummer.
            </p>
          </CardContent>
        </Card>
      )}

      {draft && inquiry && (
        <>
          <Card>
            <CardContent className="space-y-3">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Produkt</dt>
                <dd>{inquiry.productLabel}</dd>
                <dt className="text-muted-foreground">Beschreibung</dt>
                <dd className="whitespace-pre-wrap break-words">{draft.description}</dd>
                <dt className="text-muted-foreground">Dateien</dt>
                <dd>
                  {draft.files.length === 0 ? (
                    "Keine"
                  ) : (
                    <ul className="space-y-1">
                      {draft.files.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="break-words">
                          {f.name} <span className="text-muted-foreground">({formatBytes(f.sizeBytes)})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
                {draft.contact && (
                  <>
                    <dt className="text-muted-foreground">Kontakt</dt>
                    <dd>
                      {[draft.contact.name, draft.contact.organisation].filter(Boolean).join(", ")} · {draft.contact.email}
                    </dd>
                  </>
                )}
              </dl>
              <p className="text-sm text-muted-foreground">
                Stimmt etwas nicht? Bestätigen Sie nicht und{" "}
                <Link className="underline" href="/anfrage">
                  beginnen Sie neu
                </Link>
                . Ohne Bestätigung geht nichts bei uns ein.
              </p>
            </CardContent>
          </Card>

          {!draft.contact && (
            <Card>
              <CardContent className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  Wir kennen Ihre Adresse noch nicht. Mit ein paar Angaben können wir uns bei Ihnen melden.
                </p>
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
                <Button onClick={() => sendCode(true)} disabled={busy}>
                  {busy ? "Wird gesendet …" : "Code senden"}
                </Button>
              </CardContent>
            </Card>
          )}

          {draft.contact && (
            <Card>
              <CardContent className="space-y-4">
                {draft.codeSent ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Wir haben einen 6-stelligen Code an {draft.contact.email} geschickt.
                    </p>
                    <div className="space-y-1">
                      <Label htmlFor="code">Code</Label>
                      <Input
                        id="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button onClick={confirm} disabled={busy} data-umami-event="Anfrage ohne Konto bestätigt">
                        {busy ? "Wird geprüft …" : "Anfrage bestätigen"}
                      </Button>
                      <button type="button" className="text-sm underline text-muted-foreground" onClick={() => sendCode(false)} disabled={busy}>
                        Neuen Code senden
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Zur Bestätigung schicken wir einen 6-stelligen Code an {draft.contact.email}.
                    </p>
                    <Button onClick={() => sendCode(false)} disabled={busy}>
                      {busy ? "Wird gesendet …" : "Code senden"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
