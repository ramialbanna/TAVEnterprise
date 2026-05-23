"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import type { OpportunityRow } from "@/lib/app-api/schemas";
import { formatNumber, formatMoney, formatDateTime } from "@/lib/format";
import { DataTable } from "@/components/data-table";

import { OpportunityBadges, OpportunityTypeBadge } from "./opportunity-badges";

export function OpportunitiesTable({
  rows,
  loading = false,
  onSelect,
  onOpenDetail,
  emptyTitle = "No opportunities",
  emptyHint,
}: {
  rows: OpportunityRow[];
  loading?: boolean;
  onSelect: (row: OpportunityRow) => void;
  onOpenDetail: (row: OpportunityRow) => void;
  emptyTitle?: string;
  emptyHint?: React.ReactNode;
}) {
  const columns = useMemo<ColumnDef<OpportunityRow, unknown>[]>(
    () => [
      {
        id: "vehicle",
        header: "Vehicle",
        cell: ({ row }) => {
          const r = row.original;
          const ymm = [r.year, r.make, r.model].filter(Boolean).join(" ");
          return (
            <div className="space-y-0.5">
              <div className="font-medium">{r.title || ymm || "—"}</div>
              {ymm && r.title ? (
                <div className="text-xs text-muted-foreground">{ymm}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => <OpportunityTypeBadge row={row.original} />,
      },
      {
        id: "badges",
        header: "Badges",
        cell: ({ row }) => <OpportunityBadges badges={row.original.badges} />,
      },
      {
        accessorKey: "price",
        header: "Price",
        cell: ({ row }) => formatMoney(row.original.price),
      },
      {
        accessorKey: "mmrValue",
        header: "MMR",
        cell: ({ row }) => formatMoney(row.original.mmrValue),
      },
      {
        accessorKey: "spread",
        header: "Spread",
        cell: ({ row }) => formatMoney(row.original.spread),
      },
      {
        accessorKey: "finalScore",
        header: "Score",
        cell: ({ row }) => formatNumber(row.original.finalScore),
      },
      {
        accessorKey: "assignedCloserName",
        header: "Assignee",
        cell: ({ row }) => row.original.assignedCloserName ?? "—",
      },
      {
        accessorKey: "claimedBy",
        header: "Claimed by",
        cell: ({ row }) => row.original.claimedBy ?? "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => row.original.status ?? "—",
      },
      {
        accessorKey: "region",
        header: "Region",
        cell: ({ row }) => row.original.region ?? "—",
      },
      {
        accessorKey: "lastSeenAt",
        header: "Last seen",
        cell: ({ row }) => formatDateTime(row.original.lastSeenAt),
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
      onRowDoubleClick={(row) => onOpenDetail(row)}
    />
  );
}
