import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/lib/app-api/client", () => ({
  getAppMe: vi.fn(),
  listOpportunitiesPage: vi.fn(),
  getKpis: vi.fn(),
  getSystemStatus: vi.fn(),
  listHistoricalSales: vi.fn(),
  listIngestRuns: vi.fn(),
}));

import {
  getKpis,
  getSystemStatus,
  listHistoricalSales,
  listIngestRuns,
  listOpportunitiesPage,
} from "@/lib/app-api/client";
import { HISTORICAL_SALES_DEFAULT_LIMIT, INGEST_RUNS_DEFAULT_LIMIT } from "@/lib/query";

import { prefetchNavHref } from "./nav-prefetch";

const mockedKpis = vi.mocked(getKpis);
const mockedStatus = vi.mocked(getSystemStatus);
const mockedSales = vi.mocked(listHistoricalSales);
const mockedIngest = vi.mocked(listIngestRuns);
const mockedList = vi.mocked(listOpportunitiesPage);

describe("nav-prefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedKpis.mockResolvedValue({ ok: true, status: 200, data: {} as never });
    mockedStatus.mockResolvedValue({ ok: true, status: 200, data: {} as never });
    mockedSales.mockResolvedValue({ ok: true, status: 200, data: [] });
    mockedIngest.mockResolvedValue({ ok: true, status: 200, data: [] });
    mockedList.mockResolvedValue({ ok: true, status: 200, data: { items: [], total: 0, offset: 0 } });
  });

  it("prefetchNavHref warms Analytics KPIs, status, and sales", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    prefetchNavHref(client, "/dashboard/analytics");
    await vi.waitFor(() => {
      expect(mockedKpis).toHaveBeenCalled();
      expect(mockedStatus).toHaveBeenCalled();
      expect(mockedSales).toHaveBeenCalledWith({ limit: HISTORICAL_SALES_DEFAULT_LIMIT });
    });
  });

  it("prefetchNavHref warms Ingest Monitor runs", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    prefetchNavHref(client, "/ingest");
    await vi.waitFor(() => {
      expect(mockedIngest).toHaveBeenCalledWith({ limit: INGEST_RUNS_DEFAULT_LIMIT });
    });
  });

  it("prefetchNavHref warms Historical sales", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    prefetchNavHref(client, "/historical");
    await vi.waitFor(() => {
      expect(mockedSales).toHaveBeenCalledWith({ limit: HISTORICAL_SALES_DEFAULT_LIMIT });
    });
  });

  it("prefetchNavHref warms Admin system status", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    prefetchNavHref(client, "/admin");
    await vi.waitFor(() => {
      expect(mockedStatus).toHaveBeenCalled();
    });
  });
});
