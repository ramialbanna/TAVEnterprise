"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import type { IngestRunSummary } from "@/lib/app-api/schemas";
import { formatNumber, formatDateTime } from "@/lib/format";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

/**
 * Run-history table over the documented `IngestRunSummary` envelope ONLY — no
 * fabricated columns. Null counts render the em-dash sentinel via `formatNumber`,
 * never `0`. Clicking (or Enter on) a row calls `onSelect` with the run.
 */
export function IngestTable({
  rows,
  loading = false,
  onSelect,
  emptyTitle = "No ingest runs",
  emptyHint,
}: {
  rows: IngestRunSummary[];
  loading?: boolean;
  onSelect: (run: IngestRunSummary) => void;
  emptyTitle?: string;
  emptyHint?: React.ReactNode;
}) {
  const columns = useMemo<ColumnDef<IngestRunSummary, unknown>[]>(
    () => [
      { accessorKey: "source", header: "Source" },
      { accessorKey: "region", header: "Region" },
      { accessorKey: "run_id", header: "Run ID" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="neutral">{row.original.status}</Badge>,
      },
      {
        accessorKey: "item_count",
        header: "Items",
        cell: ({ row }) => formatNumber(row.original.item_count),
      },
      {
        accessorKey: "processed",
        header: "Processed listings",
        cell: ({ row }) => formatNumber(row.original.processed),
      },
      {
        accessorKey: "rejected",
        header: "Rejected listings",
        cell: ({ row }) => formatNumber(row.original.rejected),
      },
      {
        accessorKey: "created_leads",
        header: "Created leads",
        cell: ({ row }) => formatNumber(row.original.created_leads),
      },
      {
        accessorKey: "scraped_at",
        header: "Scraped at",
        cell: ({ row }) => formatDateTime(row.original.scraped_at),
      },
      {
        accessorKey: "created_at",
        header: "Created at",
        cell: ({ row }) => formatDateTime(row.original.created_at),
      },
      {
        accessorKey: "error_message",
        header: "Error",
        cell: ({ row }) => row.original.error_message ?? "—",
      },
    ],
    [],
  );

  return (
    <DataTable
      data={rows}
      columns={columns}
      loading={loading}
      emptyTitle={emptyTitle}
      emptyHint={emptyHint}
      pageSize={25}
      density="compact"
      enableColumnFilters={false}
      onRowClick={(row) => onSelect(row)}
    />
  );
}
