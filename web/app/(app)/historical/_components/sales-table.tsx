"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import type { HistoricalSale } from "@/lib/app-api/schemas";
import { formatDate, formatMoney } from "@/lib/format";
import { DataTable } from "@/components/data-table";
import type { ApiErrorResult } from "@/components/data-state";

import { RowDetailSheet } from "./row-detail-sheet";

/**
 * Historical-sales table over `applyClientFilters`-narrowed rows.
 *
 * Columns mirror the documented `HistoricalSale` envelope ONLY — no fabricated
 * columns (stock #, mileage, front/back gross, days-to-sell, region/store, source
 * channel are all absent until the schema adds them). Every cell renders the empty
 * sentinel `—` via the shared formatters when its field is null/missing — never `0`,
 * never blank, never a coerced value.
 *
 * Clicking (or pressing Enter on) a row opens `RowDetailSheet` for the full record.
 */
export function SalesTable({
  rows,
  loading = false,
  error,
  onRetry,
  emptyTitle = "No matching sales",
  emptyHint,
}: {
  rows: HistoricalSale[];
  loading?: boolean;
  error?: ApiErrorResult;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyHint?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<HistoricalSale | null>(null);

  const columns = useMemo<ColumnDef<HistoricalSale, unknown>[]>(
    () => [
      { accessorKey: "saleDate", header: "Sale date", cell: ({ row }) => formatDate(row.original.saleDate) },
      {
        accessorKey: "vin",
        header: "VIN",
        cell: ({ row }) => row.original.vin ?? "—",
      },
      { accessorKey: "year", header: "Year" },
      { accessorKey: "make", header: "Make" },
      { accessorKey: "model", header: "Model" },
      {
        accessorKey: "trim",
        header: "Trim",
        cell: ({ row }) => row.original.trim ?? "—",
      },
      {
        accessorKey: "acquisitionCost",
        header: "Acquisition cost",
        cell: ({ row }) => formatMoney(row.original.acquisitionCost),
      },
      {
        accessorKey: "salePrice",
        header: "Sale price",
        cell: ({ row }) => formatMoney(row.original.salePrice),
      },
      {
        accessorKey: "transportCost",
        header: "Transport",
        cell: ({ row }) => formatMoney(row.original.transportCost),
      },
      {
        accessorKey: "reconCost",
        header: "Recon",
        cell: ({ row }) => formatMoney(row.original.reconCost),
      },
      {
        accessorKey: "auctionFees",
        header: "Auction fees",
        cell: ({ row }) => formatMoney(row.original.auctionFees),
      },
      {
        accessorKey: "grossProfit",
        header: "Gross profit",
        cell: ({ row }) => formatMoney(row.original.grossProfit),
      },
      {
        accessorKey: "acquisitionDate",
        header: "Acquired",
        cell: ({ row }) => formatDate(row.original.acquisitionDate),
      },
      {
        accessorKey: "buyer",
        header: "Buyer",
        cell: ({ row }) => row.original.buyer ?? "—",
      },
      {
        accessorKey: "sourceFileName",
        header: "Source file",
        cell: ({ row }) => row.original.sourceFileName ?? "—",
      },
      {
        accessorKey: "uploadBatchId",
        header: "Upload batch",
        cell: ({ row }) => row.original.uploadBatchId ?? "—",
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={onRetry}
        emptyTitle={emptyTitle}
        emptyHint={emptyHint}
        pageSize={25}
        density="compact"
        enableColumnFilters={false}
        onRowClick={(row) => setSelected(row)}
      />
      <p className="text-xs text-muted-foreground">
        More columns pending schema work — stock #, mileage, front/back gross, days to
        sell, region/store, and source channel light up when the backend exposes them.
      </p>
      <RowDetailSheet sale={selected} onClose={() => setSelected(null)} />
    </>
  );
}
