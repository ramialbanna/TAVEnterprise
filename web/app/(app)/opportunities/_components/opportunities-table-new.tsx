"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Columns3, Info } from "lucide-react";

import type { OpportunitySort } from "@/lib/app-api/client";
import type { OpportunityRow } from "@/lib/app-api/schemas";
import {
  formatOpportunityStatus,
  formatRegion,
  TOOLTIPS,
} from "@/lib/copy/opportunities-labels";
import { canShowClaimAction } from "@/lib/opportunities/claim-eligibility";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  SORT_OPTIONS,
  TABLE_COLUMNS,
  type TableColumnId,
  type TableDensity,
  defaultColumnVisibility,
  readColumnVisibility,
  readTableDensity,
  writeColumnVisibility,
  writeTableDensity,
} from "@/lib/opportunities/table-preferences";
import { formatNumber, formatMoney, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/data-state";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { OpportunityVehicleCellNew } from "./opportunity-vehicle-cell-new";
import { OpportunityRowActionsNew, SpreadSignalCell } from "./opportunity-row-actions-new";

const ROW_PADDING: Record<TableDensity, string> = {
  comfortable: "px-3 py-2.5",
  compact: "px-3 py-1.5",
};

function HeaderWithTooltip({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex text-muted-foreground hover:text-foreground"
            aria-label={`About ${label}`}
            onClick={(event) => event.stopPropagation()}
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

function ServerPagination({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (nextOffset: number, nextLimit: number) => void;
}) {
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(total, offset + limit);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1 text-xs text-muted-foreground">
      <span>{total === 0 ? "No rows" : `Showing ${first}–${last} of ${total}`}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          Rows per page
          <select
            className="h-7 rounded-md border border-input bg-background px-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={limit}
            onChange={(event) => onChange(0, Number(event.target.value))}
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange(Math.max(0, offset - limit), limit)}
          disabled={!canPrev}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange(offset + limit, limit)}
          disabled={!canNext}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function OpportunitiesTableNew({
  rows,
  total,
  offset,
  limit = DEFAULT_PAGE_SIZE,
  sort,
  loading = false,
  selectedId,
  claimActor,
  claimPendingId,
  onSelect,
  onOpenDetail,
  onPaginationChange,
  onSortChange,
  onClaim,
  emptyTitle,
  emptyHint,
}: {
  rows: OpportunityRow[];
  total: number;
  offset: number;
  limit?: number;
  sort: OpportunitySort;
  loading?: boolean;
  selectedId?: string | null;
  claimActor: Parameters<typeof canShowClaimAction>[0];
  claimPendingId?: string | null;
  onSelect: (row: OpportunityRow) => void;
  onOpenDetail: (row: OpportunityRow) => void;
  onPaginationChange: (offset: number, limit: number) => void;
  onSortChange: (sort: OpportunitySort) => void;
  onClaim: (row: OpportunityRow) => void;
  emptyTitle?: string;
  emptyHint?: React.ReactNode;
}) {
  const [columnVisibility, setColumnVisibility] = useState(() =>
    typeof window === "undefined" ? defaultColumnVisibility() : readColumnVisibility(),
  );
  const [density, setDensity] = useState<TableDensity>(() =>
    typeof window === "undefined" ? "compact" : readTableDensity(),
  );
  const [columnsOpen, setColumnsOpen] = useState(false);

  const visibleColumns = useMemo(
    () => TABLE_COLUMNS.filter((col) => columnVisibility[col.id]),
    [columnVisibility],
  );

  const cellPad = ROW_PADDING[density];

  function setColumnVisible(id: TableColumnId, visible: boolean) {
    const next = { ...columnVisibility, [id]: visible, vehicle: true, actions: true };
    writeColumnVisibility(next);
    setColumnVisibility(next);
  }

  function toggleDensity() {
    const next: TableDensity = density === "comfortable" ? "compact" : "comfortable";
    writeTableDensity(next);
    setDensity(next);
  }

  if (loading && rows.length === 0) {
    return <LoadingState variant="table" />;
  }

  if (!loading && total === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  function renderCell(columnId: TableColumnId, row: OpportunityRow) {
    switch (columnId) {
      case "vehicle":
        return <OpportunityVehicleCellNew row={row} />;
      case "price":
        return formatMoney(row.price);
      case "mmrValue":
        return formatMoney(row.mmrValue);
      case "spread":
        return <SpreadSignalCell spread={row.spread} />;
      case "finalScore":
        return formatNumber(row.finalScore);
      case "assignedCloserName":
        return row.assignedCloserName ?? "—";
      case "claimedBy":
        return row.claimedBy ?? "—";
      case "status":
        return formatOpportunityStatus(row.status);
      case "region":
        return formatRegion(row.region);
      case "lastSeenAt":
        return formatDateTime(row.lastSeenAt);
      case "actions":
        return (
          <OpportunityRowActionsNew
            row={row}
            canClaim={canShowClaimAction(claimActor, row)}
            claimPending={claimPendingId === row.id}
            onClaim={onClaim}
          />
        );
      default:
        return "—";
    }
  }

  function headerLabel(columnId: TableColumnId): React.ReactNode {
    const col = TABLE_COLUMNS.find((c) => c.id === columnId);
    if (!col) return columnId;
    if (columnId === "mmrValue") {
      return <HeaderWithTooltip label={col.label} tooltip={TOOLTIPS.mmrValue} />;
    }
    if (columnId === "spread") {
      return <HeaderWithTooltip label={col.label} tooltip={TOOLTIPS.spread} />;
    }
    if (columnId === "finalScore") {
      return <HeaderWithTooltip label={col.label} tooltip={TOOLTIPS.finalScore} />;
    }
    return col.label;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Sort by
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={sort}
              onChange={(event) => onSortChange(event.target.value as OpportunitySort)}
              aria-label="Sort opportunities"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <DropdownMenu open={columnsOpen} onOpenChange={setColumnsOpen}>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" aria-label="Choose columns">
                <Columns3 className="size-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {TABLE_COLUMNS.filter((col) => col.hideable).map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={columnVisibility[col.id]}
                  onCheckedChange={(checked) => setColumnVisible(col.id, checked === true)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={toggleDensity}
            aria-pressed={density === "compact"}
          >
            {density === "comfortable" ? "Compact rows" : "Comfortable rows"}
          </Button>
        </div>

        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full caption-bottom text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                {visibleColumns.map((col) => (
                  <th
                    key={col.id}
                    scope="col"
                    className={cn("text-left align-middle font-medium text-muted-foreground", cellPad)}
                  >
                    {headerLabel(col.id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = selectedId === row.id;
                return (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(row)}
                    onDoubleClick={() => onOpenDetail(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(row);
                      }
                    }}
                    data-selected={selected ? "true" : undefined}
                    className={cn(
                      "cursor-pointer border-b border-border last:border-0 hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/60",
                      selected && "bg-muted/60",
                    )}
                  >
                    {visibleColumns.map((col) => (
                      <td key={col.id} className={cn("align-middle", cellPad)}>
                        {renderCell(col.id, row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ServerPagination offset={offset} limit={limit} total={total} onChange={onPaginationChange} />
      </div>
    </TooltipProvider>
  );
}
