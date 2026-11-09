"use client";

/* Fetch-on-mount data loading: setState runs after await (no cascading render). */
/* eslint-disable react-hooks/set-state-in-effect */

import { startTransition, useCallback, useEffect, useMemo, useState, ViewTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, toneVariant } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Quicklook } from "@/components/finder/Quicklook";
import { isPreviewable } from "@/components/finder/preview";
import { customerLine, detailRef, type RequestDetail } from "@/components/requests/request-detail";
import { requestRef } from "@/lib/requestNumber";
import { EmptyState } from "@/components/layout/EmptyState";
import { AssetRow } from "@/components/finder/AssetRow";
import { FilePreview } from "@/components/finder/FilePreview";
import {
  LEER_FILTER,
  findeAuftraege,
  sortiereAssets,
  toPreviewItem,
  type AssetSort,
  type FinderFilters,
  type FinderRequest,
  type FinderSort,
} from "@/components/finder/finder-state";
import { ROLLUP_TOOLTIP, rollupOf, rollupRail, rollupTone } from "@/components/finder/rollup";
import { STAFF_STATUS, STATUS_TONE, originBadge, productLabel, securityNotes } from "@/lib/ui-text";

const STATUS_OPTIONEN = ["RECEIVED", "IN_REVIEW", "WAITING_APPROVAL", "IN_PROGRESS", "SHIPPED", "WITHDRAWN"] as const;
const SICHT_KEY = "dam-finder-sicht";

type Sicht = "liste" | "assets";

function OriginBadge({ trust, partnerName }: { trust: string; partnerName?: string | null }) {
  const o = originBadge(trust, partnerName);
  return <Badge variant={toneVariant(o.tone)}>{o.label}</Badge>;
}

function RollupBadge({ request }: { request: FinderRequest }) {
  const rollup = rollupOf(request.files);
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant={toneVariant(rollupTone(rollup.level))} />}>
        {rollup.label}
      </TooltipTrigger>
      <TooltipContent>{ROLLUP_TOOLTIP}</TooltipContent>
    </Tooltip>
  );
}

function FilterLeiste({
  filter,
  setFilter,
}: {
  filter: FinderFilters;
  setFilter: (f: FinderFilters) => void;
}) {
  function toggleStatus(status: string) {
    setFilter({
      ...filter,
      statuses: filter.statuses.includes(status)
        ? filter.statuses.filter((s) => s !== status)
        : [...filter.statuses, status],
    });
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          className="min-w-[240px] flex-1"
          placeholder="Suchen nach Auftragsnummer, Produkt, Text, E-Mail, Status …"
          aria-label="Aufträge durchsuchen"
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
        />
        <label className="sr-only" htmlFor="finder-sortierung">
          Sortierung
        </label>
        <select
          id="finder-sortierung"
          className="h-8 w-auto rounded-2xl border border-transparent bg-input/50 px-2.5 text-sm outline-none focus-visible:border-ring"
          value={filter.sort}
          onChange={(e) => setFilter({ ...filter, sort: e.target.value as FinderSort })}
        >
          <option value="newest">Neueste zuerst</option>
          <option value="rollup">Dringendste zuerst</option>
          <option value="oldest">Älteste zuerst</option>
          <option value="files">Meiste Dateien zuerst</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setFilter({
              ...filter,
              query: "",
              statuses: [],
              trusts: [],
              attentionOnly: false,
              sort: "newest",
            })
          }
        >
          Zurücksetzen
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Status:</span>
        {STATUS_OPTIONEN.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={filter.statuses.includes(status)}
            onClick={() => toggleStatus(status)}
            className={`inline-flex items-center rounded-2xl border px-3 py-1.5 text-sm transition-colors ${
              filter.statuses.includes(status)
                ? "border-primary bg-primary/10 font-semibold text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-ring"
            }`}
          >
            {STAFF_STATUS[status] ?? status}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Herkunft:</span>
        {(["VERIFIED", "VOUCHED"] as const).map((trust) => (
          <button
            key={trust}
            type="button"
            aria-pressed={filter.trusts.includes(trust)}
            onClick={() =>
              setFilter({
                ...filter,
                trusts: filter.trusts.includes(trust)
                  ? filter.trusts.filter((t) => t !== trust)
                  : [...filter.trusts, trust],
              })
            }
            className={`inline-flex items-center rounded-2xl border px-3 py-1.5 text-sm transition-colors ${
              filter.trusts.includes(trust)
                ? "border-primary bg-primary/10 font-semibold text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-ring"
            }`}
          >
            {trust === "VERIFIED" ? "Verifiziert" : "Per Link"}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={filter.attentionOnly}
          onClick={() => setFilter({ ...filter, attentionOnly: !filter.attentionOnly })}
          className={`inline-flex items-center rounded-2xl border px-3 py-1.5 text-sm transition-colors ${
            filter.attentionOnly
              ? "border-destructive bg-destructive/10 font-semibold text-destructive"
              : "border-border bg-card text-muted-foreground hover:border-ring"
          }`}
        >
          Nur: braucht Blick
        </button>
      </div>
    </div>
  );
}

/** Inspektor: Metadaten, Assets mit Befunden, frozen Assistant-Note, Aktionen. */
function Inspektor({ requestId }: { requestId: string }) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [assetSort, setAssetSort] = useState<AssetSort>("severity");
  const [vollbild, setVollbild] = useState({ open: false, index: 0 });

  useEffect(() => {
    let aktiv = true;
    setDetail(null);
    fetch(`/api/requests/${requestId}`).then(async (res) => {
      if (!aktiv || !res.ok) return;
      setDetail((await res.json()) as RequestDetail);
    });
    return () => {
      aktiv = false;
    };
  }, [requestId]);

  if (!detail) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Auftrag wird geladen">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  const dateien = sortiereAssets(
    detail.files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      printability: f.report?.printability ?? null,
      securityVerdict: f.report?.security.verdict ?? null,
    })),
    assetSort,
  );
  const berichtJeDatei = new Map(detail.files.map((f) => [f.id, f.report]));
  const ref = detailRef(detail);
  const kunde = customerLine(detail.customer, "staff");
  const vorschauItems = dateien.map((f) => toPreviewItem(detail.request.id, f));
  return (
    <div className="space-y-4">
      <Card className={detail.files.length > 1 ? "sheet-stack" : undefined}>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="tabular-nums">Auftrag {ref}</CardTitle>
            <Badge variant={toneVariant(STATUS_TONE[detail.request.status] ?? "gray")}>
              {STAFF_STATUS[detail.request.status] ?? detail.request.status}
            </Badge>
            <OriginBadge trust={detail.request.trust} partnerName={detail.partner?.name} />
          </div>
          {kunde && <p className="text-sm font-medium">{kunde}</p>}
          <p className="text-sm text-muted-foreground">Hinweis: {productLabel(detail.request.productHint)}</p>
          {detail.note?.suggestedCategory && (
            <p className="text-sm text-muted-foreground">
              Vorgeschlagene Kategorie: {productLabel(detail.note.suggestedCategory)}
            </p>
          )}
          <p className="whitespace-pre-wrap text-sm">{detail.request.freeText}</p>
          <div>
            <Button render={<Link href={`/staff/requests/${detail.request.id}`} />}>Auftrag ansehen</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Assets ({detail.files.length})</CardTitle>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Sortierung
              <select
                aria-label="Assets sortieren"
                className="h-8 rounded-2xl border border-transparent bg-input/50 px-2 text-xs outline-none focus-visible:border-ring"
                value={assetSort}
                onChange={(e) => setAssetSort(e.target.value as AssetSort)}
              >
                <option value="severity">Auffälligste zuerst</option>
                <option value="name">Name</option>
                <option value="size">Größe</option>
              </select>
            </label>
          </div>
          {dateien.map((f, dateiIndex) => {
            const report = berichtJeDatei.get(f.id);
            const zurueckgehalten = report?.security.verdict === "INFECTED";
            return (
              <div key={f.id} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
                <AssetRow
                  file={f}
                  detailHref={`/staff/requests/${detail.request.id}`}
                  withheld={zurueckgehalten}
                  withholdReasons={zurueckgehalten ? (report?.security.reasons ?? []) : []}
                />
                {!zurueckgehalten && isPreviewable(f.mimeType, f.fileName) && (
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Vorschau
                    </summary>
                    <div className="mt-2">
                      <FilePreview
                        fileName={f.fileName}
                        mimeType={f.mimeType}
                        src={`/api/staff/requests/${detail.request.id}/files/${f.id}`}
                        withheld={false}
                        withholdReasons={[]}
                        onFullscreen={() => setVollbild({ open: true, index: dateiIndex })}
                      />
                    </div>
                  </details>
                )}
                {report ? (
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Befunde ({report.findings.length})
                    </summary>
                    <div className="mt-1 space-y-1 pl-1">
                      {report.findings.map((x, i) => (
                        <p key={i} className="text-muted-foreground">
                          {x.summary}
                        </p>
                      ))}
                      {report.uniformity
                        ?.filter((u) => !u.consistent)
                        .map((u) => (
                          <p key={u.aspect} className="text-muted-foreground">
                            {u.aspect}: abweichend{" "}
                            {u.deviatingPages.map((p) => `S.${p.page} ${p.value}`).join(", ")}
                          </p>
                        ))}
                      {securityNotes(report.security).length > 0 && (
                        <p className="text-muted-foreground">Sicherheit: {securityNotes(report.security).join("; ")}</p>
                      )}
                    </div>
                  </details>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Noch keine Analyse vorhanden.</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2">
          <CardTitle>Automatischer Hinweis</CardTitle>
          {detail.note ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {detail.note.bullets.map((b, i) => (
                <li key={i}>{b.text}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Kein Hinweis vorhanden — die Triage läuft über Assets, Rollup und Aktionen weiter.
            </p>
          )}
        </CardContent>
      </Card>
      <Quicklook
        open={vollbild.open}
        onOpenChange={(o) => setVollbild((v) => ({ ...v, open: o }))}
        items={vorschauItems}
        index={vollbild.index}
        onIndex={(index) => setVollbild((v) => ({ ...v, index }))}
      />
    </div>
  );
}

/** Warteschlange: volle Breite ohne Auswahl, schmaler mit Inspektor. */
function Warteschlange({
  auftraege,
  ausgewaehlt,
  onWaehlen,
}: {
  auftraege: FinderRequest[];
  ausgewaehlt: string | null;
  onWaehlen: (id: string) => void;
}) {
  return (
    <ViewTransition name="finder-queue" share="morph" default="none">
      <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              <th className="px-3.5 py-3">Auftragsnr.</th>
              <th className="px-3.5 py-3">Produkt</th>
              <th className="px-3.5 py-3">Kunde</th>
              <th className="px-3.5 py-3 text-right">Dateien</th>
              <th className="px-3.5 py-3">Analyse</th>
              <th className="px-3.5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {auftraege.map((r) => (
              <tr
                key={r.id}
                data-row={r.id}
                onClick={() => onWaehlen(r.id)}
                onKeyDown={(e) => {
                  // Leertaste gehört dem Quicklook.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onWaehlen(r.id);
                  }
                }}
                tabIndex={0}
                aria-selected={ausgewaehlt === r.id}
                className={`cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/50 ${
                  ausgewaehlt === r.id ? "bg-muted/70" : ""
                }`}
              >
                <td
                  className="rail-edge-cell px-3.5 py-3"
                  style={{ "--rail": rollupRail(rollupOf(r.files).level) } as CSSProperties}
                >
                  <Link
                    className="underline"
                    href={`/staff/requests/${r.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {requestRef(r)}
                  </Link>
                </td>
                <td className="px-3.5 py-3">{productLabel(r.productHint)}</td>
                <td className="max-w-[220px] px-3.5 py-3">
                  <div className="truncate">{r.email}</div>
                  {r.partnerName && (
                    <div className="truncate text-xs text-muted-foreground">Über {r.partnerName}</div>
                  )}
                </td>
                <td className="px-3.5 py-3 text-right tabular-nums">{String(r.fileCount)}</td>
                <td className="px-3.5 py-3">
                  <RollupBadge request={r} />
                </td>
                <td className="px-3.5 py-3">
                  <Badge variant={toneVariant(STATUS_TONE[r.status] ?? "gray")}>
                    {STAFF_STATUS[r.status] ?? r.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
    </ViewTransition>
  );
}

/** Staff-Finder: Warteschlange + Inspektor (B) oder Asset-Raster (C) hinter einer Umschaltung. */
export default function StaffPage() {
  const router = useRouter();
  const [rows, setRows] = useState<FinderRequest[] | null>(null);
  const [filter, setFilter] = useState<FinderFilters>(LEER_FILTER);
  const [sicht, setSicht] = useState<Sicht>("liste");
  const [ausgewaehlt, setAusgewaehlt] = useState<string | null>(null);
  const [quicklook, setQuicklook] = useState(false);
  const [qlIndex, setQlIndex] = useState(0);

  /** Auswahl und Ansichtswechsel laufen als Transition, damit <ViewTransition> sie animiert. */
  const waehle = useCallback((id: string | null) => startTransition(() => setAusgewaehlt(id)), []);

  useEffect(() => {
    try {
      const gespeichert = sessionStorage.getItem(SICHT_KEY);
      if (gespeichert === "assets" || gespeichert === "liste") setSicht(gespeichert);
    } catch {
      /* sessionStorage nicht verfügbar — Standardansicht bleibt. */
    }
  }, []);

  function setzeSicht(neu: Sicht) {
    startTransition(() => setSicht(neu));
    try {
      sessionStorage.setItem(SICHT_KEY, neu);
    } catch {
      /* ignorieren */
    }
  }

  useEffect(() => {
    fetch("/api/staff/requests").then(async (res) => {
      if (res.status === 401 || res.status === 403) {
        router.push("/staff/login");
        return;
      }
      if (res.ok) setRows(((await res.json()) as { requests: FinderRequest[] }).requests);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gefiltert = useMemo(() => (rows === null ? [] : findeAuftraege(rows, filter)), [rows, filter]);

  useEffect(() => {
    if (ausgewaehlt !== null && !gefiltert.some((r) => r.id === ausgewaehlt)) setAusgewaehlt(null);
  }, [gefiltert, ausgewaehlt]);

  const qlDateien = useMemo(
    () => (gefiltert.find((r) => r.id === ausgewaehlt)?.files ?? []).map((f) => toPreviewItem(ausgewaehlt ?? "", f)),
    [gefiltert, ausgewaehlt],
  );

  // Finder-Tastatur: j/k wählen, Leertaste = Quicklook (←/→ blättern), Esc schließt den Inspektor.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (quicklook) {
        // ←/→ blättert der Quicklook selbst; Leertaste schließt ihn wie im Finder.
        if (e.key === " ") {
          e.preventDefault();
          setQuicklook(false);
        }
        return;
      }
      // Offene Dialoge (z. B. Vollbild-Vorschau im Inspektor) behalten ihre Tasten.
      if (document.querySelector('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]')) return;
      if (sicht !== "liste" || gefiltert.length === 0) return;
      const nativ = tag === "BUTTON" || tag === "A" || tag === "SUMMARY";
      const idx = gefiltert.findIndex((r) => r.id === ausgewaehlt);
      if (e.key === "j") {
        e.preventDefault();
        waehle(gefiltert[Math.min(idx + 1, gefiltert.length - 1)].id);
      } else if (e.key === "k" && idx > 0) {
        e.preventDefault();
        waehle(gefiltert[idx - 1].id);
      } else if (e.key === " " && !nativ && ausgewaehlt !== null && qlDateien.length > 0) {
        e.preventDefault();
        setQlIndex(0);
        setQuicklook(true);
      } else if (e.key === "Escape" && ausgewaehlt !== null) {
        waehle(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quicklook, qlDateien, sicht, gefiltert, ausgewaehlt, waehle]);

  useEffect(() => {
    if (ausgewaehlt !== null) document.querySelector(`[data-row="${ausgewaehlt}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ausgewaehlt]);

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 md:px-6 py-8">
      <PageHeader
        titel="Aufträge"
        beschreibung="Triage: filtern, suchen, sortieren — Assets im Blick behalten."
        brotkrumen={[{ bezeichnung: "Start", href: "/" }, { bezeichnung: "Staff" }]}
        aktionen={
          <>
            <div role="group" aria-label="Ansicht" className="flex rounded-2xl border border-border p-0.5">
              <button
                type="button"
                aria-pressed={sicht === "liste"}
                onClick={() => setzeSicht("liste")}
                className={`rounded-xl px-3 py-1.5 text-sm ${sicht === "liste" ? "bg-secondary font-semibold" : "text-muted-foreground"}`}
              >
                Liste + Details
              </button>
              <button
                type="button"
                aria-pressed={sicht === "assets"}
                onClick={() => setzeSicht("assets")}
                className={`rounded-xl px-3 py-1.5 text-sm ${sicht === "assets" ? "bg-secondary font-semibold" : "text-muted-foreground"}`}
              >
                Assets
              </button>
            </div>
            <Button render={<Link href="/staff/customers" />} variant="secondary">
              Kunden & Links
            </Button>
            <Button render={<Link href="/staff/einstellungen" />} variant="secondary">
              Einstellungen
            </Button>
          </>
        }
      />
      <FilterLeiste filter={filter} setFilter={setFilter} />
      {sicht === "liste" && (
        <p className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
          <span className="kbd">j</span>
          <span className="kbd">k</span> Auftrag wählen · <span className="kbd">Leertaste</span> Vorschau ·{" "}
          <span className="kbd">Esc</span> Inspektor schließen
        </p>
      )}
      {rows === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="Aufträge werden geladen">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : gefiltert.length === 0 ? (
        <EmptyState
          illustration="search"
          titel="Keine Aufträge"
          beschreibung="Filter oder Suche anpassen."
        />
      ) : (
        <ViewTransition key={sicht} enter="page-in" exit="page-out" default="none">
        {sicht === "liste" ? (
        ausgewaehlt !== null ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Warteschlange auftraege={gefiltert} ausgewaehlt={ausgewaehlt} onWaehlen={waehle} />
            <div className="min-w-0">
              <ViewTransition key={ausgewaehlt} enter="inspector-in" exit="inspector-out" default="none">
                <Inspektor key={ausgewaehlt} requestId={ausgewaehlt} />
              </ViewTransition>
            </div>
          </div>
        ) : (
          <Warteschlange auftraege={gefiltert} ausgewaehlt={null} onWaehlen={waehle} />
        )
      ) : (
        <div className="space-y-6">
          {gefiltert.map((r) => {
            const rollup = rollupOf(r.files);
            return (
              <section key={r.id} aria-label={`Auftrag ${requestRef(r)}`}>
                <div className="sticky top-[68px] z-10 flex flex-wrap items-center gap-2 border-y border-border bg-background/95 py-2 backdrop-blur">
                  <Link href={`/staff/requests/${r.id}`} className="font-semibold underline-offset-4 hover:underline">
                    Auftrag {requestRef(r)}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {productLabel(r.productHint)} · {r.email} · {new Date(r.createdAt).toLocaleDateString("de-DE")}
                  </span>
                  <RollupBadge request={r} />
                  <Badge variant={toneVariant(STATUS_TONE[r.status] ?? "gray")}>
                    {STAFF_STATUS[r.status] ?? r.status}
                  </Badge>
                  <OriginBadge trust={r.trust} partnerName={r.partnerName} />
                  <span className="ml-auto">
                    <Button render={<Link href={`/staff/requests/${r.id}`} />} variant="outline" size="sm">
                      Ansehen
                    </Button>
                  </span>
                </div>
                <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">
                  {r.files.map((f) => (
                    <Card
                      key={f.id}
                      size="sm"
                      className="sheet-card rail-edge"
                      style={{ "--rail": rollupRail(rollupOf([f]).level) } as CSSProperties}
                    >
                      <CardContent>
                        <AssetRow
                          file={f}
                          detailHref={`/staff/requests/${r.id}`}
                          withheld={f.securityVerdict === "INFECTED"}
                          withholdReasons={f.securityVerdict === "INFECTED" ? ["Sicherheitsprüfung: zurückgehalten"] : []}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">Analyse: {rollup.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                  {r.files.length === 0 && (
                    <p className="text-sm text-muted-foreground">Keine Dateien vorhanden.</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        )}
        </ViewTransition>
      )}
      <Quicklook
        open={quicklook}
        onOpenChange={setQuicklook}
        items={qlDateien}
        index={qlIndex}
        onIndex={setQlIndex}
      />
    </main>
  );
}
