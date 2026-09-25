"use client";

import { useMemo, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Download01Icon, LockIcon } from "@hugeicons/core-free-icons";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { Badge, toneVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RAIL_LABELS, RAIL_STEPS } from "@/components/brand/LifecycleRail";
import { FilePreview } from "@/components/finder/FilePreview";
import { Quicklook } from "@/components/finder/Quicklook";
import { formatBytes } from "@/components/finder/finder-state";
import { indexOfItem, isPreviewable, type PreviewTone } from "@/components/finder/preview";
import { defaultOpen, foldHint, foldStates, foldSummary, type FoldStep } from "@/components/requests/fold-state";
import {
  buildPreviewItems,
  bundlesNewestFirst,
  detailRef,
  formatIsoDate,
  isWithheld,
  previewIds,
  type Audience,
  type DetailBundle,
  type DetailFile,
  type RequestDetail,
} from "@/components/requests/request-detail";
import { productLabel, severityLabel, severityTone } from "@/lib/ui-text";
import "./status-folds.css";

interface LineProps {
  previewId: string;
  name: string;
  mimeType: string;
  src: string;
  sizeBytes?: number;
  badges?: { label: string; tone: PreviewTone }[];
  withheld?: boolean;
  onFullscreen: (previewId: string) => void;
  children?: ReactNode;
}

/** Eine Datei mit Download, Inline-Vorschau (Vollbild-Button darin) und optionalen Zusatzzeilen. */
function FileLine({ previewId, name, mimeType, src, sizeBytes, badges, withheld, onFullscreen, children }: LineProps) {
  const [showInline, setShowInline] = useState(false);
  const canPreview = !withheld && isPreviewable(mimeType, name);
  return (
    <div className="fold-line">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {withheld ? (
          <span className="min-w-0 break-all font-medium">{name}</span>
        ) : (
          <a className="min-w-0 break-all font-medium underline underline-offset-4" href={src} download>
            {name}
          </a>
        )}
        {sizeBytes !== undefined && (
          <span className="text-xs text-muted-foreground tabular-nums">{formatBytes(sizeBytes)}</span>
        )}
        {badges?.map((b) => (
          <Badge key={b.label} variant={toneVariant(b.tone)}>
            {b.label}
          </Badge>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          {canPreview && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              aria-expanded={showInline}
              onClick={() => setShowInline((v) => !v)}
            >
              {showInline ? "Vorschau ausblenden" : "Vorschau"}
            </Button>
          )}
          {!withheld && (
            <Button nativeButton={false} render={<a href={src} download aria-label={`${name} herunterladen`} />} variant="outline" size="xs">
              <HugeiconsIcon icon={Download01Icon} aria-hidden="true" />
              Herunterladen
            </Button>
          )}
        </span>
      </div>
      {withheld && (
        <p className="text-sm text-muted-foreground">
          Von der Sicherheitsprüfung zurückgehalten — die Datei steht nicht zum Abruf bereit.
        </p>
      )}
      {showInline && canPreview && (
        <FilePreview
          fileName={name}
          mimeType={mimeType}
          src={src}
          withheld={false}
          withholdReasons={[]}
          onFullscreen={() => onFullscreen(previewId)}
        />
      )}
      {children}
    </div>
  );
}

function fileBadges(file: DetailFile, audience: Audience): { label: string; tone: PreviewTone }[] {
  const out: { label: string; tone: PreviewTone }[] = [];
  if (file.report) out.push({ label: severityLabel(file.report.printability), tone: severityTone(file.report.printability) });
  if (file.report && (audience === "staff" || isWithheld(file))) {
    out.push({ label: severityLabel(file.report.security.verdict), tone: severityTone(file.report.security.verdict) });
  }
  return out;
}

function Insights({ file }: { file: DetailFile }) {
  const report = file.report;
  if (!report) return <p className="text-xs text-muted-foreground">Noch keine Analyse vorhanden.</p>;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Insights — Befunde ({report.findings.length})
      </summary>
      <div className="mt-1 space-y-1">
        {report.findings.map((x, i) => (
          <p key={i} className="text-muted-foreground">
            {x.summary}
          </p>
        ))}
        {report.uniformity
          ?.filter((u) => !u.consistent)
          .map((u) => (
            <p key={u.aspect} className="text-muted-foreground">
              {u.aspect}: abweichend {u.deviatingPages.map((p) => `S.${p.page} ${p.value}`).join(", ")}
            </p>
          ))}
        {report.security.reasons.length > 0 && (
          <p className="text-muted-foreground">Sicherheit: {report.security.reasons.join("; ")}</p>
        )}
      </div>
    </details>
  );
}

function BundleView({
  bundle,
  latest,
  onFullscreen,
}: {
  bundle: DetailBundle;
  latest: boolean;
  onFullscreen: (previewId: string) => void;
}) {
  return (
    <div className="fold-version">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Version {bundle.version}</span>
        <Badge variant={latest ? "default" : "secondary"}>{latest ? "Aktuell" : "Ersetzt"}</Badge>
        <span className="text-xs text-muted-foreground">{new Date(bundle.createdAt).toLocaleDateString("de-DE")}</span>
      </div>
      {bundle.reason && (
        <p className="text-sm">
          <span className="text-muted-foreground">Grund für den Ersatz: </span>
          {bundle.reason}
        </p>
      )}
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Auftragsbestätigung</p>
        <FileLine
          previewId={previewIds.confirmation(bundle.version)}
          name={bundle.confirmation.name}
          mimeType={bundle.confirmation.mimeType}
          src={bundle.confirmation.url}
          onFullscreen={onFullscreen}
        />
      </div>
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Druckdateien ({bundle.printFiles.length})
        </p>
        {bundle.printFiles.map((p, i) => (
          <FileLine
            key={p.url}
            previewId={previewIds.print(bundle.version, i)}
            name={p.name}
            mimeType={p.mimeType}
            src={p.url}
            onFullscreen={onFullscreen}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Fünf aufklappbare Status-Karten (Eingang bis Versand) für Kunden- und Staff-Auftragsseite.
 * Aktueller Status offen, erreichte Stufen zusammengefaltet mit Kurzzusammenfassung, künftige gesperrt.
 * Rollenspezifische Steuerung (Freigabe, Anhängen, Versenden) kommt über die Extra-Slots.
 */
export function StatusFolds({
  detail,
  audience,
  filesBase,
  freigabeExtra,
  produktionExtra,
}: {
  detail: RequestDetail;
  audience: Audience;
  /** Basis-URL der Kundendateien (Kunde und Staff nutzen unterschiedliche Routen), z. B. `/api/requests/<id>/files`. */
  filesBase: string;
  freigabeExtra?: ReactNode;
  produktionExtra?: ReactNode;
}) {
  const status = detail.request.status;
  const [open, setOpen] = useState<FoldStep[]>(() => defaultOpen(status, audience));
  const [seenStatus, setSeenStatus] = useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    setOpen(defaultOpen(status, audience));
  }
  const [quicklook, setQuicklook] = useState({ open: false, index: 0 });

  const fileHref = (fileId: string) => `${filesBase}/${fileId}`;
  const items = useMemo(
    () => buildPreviewItems(detail, audience, (fileId) => `${filesBase}/${fileId}`),
    [detail, audience, filesBase],
  );
  const folds = foldStates(status, audience);
  const bundles = bundlesNewestFirst(detail.bundles);
  const latest = bundles[0];
  const labels = RAIL_LABELS[audience];

  function fullscreen(previewId: string) {
    const index = indexOfItem(items, previewId);
    if (index >= 0) setQuicklook({ open: true, index });
  }

  const customerText = audience === "customer";
  const content: Record<FoldStep, ReactNode> = {
    RECEIVED: (
      <>
        <div className="fold-line">
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Auftragsnummer</dt>
              <dd className="font-medium tabular-nums">{detailRef(detail)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{customerText ? "Produkt" : "Hinweis"}</dt>
              <dd className="font-medium">{productLabel(detail.request.productHint)}</dd>
            </div>
            {detail.note?.suggestedCategory && (
              <div>
                <dt className="text-xs text-muted-foreground">Vorgeschlagene Kategorie</dt>
                <dd className="font-medium">{productLabel(detail.note.suggestedCategory)}</dd>
              </div>
            )}
            {detail.request.referenceText && (
              <div>
                <dt className="text-xs text-muted-foreground">{customerText ? "Ihre Referenz" : "Kundenreferenz"}</dt>
                <dd className="font-medium">{detail.request.referenceText}</dd>
              </div>
            )}
            {detail.request.createdAt && (
              <div>
                <dt className="text-xs text-muted-foreground">Eingegangen am</dt>
                <dd className="font-medium">{new Date(detail.request.createdAt).toLocaleDateString("de-DE")}</dd>
              </div>
            )}
          </dl>
          <p className="whitespace-pre-wrap">{detail.request.freeText}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Dateien ({detail.files.length})
          </p>
          {detail.files.map((f) => (
            <FileLine
              key={f.id}
              previewId={previewIds.file(f.id)}
              name={f.fileName}
              mimeType={f.mimeType}
              src={fileHref(f.id)}
              sizeBytes={f.sizeBytes}
              badges={fileBadges(f, audience)}
              withheld={isWithheld(f)}
              onFullscreen={fullscreen}
            >
              {customerText &&
                f.report?.findings.map((x, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {x.summary}
                  </p>
                ))}
            </FileLine>
          ))}
        </div>
      </>
    ),
    IN_REVIEW: (
      <>
        <div className="fold-line">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Automatischer Hinweis
          </p>
          {detail.note ? (
            <ul className="list-disc space-y-1 pl-5">
              {detail.note.bullets.map((b, i) => (
                <li key={i}>{b.text}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              {customerText
                ? "Die Analyse läuft noch — das Ergebnis erscheint hier, sobald es fertig ist."
                : "Noch kein Hinweis vorhanden — er erscheint hier, sobald Analyse und Agent durchgelaufen sind."}
            </p>
          )}
        </div>
        {!customerText && (
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Befunde je Datei
            </p>
            {detail.files.map((f) => (
              <div key={f.id} className="fold-line">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 break-all font-medium">{f.fileName}</span>
                  {fileBadges(f, audience).map((b) => (
                    <Badge key={b.label} variant={toneVariant(b.tone)}>
                      {b.label}
                    </Badge>
                  ))}
                </div>
                <Insights file={f} />
              </div>
            ))}
          </div>
        )}
      </>
    ),
    WAITING_APPROVAL: (
      <>
        {latest ? (
          <>
            <BundleView bundle={latest} latest onFullscreen={fullscreen} />
            {bundles.length > 1 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Frühere Versionen ({bundles.length - 1})
                </summary>
                <div className="mt-3 grid gap-3">
                  {bundles.slice(1).map((b) => (
                    <BundleView key={b.id} bundle={b} latest={false} onFullscreen={fullscreen} />
                  ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {customerText
              ? "Auftragsbestätigung und Druckdateien erscheinen hier, sobald unsere Vorstufe sie angehängt hat."
              : "Noch keine Auftragsbestätigung angehängt."}
          </p>
        )}
        {freigabeExtra}
      </>
    ),
    IN_PROGRESS: (
      <>
        <p className="text-sm">
          {customerText
            ? `Ihre Freigabe liegt vor${latest ? ` (Version ${latest.version})` : ""}. Der Auftrag läuft in die Produktion — nach dem Versand finden Sie Sendungsnummer oder Liefertermin und Ihre Rechnung unter „Versand“.`
            : `Die Kundenfreigabe liegt vor${latest ? ` (Version ${latest.version})` : ""}.`}
        </p>
        {produktionExtra}
      </>
    ),
    SHIPPED: detail.shipment ? (
      <>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Sendungsnummer</dt>
            <dd className="font-medium">{detail.shipment.trackingNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Liefertermin (Eigenzustellung)</dt>
            <dd className="font-medium">
              {detail.shipment.specialDeliveryDate ? formatIsoDate(detail.shipment.specialDeliveryDate) : "—"}
            </dd>
          </div>
        </dl>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Rechnung</p>
          <FileLine
            previewId={previewIds.invoice}
            name="Rechnung"
            mimeType="application/pdf"
            src={detail.shipment.invoiceUrl}
            onFullscreen={fullscreen}
          />
        </div>
      </>
    ) : (
      <p className="text-sm text-muted-foreground">Keine Versanddaten hinterlegt.</p>
    ),
  };

  return (
    <>
      <Accordion multiple value={open} onValueChange={(v) => setOpen(v as FoldStep[])} aria-label="Auftragsstatus">
        {folds.map(({ step, index, state }) => {
          const sub = state === "done" ? foldSummary(step, detail) : foldHint(step, state, audience);
          return (
            <AccordionItem key={step} value={step} disabled={state === "locked"} className="fold" data-fold={state}>
              <AccordionTrigger className="fold-trigger">
                <span className="fold-head flex min-w-0 flex-1 items-center gap-3">
                  <span className="rail-node fold-node" aria-hidden="true">
                    {state === "done" ? (
                      <svg viewBox="0 0 16 16" width="14" height="14">
                        <path
                          d="M3.5 8.5l3 3 6-7"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="fold-title">
                      {labels[RAIL_STEPS.indexOf(step)]}
                      {state === "locked" && <span className="sr-only"> (noch gesperrt)</span>}
                    </span>
                    {sub && <span className="fold-sub">{sub}</span>}
                  </span>
                </span>
                <HugeiconsIcon
                  icon={state === "locked" ? LockIcon : ArrowDown01Icon}
                  size={18}
                  className="fold-chevron"
                  aria-hidden="true"
                />
              </AccordionTrigger>
              <AccordionPanel>
                <div className="fold-body">{state === "locked" ? null : content[step]}</div>
              </AccordionPanel>
            </AccordionItem>
          );
        })}
      </Accordion>
      <Quicklook
        open={quicklook.open}
        onOpenChange={(o) => setQuicklook((q) => ({ ...q, open: o }))}
        items={items}
        index={quicklook.index}
        onIndex={(index) => setQuicklook((q) => ({ ...q, index }))}
      />
    </>
  );
}
