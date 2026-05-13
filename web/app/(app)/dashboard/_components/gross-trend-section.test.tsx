import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import type { HistoricalSale } from "@/lib/app-api/schemas";
import { historicalSales } from "@/test/msw/fixtures";

import { GrossTrendSection } from "./gross-trend-section";

function ok(data: HistoricalSale[]): ApiResult<HistoricalSale[]> {
  return { ok: true, data, status: 200 };
}

function renderSection(initial: ApiResult<HistoricalSale[]>): { container: HTMLElement } {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<GrossTrendSection initial={initial} />, { wrapper: Wrapper });
}

function row(over: Partial<HistoricalSale>): HistoricalSale {
  return {
    id: "hs_x",
    vin: null,
    year: 2026,
    make: "Ford",
    model: "F-150",
    trim: null,
    buyer: null,
    buyerUserId: null,
    acquisitionDate: null,
    saleDate: "2026-05-01",
    acquisitionCost: null,
    salePrice: 30000,
    transportCost: null,
    reconCost: null,
    auctionFees: null,
    grossProfit: 1500,
    sourceFileName: null,
    uploadBatchId: null,
    createdAt: "2026-05-01T18:00:00.000Z",
    ...over,
  };
}

describe("GrossTrendSection", () => {
  it("renders the title, sample caption, and month labels for the seeded historical sample", () => {
    renderSection(ok(historicalSales));

    expect(
      screen.getByText(/Gross trend \(TAV historical sales — returned sample\)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Based on the most recent ${historicalSales.length} historical-sales rows`, "i")),
    ).toBeInTheDocument();

    // The sr-only data table carries the month labels — assert at least one is present.
    const table = screen.getByRole("table", { name: /monthly average gross profit/i });
    expect(table.querySelectorAll("tbody tr").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the insufficient-data state when fewer than 2 months are present", () => {
    renderSection(
      ok([
        row({ saleDate: "2026-03-15", grossProfit: 1000 }),
        row({ saleDate: "2026-03-22", grossProfit: 2000 }),
      ]),
    );

    expect(screen.getByText(/not enough data/i)).toBeInTheDocument();
    // No chart figure / sr-only table when in the insufficient state.
    expect(screen.queryByRole("table", { name: /monthly average gross profit/i })).toBeNull();
  });

  it("renders the empty state when no rows produce a valid bucket", () => {
    renderSection(
      ok([
        row({ saleDate: "not-a-date", grossProfit: 1500 }),
        row({ saleDate: "2026-03-01", grossProfit: null }),
      ]),
    );

    expect(screen.getByText(/no data to display/i)).toBeInTheDocument();
  });

  it("renders UnavailableState (not ErrorState) for an ApiResult of kind 'unavailable'", () => {
    renderSection({
      ok: false,
      kind: "unavailable",
      error: "db_error",
      status: 503,
      message: "The database is temporarily unavailable — try again.",
    });

    expect(screen.getByText(/not available/i)).toBeInTheDocument();
    // UnavailableState is muted/non-alert — no role="alert", no Retry button.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("renders ErrorState with Retry for an ApiResult of kind 'proxy'", () => {
    renderSection({
      ok: false,
      kind: "proxy",
      error: "upstream_non_json",
      status: 502,
      message: "Upstream non-JSON — try again.",
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
  });

  it("does not render sellThroughRate copy anywhere", () => {
    const { container } = renderSection(ok(historicalSales));
    expect(container.textContent ?? "").not.toMatch(/sell[-_\s]?through/i);
  });
});
