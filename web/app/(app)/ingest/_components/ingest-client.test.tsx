import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import type { IngestRunSummary, IngestRunDetail } from "@/lib/app-api/schemas";

import { IngestClient } from "./ingest-client";

vi.mock("@/lib/app-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-api/client")>();
  return { ...actual, listIngestRuns: vi.fn(), getIngestRun: vi.fn() };
});

import { listIngestRuns, getIngestRun } from "@/lib/app-api/client";

const mockedList = vi.mocked(listIngestRuns);
const mockedDetail = vi.mocked(getIngestRun);

function run(over: Partial<IngestRunSummary>): IngestRunSummary {
  return {
    id: "sr_1",
    source: "facebook",
    run_id: "4NyscgfxEA39sJcIY",
    region: "dallas_tx",
    status: "completed",
    item_count: 4,
    processed: 3,
    rejected: 1,
    created_leads: 0,
    scraped_at: "2026-05-16T20:11:42.247Z",
    created_at: "2026-05-16T20:11:49.596Z",
    error_message: null,
    ...over,
  };
}

function okList(rows: IngestRunSummary[]): ApiResult<IngestRunSummary[]> {
  return { ok: true, data: rows, status: 200 };
}

function okDetail(over: Partial<IngestRunDetail> = {}): ApiResult<IngestRunDetail> {
  return {
    ok: true,
    status: 200,
    data: {
      run: run({}),
      rawListingCount: 4,
      normalizedListingCount: 3,
      filteredOutByReason: { missing_identifier: 1 },
      valuationMissByReason: { trim_missing: 2 },
      schemaDriftByType: {},
      createdLeadCount: 0,
      createdLeadIds: [],
      ...over,
    },
  };
}

function renderClient(initial: ApiResult<IngestRunSummary[]>) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<IngestClient initial={initial} />, { wrapper: Wrapper });
}

beforeEach(() => {
  mockedList.mockReset();
  mockedDetail.mockReset();
});
afterEach(() => {
  mockedList.mockReset();
  mockedDetail.mockReset();
});

describe("IngestClient", () => {
  it("renders the latest run and run-history table from initialData (no extra list fetch)", () => {
    renderClient(
      okList([
        run({ id: "sr_new", run_id: "RUN_NEW", processed: 9 }),
        run({ id: "sr_old", run_id: "RUN_OLD", processed: 1 }),
      ]),
    );
    expect(screen.getByText(/latest run/i)).toBeInTheDocument();
    expect(screen.getByText(/run history/i)).toBeInTheDocument();
    expect(screen.getAllByText("RUN_NEW").length).toBeGreaterThan(0);
    expect(screen.getByText("RUN_OLD")).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("shows an empty state when there are no runs", () => {
    renderClient(okList([]));
    expect(screen.getByText(/no ingest runs/i)).toBeInTheDocument();
  });

  it("renders ErrorState with Retry for a retryable failure", () => {
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
    expect(screen.getByText(/ingest runs unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders an auth error for a kind:'unauthorized' failure", () => {
    renderClient({
      ok: false,
      kind: "unauthorized",
      error: "unauthorized",
      status: 401,
      message: "Your session has expired — sign in again.",
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("opens the detail drawer with diagnostics when a run is selected", async () => {
    mockedDetail.mockResolvedValue(okDetail());
    renderClient(okList([run({ id: "sr_sel", run_id: "RUN_SEL" })]));

    const user = userEvent.setup();
    // run_id appears in the Latest-run card and the table row; click the table cell.
    const occurrences = screen.getAllByText("RUN_SEL");
    await user.click(occurrences[occurrences.length - 1]!);

    await waitFor(() => expect(mockedDetail).toHaveBeenCalledWith("sr_sel"));
    expect(
      await screen.findByRole("heading", { name: /filtered-out reasons/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /valuation misses/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /schema drift/i })).toBeInTheDocument();
    expect(screen.getByText(/missing_identifier/i)).toBeInTheDocument();
    // dead_letters explicitly unavailable per current schema
    expect(screen.getByRole("heading", { name: /dead letters/i })).toBeInTheDocument();
  });
});
