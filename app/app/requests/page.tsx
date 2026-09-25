"use client";

/* Fetch-on-mount data loading: setState runs after await (no cascading render). */

import { useEffect, useState } from "react";
import Link from "next/link";
import { columnHelper } from "@/components/data-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge, toneVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { requestRef } from "@/lib/requestNumber";
import { CUSTOMER_STATUS, STATUS_TONE, productLabel } from "@/lib/ui-text";

interface Row {
  id: string;
  number: string | null;
  productHint: string;
  freeText: string;
  status: string;
  fileCount: string;
  createdAt: string;
}

const helper = columnHelper<Row>();
const columns = helper.columns([
  helper.accessor((row) => requestRef(row), {
    id: "ref",
    header: "Auftragsnummer",
    cell: (ctx) => (
      <Link className="underline tabular-nums" href={`/requests/${ctx.row.original.id}`}>
        {ctx.getValue()}
      </Link>
    ),
  }),
  helper.accessor("productHint", {
    header: "Produkt",
    cell: (ctx) => productLabel(ctx.getValue()),
  }),
  helper.accessor("freeText", {
    header: "Anfrage",
    cell: (ctx) => <span className="block max-w-xs truncate">{ctx.getValue()}</span>,
  }),
  helper.accessor("fileCount", { header: "Dateien" }),
  helper.accessor("status", {
    header: "Status",
    cell: (ctx) => {
      const status = ctx.getValue();
      const row = ctx.row.original;
      void row;
      return (
        <Badge variant={toneVariant(STATUS_TONE[status] ?? "gray")}>{CUSTOMER_STATUS[status] ?? status}</Badge>
      );
    },
  }),
  helper.accessor("createdAt", {
    header: "Erstellt",
    cell: (ctx) => new Date(ctx.getValue()).toLocaleDateString("de-DE"),
  }),
]);

/** Kundenübersicht: eigene Aufträge suchen und sortieren. */
export default function RequestsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch("/api/requests").then(async (res) => {
      if (res.ok) setRows(((await res.json()) as { requests: Row[] }).requests);
      else setRows([]);
    });
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 md:px-6 py-8">
      <PageHeader
        titel="Meine Aufträge"
        beschreibung="Eigene Aufträge suchen und sortieren."
        brotkrumen={[{ bezeichnung: "Start", href: "/" }, { bezeichnung: "Aufträge" }]}
        aktionen={
          <Button render={<Link href="/upload" />}>Upload starten</Button>
        }
      />
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : rows.length === 0 ? (
        <EmptyState
          illustration="tray"
          titel="Keine Aufträge gefunden"
          beschreibung="Laden Sie Druckdaten hoch oder melden Sie sich mit Ihrer E-Mail an."
          aktion={
            <Link className="text-sm underline" href="/upload">
              Zum Upload
            </Link>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Suchen nach Auftragsnummer, Produkt, Text, Status …"
          emptyTitle="Nichts gefunden"
          emptyHint="Suchbegriff anpassen."
        />
      )}
    </main>
  );
}
