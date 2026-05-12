"use client";

import type { Header } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

/** Plain-text label for a column, for `aria-label`s — falls back to the column id. */
function columnLabel<TData, TValue>(header: Header<TData, TValue>): string {
  const h = header.column.columnDef.header;
  return typeof h === "string" ? h : header.column.id;
}

/**
 * Header cell renderer for `DataTable`. Renders the column's `header` content; if the
 * column is sortable it wraps that content in a button that cycles the sort state
 * (none → asc → desc) and shows the current-direction indicator. Non-sortable columns
 * render the content as a plain span.
 */
export function DataTableColumnHeader<TData, TValue>({
  header,
  className,
}: {
  header: Header<TData, TValue>;
  className?: string;
}) {
  const { column } = header;
  const content = flexRender(column.columnDef.header, header.getContext());

  if (!column.getCanSort()) {
    return <span className={className}>{content}</span>;
  }

  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      aria-label={`Sort by ${columnLabel(header)}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        className,
      )}
    >
      {content}
      <Icon className={cn("size-3.5", sorted ? "text-foreground" : "opacity-50")} aria-hidden />
    </button>
  );
}
