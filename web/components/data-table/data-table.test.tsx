import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

import type { ApiErrorResult } from "@/components/data-state";
import { DataTable } from "./data-table";

type Row = { name: string; qty: number };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "qty", header: "Qty" },
];

const data: Row[] = [
  { name: "B", qty: 2 },
  { name: "A", qty: 1 },
];

/** Text of each body row's first cell (the "name" column), in DOM order. */
function nameColumn(): string[] {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .map((row) => within(row).queryAllByRole("cell"))
    .filter((cells) => cells.length > 0)
    .map((cells) => cells[0]?.textContent ?? "");
}

describe("DataTable", () => {
  it("renders a row per datum", () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(nameColumn()).toEqual(["B", "A"]);
  });

  it("sorts ascending when a sortable header is clicked", () => {
    render(<DataTable columns={columns} data={data} />);
    fireEvent.click(screen.getByRole("button", { name: /sort by name/i }));
    expect(nameColumn()).toEqual(["A", "B"]);
  });

  it("filters rows by a per-column text input (case-insensitive includes)", () => {
    render(<DataTable columns={columns} data={data} />);
    fireEvent.change(screen.getByRole("searchbox", { name: /filter name/i }), {
      target: { value: "a" },
    });
    expect(nameColumn()).toEqual(["A"]);
    expect(screen.queryByText("B")).not.toBeInTheDocument();
  });

  it("toggles row density", () => {
    render(<DataTable columns={columns} data={data} />);
    const toggle = screen.getByRole("button", { name: /compact rows/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /comfortable rows/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders the empty state (not a table) when data is []", () => {
    render(<DataTable columns={columns} data={[]} emptyTitle="No sales yet" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No sales yet")).toBeInTheDocument();
  });

  it("renders the loading skeleton when loading", () => {
    const { container } = render(<DataTable columns={columns} data={[]} loading />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("renders the error panel with a working Retry when given a retryable error", () => {
    const error: ApiErrorResult = {
      ok: false,
      kind: "unavailable",
      error: "db_error",
      status: 503,
      message: "The database is temporarily unavailable — try again.",
    };
    const onRetry = vi.fn();
    render(<DataTable columns={columns} data={[]} error={error} onRetry={onRetry} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/try again/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
