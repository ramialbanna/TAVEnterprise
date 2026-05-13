import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { HistoricalSale } from "@/lib/app-api/schemas";

import { HistoricalComparison } from "./historical-comparison";

// Stub the client transport so we control listHistoricalSales without MSW.
vi.mock("@/lib/app-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-api/client")>();
  return { ...actual, listHistoricalSales: vi.fn() };
});

import { listHistoricalSales } from "@/lib/app-api/client";

function row(over: Partial<HistoricalSale>): HistoricalSale {
  return {
    id: "hs_x",
    vin: null,
    year: 2024,
    make: "Ford",
    model: "F-150",
    trim: null,
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

function renderPanel(props: {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
}): { container: HTMLElement } {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(
    <HistoricalComparison
      year={props.year ?? null}
      make={props.make ?? null}
      model={props.model ?? null}
      trim={props.trim ?? null}
    />,
    { wrapper: Wrapper },
  );
}

const mockedList = vi.mocked(listHistoricalSales);

beforeEach(() => {
  mockedList.mockReset();
});
afterEach(() => {
  mockedList.mockReset();
});

describe("HistoricalComparison", () => {
  it("prompts for year/make/model and does NOT fetch when any is missing", () => {
    renderPanel({ year: null, make: "Ford", model: "F-150" });
    expect(screen.getByText(/Enter\s+/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing:/i)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("renders aggregate values and 'n =' line for a matching ok ApiResult", async () => {
    const rows = [
      row({ saleDate: "2026-03-15", salePrice: 16000, acquisitionCost: 14000, grossProfit: 1500 }),
      row({ saleDate: "2026-04-10", salePrice: 18000, acquisitionCost: 15000, grossProfit: 2000 }),
      row({ saleDate: "2026-05-20", salePrice: 20000, acquisitionCost: 16000, grossProfit: 2500 }),
      row({ saleDate: "2026-05-25", salePrice: 17000, acquisitionCost: 14500, grossProfit: 1800 }),
      row({ saleDate: "2026-05-26", salePrice: 19000, acquisitionCost: 15500, grossProfit: 2100 }),
    ];
    mockedList.mockResolvedValue({ ok: true, data: rows, status: 200 });

    renderPanel({ year: 2024, make: "Ford", model: "F-150" });

    expect(await screen.findByText(/n = 5/i)).toBeInTheDocument();
    // No low-confidence badge when n >= 5.
    expect(screen.queryByText(/low confidence/i)).toBeNull();

    expect(screen.getByText(/last sold/i)).toBeInTheDocument();
    expect(screen.getByText(/avg sale price/i)).toBeInTheDocument();
    expect(screen.getByText(/median sale price/i)).toBeInTheDocument();
    expect(screen.getByText(/avg acquisition cost/i)).toBeInTheDocument();
    expect(screen.getByText(/avg gross profit/i)).toBeInTheDocument();

    // avgSalePrice = (16000+18000+20000+17000+19000)/5 = 18000;
    // medianSalePrice = sorted middle = 18000 as well, so 2 occurrences.
    expect(screen.getAllByText("$18,000").length).toBeGreaterThanOrEqual(2);
  });

  it("renders a low-confidence badge when n < 5", async () => {
    mockedList.mockResolvedValue({
      ok: true,
      data: [
        row({ salePrice: 16000, acquisitionCost: 14000, grossProfit: 1500 }),
        row({ salePrice: 20000, acquisitionCost: 16000, grossProfit: 2500 }),
      ],
      status: 200,
    });
    renderPanel({ year: 2024, make: "Ford", model: "F-150" });
    expect(await screen.findByText(/n = 2/i)).toBeInTheDocument();
    expect(screen.getByText(/low confidence \(n < 5\)/i)).toBeInTheDocument();
  });

  it("renders EmptyState when the API returns ok but zero rows", async () => {
    mockedList.mockResolvedValue({ ok: true, data: [], status: 200 });
    renderPanel({ year: 2024, make: "Ford", model: "F-150" });
    expect(await screen.findByText(/no matching historical sales/i)).toBeInTheDocument();
  });

  it("renders ErrorState (with retry) for a retryable ApiResult failure", async () => {
    mockedList.mockResolvedValue({
      ok: false,
      kind: "proxy",
      error: "upstream_non_json",
      status: 502,
      message: "Upstream non-JSON — try again.",
    });
    renderPanel({ year: 2024, make: "Ford", model: "F-150" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders UnavailableState (no alert) for a kind:'unavailable' failure", async () => {
    mockedList.mockResolvedValue({
      ok: false,
      kind: "unavailable",
      error: "db_error",
      status: 503,
      message: "The database is temporarily unavailable — try again.",
    });
    renderPanel({ year: 2024, make: "Ford", model: "F-150" });
    expect(await screen.findByText(/Comparison unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the three pending-backend placeholders (labels carried in the tooltip)", () => {
    renderPanel({ year: null, make: null, model: null });
    // Inline PendingBackendState renders a "Pending backend" badge with the field name in
    // the `title` (tooltip) attribute. Assert on title so we don't lock the inline copy.
    expect(screen.getByTitle(/Front \/ back gross split/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Days to sell/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Regional performance/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^Pending backend$/i).length).toBeGreaterThanOrEqual(3);
  });

  it("filters by trim client-side (case-insensitive); does NOT send a `trim` API param", async () => {
    mockedList.mockResolvedValue({
      ok: true,
      data: [
        row({ trim: "XLT", salePrice: 16000, acquisitionCost: 14000, grossProfit: 1500 }),
        row({ trim: "Lariat", salePrice: 22000, acquisitionCost: 18000, grossProfit: 3000 }),
        row({ trim: "xlt", salePrice: 18000, acquisitionCost: 15000, grossProfit: 2000 }),
      ],
      status: 200,
    });
    renderPanel({ year: 2024, make: "Ford", model: "F-150", trim: "XLT" });
    expect(await screen.findByText(/n = 2/i)).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(1);
    const arg = mockedList.mock.calls[0]?.[0];
    expect(arg).toEqual({ year: 2024, make: "Ford", model: "F-150", limit: 100 });
    expect(arg).not.toHaveProperty("trim");
  });

  it("does NOT render sellThroughRate copy anywhere", async () => {
    mockedList.mockResolvedValue({
      ok: true,
      data: [
        row({ salePrice: 16000, acquisitionCost: 14000, grossProfit: 1500 }),
        row({ salePrice: 18000, acquisitionCost: 15000, grossProfit: 2000 }),
      ],
      status: 200,
    });
    const { container } = renderPanel({ year: 2024, make: "Ford", model: "F-150" });
    await screen.findByText(/n = 2/i);
    expect(container.textContent ?? "").not.toMatch(/sell[-_\s]?through/i);
  });
});
