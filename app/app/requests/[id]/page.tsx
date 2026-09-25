"use client";

/* Fetch-on-mount data loading: setState runs after await (no cascading render). */
/* eslint-disable react-hooks/set-state-in-effect */

import { use, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, toneVariant } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusFolds } from "@/components/requests/StatusFolds";
import { customerLine, detailRef, type RequestDetail } from "@/components/requests/request-detail";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CUSTOMER_STATUS, STATUS_TONE, productLabel, severityTone, severityLabel } from "@/lib/ui-text";

/** Ergebnis-Dialog: Poll-Intervall und maximale Dauer für Analyse/Note. */
const ERGEBNIS_POLL_MS = 3000;
const ERGEBNIS_MAX_POLLS = 40;
const NEUER_AUFTRAG_KEY = "dam-neuer-auftrag";

/** Kundenansicht: gleiche Daten wie Staff, Kunden-Wording. */
export default function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loginStep, setLoginStep] = useState<"email" | "code">("email");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [approveCode, setApproveCode] = useState("");
  const [approving, setApproving] = useState(false);
  const [mailto, setMailto] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [ergebnisOffen, setErgebnisOffen] = useState(false);
  const [ergebnisAbgelaufen, setErgebnisAbgelaufen] = useState(false);

  function ergebnisVollstaendig(d: RequestDetail): boolean {
    return d.note !== null && d.files.every((f) => f.report !== null);
  }

  async function load() {
    const res = await fetch(`/api/requests/${id}`);
    if (res.status === 404) {
      setNeedsLogin(true);
      return;
    }
    const data = (await res.json()) as RequestDetail;
    setDetail(data);
    // Einmal-Dialog nur direkt nach Send (Flag von der Upload-Seite).
    try {
      if (sessionStorage.getItem(NEUER_AUFTRAG_KEY) === id) {
        sessionStorage.removeItem(NEUER_AUFTRAG_KEY);
        setErgebnisAbgelaufen(false);
        setErgebnisOffen(true);
      }
    } catch {
      /* Storage nicht verfügbar — kein Dialog. */
    }
  }

  // Polling solange der Ergebnis-Dialog offen und unvollständig ist.
  useEffect(() => {
    if (!ergebnisOffen || !detail || ergebnisVollstaendig(detail)) return;
    let polls = 0;
    const timer = setInterval(async () => {
      polls += 1;
      if (polls >= ERGEBNIS_MAX_POLLS) {
        setErgebnisAbgelaufen(true);
        clearInterval(timer);
        return;
      }
      const res = await fetch(`/api/requests/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as RequestDetail;
      setDetail(data);
      if (ergebnisVollstaendig(data)) clearInterval(timer);
    }, ERGEBNIS_POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ergebnisOffen, id]);

  useEffect(() => {
    if (id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loginOtp() {
    const res = await fetch("/api/login/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return toast.add({ description: (await res.json()).error ?? "Login fehlgeschlagen", type: "error" });
    setLoginStep("code");
    toast.add({ description: "Code wurde per E-Mail gesendet.", type: "success" });
  }

  async function loginVerify() {
    const res = await fetch("/api/login/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) return toast.add({ description: (await res.json()).error ?? "Login fehlgeschlagen", type: "error" });
    setNeedsLogin(false);
    await load();
  }

  async function startApprove() {
    const res = await fetch(`/api/requests/${id}/approval/otp`, { method: "POST" });
    if (!res.ok) return toast.add({ description: (await res.json()).error ?? "Freigabe nicht möglich", type: "error" });
    setApproving(true);
    toast.add({ description: "Freigabe-Code wurde per E-Mail gesendet.", type: "success" });
  }

  async function confirmApprove() {
    const res = await fetch(`/api/requests/${id}/approval/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: approveCode }),
    });
    if (!res.ok) return toast.add({ description: (await res.json()).error ?? "Freigabe fehlgeschlagen", type: "error" });
    setApproving(false);
    setApproveCode("");
    toast.add({ description: "Auftrag freigegeben — die Produktion kann starten.", type: "success" });
    await load();
  }

  async function requestChanges() {
    const res = await fetch(`/api/requests/${id}/change-request`, { method: "POST" });
    if (!res.ok) return toast.add({ description: (await res.json()).error ?? "Fehlgeschlagen", type: "error" });
    setMailto(((await res.json()) as { mailto: { to: string; subject: string; body: string } }).mailto);
  }

  if (needsLogin) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-8">
        <h1 className="text-xl font-bold">Auftrag ansehen</h1>
        <Card>
          <CardContent className="space-y-3">
            {loginStep === "email" ? (
              <>
                <Label>E-Mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Button onClick={loginOtp}>Code senden</Button>
              </>
            ) : (
              <>
                <Label>Code aus der E-Mail</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} />
                <Button onClick={loginVerify}>Anmelden</Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </main>
    );
  }
  const status = detail.request.status;
  const ref = detailRef(detail);
  const kunde = customerLine(detail.customer, "customer");
  const freigabe =
    status === "WAITING_APPROVAL" ? (
      <div className="space-y-3 border-t border-border pt-4">
        <p className="font-medium">Ihre Freigabe</p>
        <p className="text-sm text-muted-foreground">
          Bitte prüfen Sie Auftragsbestätigung und Druckdateien. Mit einem Code aus Ihrer E-Mail geben Sie verbindlich frei.
        </p>
        {!approving ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={startApprove}>Freigeben</Button>
            <Button variant="outline" onClick={requestChanges}>
              Änderungswunsch
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder="Code aus der E-Mail"
              aria-label="Freigabe-Code aus der E-Mail"
              value={approveCode}
              onChange={(e) => setApproveCode(e.target.value)}
            />
            <Button onClick={confirmApprove}>Freigabe bestätigen</Button>
          </div>
        )}
        {mailto && (
          <p className="text-sm">
            Senden Sie Ihren Änderungswunsch an{" "}
            <a
              className="underline"
              href={`mailto:${mailto.to}?subject=${encodeURIComponent(mailto.subject)}&body=${encodeURIComponent(mailto.body)}`}
            >
              {mailto.to}
            </a>
          </p>
        )}
      </div>
    ) : null;
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 md:px-6 py-8">
      <PageHeader
        titel={`Auftrag ${ref}`}
        beschreibung={kunde || undefined}
        brotkrumen={[{ bezeichnung: "Aufträge", href: "/requests" }, { bezeichnung: ref }]}
        aktionen={
          <Badge variant={toneVariant(STATUS_TONE[status] ?? "gray")}>{CUSTOMER_STATUS[status] ?? status}</Badge>
        }
      />
      <StatusFolds
        detail={detail}
        audience="customer"
        filesBase={`/api/requests/${detail.request.id}/files`}
        freigabeExtra={freigabe}
      />
      <Dialog open={ergebnisOffen} onOpenChange={setErgebnisOffen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auftrag eingegangen</DialogTitle>
            <DialogDescription>
              Auftrag {ref} · Status: {CUSTOMER_STATUS[status] ?? status} · Produkt:{" "}
              {productLabel(detail.request.productHint)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {detail.note ? (
              <div className="space-y-2">
                <p className="font-medium">Erste Prüfung (automatischer Hinweis)</p>
                <ul className="list-disc space-y-1 pl-5">
                  {detail.note.bullets.map((b, i) => (
                    <li key={i}>{b.text}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {ergebnisAbgelaufen
                  ? "Die Analyse dauert länger als erwartet — alle Ergebnisse stehen auf dieser Seite, sobald sie fertig sind."
                  : "Ihre Dateien werden gerade analysiert …"}
              </p>
            )}
            <div className="space-y-1">
              <p className="font-medium">Dateien ({detail.files.length})</p>
              {detail.files.map((f) => (
                <p key={f.id} className="flex items-center gap-2 text-muted-foreground">
                  <span className="truncate">{f.fileName}</span>
                  {f.report ? (
                    <Badge variant={toneVariant(severityTone(f.report.printability))}>
                      {severityLabel(f.report.printability)}
                    </Badge>
                  ) : (
                    <span className="text-xs">wird geprüft …</span>
                  )}
                </p>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setErgebnisOffen(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
