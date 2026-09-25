"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge, toneVariant } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { columnHelper, DataTable } from "@/components/data-table";
import { requestRef } from "@/lib/requestNumber";
import { CUSTOMER_STATUS, STATUS_TONE, productLabel } from "@/lib/ui-text";

interface Konto {
  email: string;
  displayName: string | null;
  firm: string | null;
  status: string;
}

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
  helper.accessor("fileCount", { header: "Dateien" }),
  helper.accessor("status", {
    header: "Status",
    cell: (ctx) => {
      const status = ctx.getValue();
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

/** Konto: persönliche Infos plus eigene Aufträge; anonym → /login. */
export default function KontoPage() {
  const router = useRouter();
  const [konto, setKonto] = useState<Konto | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch("/api/account").then(async (res) => {
      if (!res.ok) {
        router.replace("/login");
        return;
      }
      setKonto(((await res.json()) as { identity: Konto }).identity);
    });
    fetch("/api/requests").then(async (res) => {
      if (res.ok) setRows(((await res.json()) as { requests: Row[] }).requests);
      else setRows([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!konto) {
    return (
      <main className="mx-auto max-w-5xl space-y-4 px-4 md:px-6 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 md:px-6 py-8">
      <PageHeader
        titel="Konto"
        beschreibung="Ihre Daten und Ihre Aufträge."
        brotkrumen={[{ bezeichnung: "Start", href: "/" }, { bezeichnung: "Konto" }]}
        aktionen={
          <Button render={<Link href="/upload" />}>Upload starten</Button>
        }
      />
      <Card>
        <CardContent className="space-y-2">
          <CardTitle>Ihre Daten</CardTitle>
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">E-Mail</dt>
              <dd className="font-medium">{konto.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{konto.displayName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Firma</dt>
              <dd className="font-medium">{konto.firm ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">{konto.status === "customer" ? "Kunde" : konto.status}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Ihre Aufträge</h2>
        {rows === null ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            searchPlaceholder="Suchen nach Auftragsnummer, Produkt, Status …"
            emptyTitle="Keine Aufträge"
            emptyHint="Starten Sie einen Upload, um Ihren ersten Auftrag anzulegen."
          />
        )}
      </div>
    </main>
  );
}
