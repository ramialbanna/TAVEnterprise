import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import type { HistoricalSale } from "@/lib/app-api/schemas";

import { HistoricalClient } from "./historical-client";

vi.mock("@/lib/app-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-api/client")>();
  return { ...actual, listHistoricalSales: vi.fn() };
});

import { listHistoricalSales } from "@/lib/app-api/client";

const mockedList = vi.mocked(listHistoricalSales);

function row(over: Partial<HistoricalSale>): HistoricalSale {
  return {
    id: "hs_x",
    vin: "1FT8W3BT1000001",
    year: 2024,
    make: "Ford",
    model: "F-150",
    trim: "XLT",
    buyer: null,
    buyerUserId: null,
    acquisitionDate: null,
    saleDate: "2026-05-01",
    acquisitionCost: 14000,
    salePrice: 18000,
    transportCost: null,
    reconCost: null,
    auctionFees: null,
    grossProfit: 2000,
    sourceFileName: null,
    uploadBatchId: null,
    createdAt: "2026-05-01T18:00:00.000Z",
    ...over,
  };
}

function ok(rows: HistoricalSale[]): ApiResult<HistoricalSale[]> {
  return { ok: true, data: rows, status: 200 };
}

function renderClient(initial: ApiResult<HistoricalSale[]>): { container: HTMLElement } {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<HistoricalClient initial={initial} />, { wrapper: Wrapper });
}

const SEED_ROWS = [
  row({ id: "1", make: "Ford", model: "F-150", trim: "XLT", vin: "1FT0001", grossProfit: 1500 }),
  row({ id: "2", make: "Ford", model: "Ranger", trim: "Lariat", vin: null, grossProfit: 3500 }),
  row({ id: "3", make: "Toyota", model: "Camry", trim: "LE", vin: "JT0001", grossProfit: 2500 }),
];

beforeEach(() => {
  mockedList.mockReset();
});
afterEach(() => {
  mockedList.mockReset();
});

describe("HistoricalClient", () => {
  it("renders the initial row-count summary from initialData (no extra fetch)", () => {
    renderClient(ok(SEED_ROWS));
    expect(screen.getByText((_, el) => /3 of 3 rows after filters/i.test(el?.textContent ?? ""), {
      selector: "p",
    })).toBeInTheDocument();
    expect(screen.getByText(/no active filters/i)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("changing the year input triggers a refetch with a server-side filter param", async () => {
    mockedList.mockResolvedValue(ok([row({ id: "y1", year: 2023, grossProfit: 1800 })]));
    renderClient(ok(SEED_ROWS));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Year$/i), "2023");

    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    const lastCall = mockedList.mock.calls[mockedList.mock.calls.length - 1]?.[0];
    expect(lastCall).toEqual({ limit: 100, year: 2023 });
    // Server payload must NOT contain client-only fields.
    expect(lastCall).not.toHaveProperty("trim");
    expect(lastCall).not.toHaveProperty("vinPresent");
    expect(lastCall).not.toHaveProperty("grossMin");
    expect(lastCall).not.toHaveProperty("grossMax");
  });

  it("trim filter is applied client-side (does not refetch)", async () => {
    renderClient(ok(SEED_ROWS));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Trim/i), "XLT");

    // Trim is client-only — applyClientFilters narrows to 1 row, no refetch.
    await waitFor(() =>
      expect(screen.getByText((_, el) => /1 of 3 rows? after filters/i.test(el?.textContent ?? ""), {
        selector: "p",
      })).toBeInTheDocument(),
    );
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("VIN-presence filter narrows the count without refetching", async () => {
    renderClient(ok(SEED_ROWS));
    fireEvent.change(screen.getByLabelText(/^VIN/i), { target: { value: "missing" } });
    expect(screen.getByText((_, el) => /1 of 3 rows? after filters/i.test(el?.textContent ?? ""), {
        selector: "p",
      })).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("gross min/max range drops rows whose grossProfit is null (no zero coercion)", async () => {
    const rows = [
      row({ id: "g1", grossProfit: 1500 }),
      row({ id: "g2", grossProfit: 3500 }),
      row({ id: "g3", grossProfit: null }),
    ];
    renderClient(ok(rows));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Gross min/i), "2000");
    await waitFor(() =>
      expect(screen.getByText((_, el) => /1 of 3 rows? after filters/i.test(el?.textContent ?? ""), {
        selector: "p",
      })).toBeInTheDocument(),
    );
  });

  it("Clear filters returns the state to the initial unfiltered view", async () => {
    renderClient(ok(SEED_ROWS));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Trim/i), "XLT");
    await waitFor(() =>
      expect(screen.getByText((_, el) => /1 of 3 rows? after filters/i.test(el?.textContent ?? ""), {
        selector: "p",
      })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getByText((_, el) => /3 of 3 rows after filters/i.test(el?.textContent ?? ""), {
      selector: "p",
    })).toBeInTheDocument();
    expect(screen.getByText(/no active filters/i)).toBeInTheDocument();
  });

  it("renders ErrorState (with Retry) for a retryable ApiResult failure", () => {
    renderClient({
      ok: false,
      kind: "proxy",
      error: "upstream_non_json",
      status: 502,
      message: "Upstream non-JSON — try again.",
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders UnavailableState (no alert) for a kind:'unavailable' failure", () => {
    renderClient({
      ok: false,
      kind: "unavailable",
      error: "db_error",
      status: 503,
      message: "The database is temporarily unavailable — try again.",
    });
    expect(screen.getByText(/Historical sales unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("never renders sellThroughRate copy anywhere", () => {
    const { container } = renderClient(ok(SEED_ROWS));
    expect(container.textContent ?? "").not.toMatch(/sell[-_\s]?through/i);
  });
});
