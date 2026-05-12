"use client";

import type { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

/**
 * Pagination footer for `DataTable`: a "Showing X–Y of Z" summary (Z = the filtered
 * row count), a page-size `<select>`, and prev/next buttons. Operates entirely on the
 * passed TanStack `table` instance.
 */
export function DataTablePagination<TData>({
  table,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  className,
}: {
  table: Table<TData>;
  pageSizeOptions?: number[];
  className?: string;
}) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;
  const first = total === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-1 py-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <span>{total === 0 ? "No rows" : `Showing ${first}–${last} of ${total}`}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          Rows per page
          <select
            className="h-7 rounded-md border border-input bg-background px-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={pageSize}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((size) => (
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
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
