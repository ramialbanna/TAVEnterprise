"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import type { SystemStatus } from "@/lib/app-api/schemas";
import { formatDateTime, formatNumber } from "@/lib/format";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/data-state";

type SourceRow = Record<string, unknown>;

function readString(row: SourceRow, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readNumber(row: SourceRow, key: string): number | null {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const COLUMNS: ColumnDef<SourceRow, unknown>[] = [
  {
    id: "source",
    header: "Source",
    accessorFn: (row) => readString(row, "source") ?? "—",
    cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
  },
  {
    id: "last_seen_at",
    header: "Last seen",
    accessorFn: (row) => readString(row, "last_seen_at"),
    cell: ({ getValue }) => {
      const v = getValue<string | null>();
      return v ? formatDateTime(v) : "—";
    },
  },
  {
    id: "normalized_count",
    header: "Normalized",
    accessorFn: (row) => readNumber(row, "normalized_count"),
    cell: ({ getValue }) => formatNumber(getValue<number | null>()),
  },
  {
    id: "raw_count",
    header: "Raw",
    accessorFn: (row) => readNumber(row, "raw_count"),
    cell: ({ getValue }) => formatNumber(getValue<number | null>()),
  },
  {
    id: "filtered_count",
    header: "Filtered",
    accessorFn: (row) => readNumber(row, "filtered_count"),
    cell: ({ getValue }) => formatNumber(getValue<number | null>()),
  },
];

/**
 * Defensive `DataTable` over `status.sources` (rows of `tav.v_source_health`). Reads only
 * the documented-ish columns — `source`, `last_seen_at`, `normalized_count`, `raw_count`,
 * `filtered_count` — via accessor functions, so any unexpected v_source_health column
 * additions cannot leak into the UI. Empty state when `db.ok` is false (`sources` is `[]`).
 */
export function SourceHealthTable({ data }: { data: SystemStatus }) {
  const rows = data.sources;
  const dbOk = data.db.ok;
  const columns = useMemo(() => COLUMNS, []);

  if (!dbOk) {
    return (
      <EmptyState
        title="Source health unavailable"
        hint="The database is unavailable, so v_source_health rows can't be read."
      />
    );
  }

  return (
    <DataTable<SourceRow>
      columns={columns}
      data={rows}
      emptyTitle="No source rows"
      emptyHint="No ingestion sources reported in v_source_health."
      pageSize={10}
      enableColumnFilters={false}
    />
  );
}
