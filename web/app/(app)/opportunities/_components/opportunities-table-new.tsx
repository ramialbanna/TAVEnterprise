"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Info } from "lucide-react";

import type { OpportunityRow } from "@/lib/app-api/schemas";
import {
  formatOpportunityStatus,
  formatRegion,
  TABLE_HEADERS,
  TOOLTIPS,
} from "@/lib/copy/opportunities-labels";
import { formatNumber, formatMoney, formatDateTime } from "@/lib/format";
import { DataTable } from "@/components/data-table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { OpportunityBadgesNew, OpportunityTypeBadgeNew } from "./opportunity-badges-new";

function HeaderWithTooltip({
  label,
  tooltip,
}: {
  label: string;
  tooltip: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex text-muted-foreground hover:text-foreground"
            aria-label={`About ${label}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

function TooltipColumnHeader({
  label,
  tooltip,
}: {
  label: string;
  tooltip: string;
}) {
  return <HeaderWithTooltip label={label} tooltip={tooltip} />;
}

function makeTooltipHeader(label: string, tooltip: string) {
  function TooltipHeader() {
    return <TooltipColumnHeader label={label} tooltip={tooltip} />;
  }
  TooltipHeader.displayName = `TooltipHeader(${label})`;
  return TooltipHeader;
}

export function OpportunitiesTableNew({
  rows,
  loading = false,
  onSelect,
  onOpenDetail,
  emptyTitle,
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
        header: TABLE_HEADERS.vehicle,
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
        header: TABLE_HEADERS.type,
        cell: ({ row }) => <OpportunityTypeBadgeNew row={row.original} />,
      },
      {
        id: "badges",
        header: TABLE_HEADERS.badges,
        cell: ({ row }) => <OpportunityBadgesNew badges={row.original.badges} />,
      },
      {
        accessorKey: "price",
        header: TABLE_HEADERS.price,
        cell: ({ row }) => formatMoney(row.original.price),
      },
      {
        accessorKey: "mmrValue",
        header: makeTooltipHeader(TABLE_HEADERS.mmrValue, TOOLTIPS.mmrValue),
        cell: ({ row }) => formatMoney(row.original.mmrValue),
      },
      {
        accessorKey: "spread",
        header: makeTooltipHeader(TABLE_HEADERS.spread, TOOLTIPS.spread),
        cell: ({ row }) => formatMoney(row.original.spread),
      },
      {
        accessorKey: "finalScore",
        header: makeTooltipHeader(TABLE_HEADERS.finalScore, TOOLTIPS.finalScore),
        cell: ({ row }) => formatNumber(row.original.finalScore),
      },
      {
        accessorKey: "assignedCloserName",
        header: TABLE_HEADERS.assignedCloserName,
        cell: ({ row }) => row.original.assignedCloserName ?? "—",
      },
      {
        accessorKey: "claimedBy",
        header: TABLE_HEADERS.claimedBy,
        cell: ({ row }) => row.original.claimedBy ?? "—",
      },
      {
        accessorKey: "status",
        header: TABLE_HEADERS.status,
        cell: ({ row }) => formatOpportunityStatus(row.original.status),
      },
      {
        accessorKey: "region",
        header: TABLE_HEADERS.region,
        cell: ({ row }) => formatRegion(row.original.region),
      },
      {
        accessorKey: "lastSeenAt",
        header: TABLE_HEADERS.lastSeenAt,
        cell: ({ row }) => formatDateTime(row.original.lastSeenAt),
      },
    ],
    [],
  );

  return (
    <TooltipProvider delayDuration={300}>
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
    </TooltipProvider>
  );
}
