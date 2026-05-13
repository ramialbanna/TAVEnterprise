"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState, type ApiErrorResult } from "@/components/data-state";
import { DataTableColumnHeader } from "./column-header";
import { DataTablePagination } from "./pagination";

export type Density = "comfortable" | "compact";

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Render the table skeleton instead of the table (first load, nothing to show yet). */
  loading?: boolean;
  /** Render the error panel (with Retry, if `onRetry` is supplied and the error is retryable). */
  error?: ApiErrorResult;
  onRetry?: () => void;
  /** Empty-state copy when `data` is `[]` (distinct from "no rows match the filters"). */
  emptyTitle?: string;
  emptyHint?: ReactNode;
  /** Initial page size (default 25). */
  pageSize?: number;
  /** Initial row density; a toolbar toggle flips it at runtime. */
  density?: Density;
  /** Per-column text filter inputs (case-insensitive `includesString`). Default: on. */
  enableColumnFilters?: boolean;
  /**
   * Optional row-click handler. When supplied, every body row becomes a focusable
   * button-role element that calls `onRowClick(row.original)` on click or Enter.
   * Unsupplied → rows remain plain (no-op hover only).
   */
  onRowClick?: (data: TData) => void;
  className?: string;
}

const ROW_PADDING: Record<Density, string> = {
  comfortable: "px-3 py-2.5",
  compact: "px-3 py-1.5",
};

function columnLabel<TData>(header: ColumnDef<TData, unknown>["header"], fallback: string): string {
  return typeof header === "string" ? header : fallback;
}

/**
 * Generic client-side data table over TanStack Table v8: sortable headers, per-column
 * text filters, pagination, a density toggle, and a sticky header. Delegates the
 * loading / empty / error regions to the shared `data-state` components so every table
 * in the dashboard renders those states identically.
 *
 * Row selection is intentionally disabled in v1 (`enableRowSelection: false`); the wiring
 * is left in place for a later milestone.
 */
export function DataTable<TData>({
  columns,
  data,
  loading = false,
  error,
  onRetry,
  emptyTitle = "Nothing to show",
  emptyHint,
  pageSize = 25,
  density: initialDensity = "comfortable",
  enableColumnFilters = true,
  onRowClick,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [density, setDensity] = useState<Density>(initialDensity);

  // TanStack `useReactTable` returns an instance whose methods the React Compiler can't
  // memoize; it (correctly) skips compiling this component. Idiomatic per TanStack's docs.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable<TData>({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    enableRowSelection: false,
    enableColumnFilters,
    defaultColumn: { filterFn: "includesString" },
  });

  if (loading) return <LoadingState variant="table" className={className} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} className={className} />;
  if (data.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} className={className} />;

  const cellPad = ROW_PADDING[density];
  const rows = table.getRowModel().rows;
  const headerGroup = table.getHeaderGroups()[0];
  const leafCount = table.getVisibleLeafColumns().length;
  const showFilterRow =
    enableColumnFilters && table.getAllLeafColumns().some((column) => column.getCanFilter());

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setDensity((d) => (d === "comfortable" ? "compact" : "comfortable"))}
          aria-pressed={density === "compact"}
        >
          {density === "comfortable" ? "Compact rows" : "Comfortable rows"}
        </Button>
      </div>

      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-border">
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className={cn("text-left align-middle font-medium text-muted-foreground", cellPad)}
                  >
                    {header.isPlaceholder ? null : <DataTableColumnHeader header={header} />}
                  </th>
                ))}
              </tr>
            ))}
            {showFilterRow && headerGroup ? (
              <tr className="border-b border-border bg-card">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-2 pb-1.5">
                    {header.column.getCanFilter() ? (
                      <Input
                        type="search"
                        value={(header.column.getFilterValue() as string | undefined) ?? ""}
                        onChange={(event) => header.column.setFilterValue(event.target.value)}
                        placeholder="Filter…"
                        aria-label={`Filter ${columnLabel(header.column.columnDef.header, header.column.id)}`}
                        className="h-7 text-xs"
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={leafCount} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No rows match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const clickable = onRowClick !== undefined;
                return (
                  <tr
                    key={row.id}
                    {...(clickable
                      ? {
                          role: "button",
                          tabIndex: 0,
                          onClick: () => onRowClick(row.original),
                          onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(row.original);
                            }
                          },
                        }
                      : {})}
                    className={cn(
                      "border-b border-border last:border-0 hover:bg-muted/40",
                      clickable && "cursor-pointer focus:outline-none focus-visible:bg-muted/60",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cn("align-middle", cellPad)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <DataTablePagination table={table} />
    </div>
  );
}
