"use client";

import { useState } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  legacyCreateColumnHelper,
  useLegacyTable,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy";
import { flexRender } from "@tanstack/react-table";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { Input } from "@/components/ui/input";
import { Table, THead, TRow, TH, TD } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

/** Sortier- und durchsuchbare Tabelle (Kunden-Übersicht und Staff-Triage). */
export function DataTable<T extends object>({
  columns,
  data,
  searchPlaceholder,
  emptyTitle,
  emptyHint,
}: {
  columns: LegacyColumnDef<T>[];
  data: T[];
  searchPlaceholder: string;
  emptyTitle: string;
  emptyHint?: string;
}) {
  const [sorting, setSorting] = useState<{ id: string; desc: boolean }[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const table = useLegacyTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: "includesString",
  });
  const rows = table.getRowModel().rows;
  return (
    <div className="space-y-3">
      <Input
        placeholder={searchPlaceholder}
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
      />
      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            {emptyHint ? <EmptyDescription>{emptyHint}</EmptyDescription> : null}
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <THead>
            {table.getHeaderGroups().map((hg) => (
              <TRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TH
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className={h.column.getCanSort() ? "cursor-pointer select-none" : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc" && <HugeiconsIcon icon={ArrowUp01Icon} className="size-3" />}
                      {h.column.getIsSorted() === "desc" && <HugeiconsIcon icon={ArrowDown01Icon} className="size-3" />}
                    </span>
                  </TH>
                ))}
              </TRow>
            ))}
          </THead>
          <tbody>
            {rows.map((row) => (
              <TRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TD key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TD>
                ))}
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export function columnHelper<T extends object>() {
  return legacyCreateColumnHelper<T>();
}
