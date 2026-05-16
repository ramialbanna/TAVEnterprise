"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import type { SystemStatus } from "@/lib/app-api/schemas";
import { formatDateTime, formatNumber } from "@/lib/format";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/data-state";
import { Badge } from "@/components/ui/badge";

type SourceRow = Record<string, unknown>;
type BadgeVariant = "healthy" | "review" | "error" | "neutral";

function readString(row: SourceRow, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readNumber(row: SourceRow, key: string): number | null {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readRunTimestamp(row: SourceRow): string | null {
  return readString(row, "scraped_at") ?? readString(row, "last_seen_at");
}

function readCount(row: SourceRow, primary: string, legacy: string): number | null {
  return readNumber(row, primary) ?? readNumber(row, legacy);
}

function statusVariant(status: string | null): BadgeVariant {
  switch (status) {
    case "completed":
      return "healthy";
    case "truncated":
      return "review";
    case "failed":
      return "error";
    default:
      return "neutral";
  }
}

const COLUMNS: ColumnDef<SourceRow, unknown>[] = [
  {
    id: "source",
    header: "Source",
    accessorFn: (row) => readString(row, "source") ?? "—",
    cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
  },
  {
    id: "last_run_at",
    header: "Last run",
    accessorFn: (row) => readRunTimestamp(row),
    cell: ({ getValue }) => {
      const v = getValue<string | null>();
      return v ? formatDateTime(v) : "—";
    },
  },
  {
    id: "region",
    header: "Region",
    accessorFn: (row) => readString(row, "region"),
    cell: ({ getValue }) => getValue<string | null>() ?? "—",
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (row) => readString(row, "status"),
    cell: ({ getValue }) => {
      const status = getValue<string | null>();
      return status ? (
        <Badge variant={statusVariant(status)} className="uppercase">
          {status}
        </Badge>
      ) : (
        "—"
      );
    },
  },
  {
    id: "run_id",
    header: "Run ID",
    accessorFn: (row) => readString(row, "run_id"),
    cell: ({ getValue }) => {
      const runId = getValue<string | null>();
      return runId ? <span className="font-mono text-xs">{runId}</span> : "—";
    },
  },
  {
    id: "item_count",
    header: "Items",
    accessorFn: (row) => readCount(row, "item_count", "raw_count"),
    cell: ({ getValue }) => formatNumber(getValue<number | null>()),
  },
  {
    id: "processed",
    header: "Processed",
    accessorFn: (row) => readCount(row, "processed", "normalized_count"),
    cell: ({ getValue }) => formatNumber(getValue<number | null>()),
  },
  {
    id: "rejected",
    header: "Rejected",
    accessorFn: (row) => readCount(row, "rejected", "filtered_count"),
    cell: ({ getValue }) => formatNumber(getValue<number | null>()),
  },
  {
    id: "created_leads",
    header: "Leads",
    accessorFn: (row) => readNumber(row, "created_leads"),
    cell: ({ getValue }) => formatNumber(getValue<number | null>()),
  },
];

/**
 * Defensive `DataTable` over `status.sources` (rows of `tav.v_source_health`). Reads only
 * operational run columns exposed by the view; legacy count/timestamp names are supported
 * as fallbacks so older fixtures still render. Empty state when `db.ok` is false.
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
