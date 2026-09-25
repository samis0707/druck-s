"use client";

/* Fetch-on-mount data loading: setState runs after await (no cascading render). */
/* eslint-disable react-hooks/set-state-in-effect */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge, toneVariant } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { STAFF_STATUS, STATUS_TONE } from "@/lib/ui-text";
import { StatusFolds } from "@/components/requests/StatusFolds";
import { ConfirmAction } from "@/components/requests/ConfirmAction";
import { customerLine, detailRef, type RequestDetail } from "@/components/requests/request-detail";

/** Staff-Detail: technisches Wording, Auftragsbestätigung anhängen, versenden. */
export default function StaffRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [confirmation, setConfirmation] = useState<File | null>(null);
  const [prints, setPrints] = useState<File[]>([]);
  const [reason, setReason] = useState("");
  const [invoice, setInvoice] = useState<File | null>(null);
  const [tracking, setTracking] = useState("");
  const [deliverDate, setDeliverDate] = useState("");
  /** Erhöht sich nach Erfolg, damit die (unkontrollierten) Datei-Felder leer erscheinen. */
  const [formKey, setFormKey] = useState(0);

  async function load() {
    const res = await fetch(`/api/requests/${id}`);
    if (!res.ok) {
      router.push("/staff/login");
      return;
    }
    setDetail((await res.json()) as RequestDetail);
  }

  useEffect(() => {
    if (id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function checkAttach(): boolean {
    if (!confirmation) {
      toast.add({ description: "Bitte die Auftragsbestätigung anhängen.", type: "error" });
      return false;
    }
    if (prints.length === 0) {
      toast.add({ description: "Bitte mindestens eine Druckdatei anhängen.", type: "error" });
      return false;
    }
    return true;
  }

  async function attach() {
    if (!confirmation) return;
    const form = new FormData();
    form.set("confirmation", confirmation);
    prints.forEach((f) => form.append("printFile", f));
    if (reason.trim()) form.set("reason", reason.trim());
    const res = await fetch(`/api/staff/requests/${id}/confirmation`, { method: "POST", body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.add({ description: data.error ?? "Anhängen fehlgeschlagen", type: "error" });
      return;
    }
    setConfirmation(null);
    setPrints([]);
    setReason("");
    setFormKey((k) => k + 1);
    toast.add({ description: "Auftragsbestätigung versendet — wartet auf Kundenfreigabe.", type: "success" });
    await load();
  }

  function checkShip(): boolean {
    if (!invoice && !detail?.invoicePending) {
      toast.add({ description: "Bitte die Rechnung anhängen.", type: "error" });
      return false;
    }
    return true;
  }

  async function ship() {
    const form = new FormData();
    if (invoice) form.set("invoice", invoice);
    if (tracking.trim()) form.set("trackingNumber", tracking.trim());
    if (deliverDate.trim()) form.set("specialDeliveryDate", deliverDate.trim());
    const res = await fetch(`/api/staff/requests/${id}/shipment`, { method: "POST", body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.add({ description: data.error ?? "Versand fehlgeschlagen", type: "error" });
      return;
    }
    const { shipped, mailed } = (await res.json()) as { shipped: boolean; mailed?: boolean };
    setInvoice(null);
    setFormKey((k) => k + 1);
    if (!shipped) {
      toast.add({
        description: "Rechnung gespeichert — der Versand folgt mit Sendungsnummer oder Liefertermin.",
        type: "success",
      });
    } else if (mailed) {
      toast.add({
        description: `Versand erfasst — Versandbestätigung an ${detail?.customer.email ?? "den Kunden"} gesendet.`,
        type: "success",
      });
    } else {
      toast.add({
        description: "Versand erfasst, aber die Versandbestätigung konnte nicht gesendet werden.",
        type: "warning",
      });
    }
    await load();
  }

  if (!detail) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </main>
    );
  }
  const st = detail.request.status;
  const ref = detailRef(detail);
  const kunde = customerLine(detail.customer, "staff");
  const shipDescription =
    tracking.trim() || deliverDate.trim()
      ? `Der Auftrag wird als versendet markiert und der Kunde per E-Mail informiert${
          detail.customer.email ? ` (${detail.customer.email})` : ""
        }. Die Rechnung liegt der E-Mail bei. Dieser Schritt schließt den Auftrag ab.`
      : "Ohne Sendungsnummer oder Liefertermin wird nur die Rechnung gespeichert: Der Auftrag wird noch nicht versendet und der Kunde erhält keine E-Mail.";
  const anhaengen =
    st === "IN_REVIEW" || st === "WAITING_APPROVAL" ? (
      <div className="space-y-3 border-t border-border pt-4">
        <p className="font-medium">
          Auftragsbestätigung anhängen {detail.bundles.length > 0 && `(aktuell v${detail.bundles.length})`}
        </p>
        <div className="space-y-1">
          <Label htmlFor="attach-confirmation">Auftragsbestätigung (PDF)</Label>
          <Input
            key={`c${formKey}`}
            id="attach-confirmation"
            type="file"
            accept="application/pdf"
            onChange={(e) => setConfirmation(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="attach-prints">Druckdateien (mehrere möglich)</Label>
          <Input
            key={`p${formKey}`}
            id="attach-prints"
            type="file"
            multiple
            onChange={(e) => setPrints(Array.from(e.target.files ?? []))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="attach-reason">Grund (bei Ersatz — geht an den Kunden)</Label>
          <Input id="attach-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <ConfirmAction
          triggerLabel="Anhängen & zur Freigabe senden"
          title="Bestätigung zur Freigabe senden?"
          description="Die Auftragsbestätigung und die Druckdateien gehen an den Kunden. Der Auftrag wartet danach auf Freigabe."
          confirmLabel="Senden"
          beforeOpen={checkAttach}
          onConfirm={attach}
        />
      </div>
    ) : null;
  const versenden =
    st === "IN_PROGRESS" ? (
      <div className="space-y-3 border-t border-border pt-4">
        <p className="font-medium">Versenden</p>
        <div className="space-y-1">
          <Label htmlFor="ship-invoice">
            {detail?.invoicePending ? "Rechnung (gespeichert — nur zum Ersetzen wählen)" : "Rechnung"}
          </Label>
          <Input
            key={`i${formKey}`}
            id="ship-invoice"
            type="file"
            accept="application/pdf"
            onChange={(e) => setInvoice(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ship-tracking">Sendungsnummer (Versanddienstleister)</Label>
          <Input id="ship-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ship-date">Lieferdatum Eigenzustellung (JJJJ-MM-TT)</Label>
          <Input id="ship-date" value={deliverDate} onChange={(e) => setDeliverDate(e.target.value)} />
        </div>
        <ConfirmAction
          triggerLabel="Versand erfassen"
          title="Versand erfassen?"
          description={shipDescription}
          confirmLabel="Erfassen"
          beforeOpen={checkShip}
          onConfirm={ship}
        />
      </div>
    ) : null;
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 md:px-6 py-8">
      <PageHeader
        titel={`Auftrag ${ref}`}
        beschreibung={kunde || undefined}
        brotkrumen={[{ bezeichnung: "Staff", href: "/staff" }, { bezeichnung: ref }]}
        aktionen={
          <>
            <Badge variant={toneVariant(STATUS_TONE[st] ?? "gray")}>{STAFF_STATUS[st] ?? st}</Badge>
            <Badge variant={toneVariant(detail.request.trust === "VERIFIED" ? "green" : "yellow")}>
              {detail.request.trust === "VERIFIED" ? "Verifiziert" : "Per Link"}
            </Badge>
          </>
        }
      />
      <StatusFolds
        detail={detail}
        audience="staff"
        filesBase={`/api/staff/requests/${detail.request.id}/files`}
        freigabeExtra={anhaengen}
        produktionExtra={versenden}
      />
    </main>
  );
}
