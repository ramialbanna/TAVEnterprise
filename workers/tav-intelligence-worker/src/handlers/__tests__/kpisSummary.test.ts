import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError, ValidationError, PersistenceError } from "../../errors";
import type { HandlerArgs } from "../types";
import type { Env } from "../../types/env";
import type { ApiResponse } from "../../types/api";
import type { KpisSummaryData } from "../kpisSummary";

const mockRpc = vi.fn();

vi.mock("../../persistence/supabase", () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
}));

const { handleKpisSummary } = await import("../kpisSummary");

const env: Env = {
  TAV_INTEL_KV:              null as unknown as KVNamespace,
  MANAGER_EMAIL_ALLOWLIST:   "",
  MANHEIM_CLIENT_ID:         "",
  MANHEIM_CLIENT_SECRET:     "",
  MANHEIM_USERNAME:          "",
  MANHEIM_PASSWORD:          "",
  MANHEIM_TOKEN_URL:         "",
  MANHEIM_MMR_URL:           "",
  SUPABASE_URL:              "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  INTEL_SERVICE_SECRET: "",
};

const authedCtx = { userId: "rami@texasautovalue.com", email: "rami@texasautovalue.com", name: null, roles: [] as string[] };
const anonCtx   = { userId: null, email: null, name: null, roles: [] as string[] };

const STUB_KPIS = {
  total_lookups:      42,
  successful_lookups: 38,
  failed_lookups:     4,
  cache_hit_rate:     71.43,
  avg_latency_ms:     210.5,
  p95_latency_ms:     480.0,
  lookups_by_type:    { vin: 30, year_make_model: 12 },
  lookups_by_outcome: { hit: 30, miss: 8, error: 4 },
  top_requesters:     [{ email: "rami@texasautovalue.com", count: 25 }],
  recent_error_count: 4,
};

function buildArgs(params: Record<string, string> = {}, authed = true): HandlerArgs {
  const url = new URL("https://worker.test/kpis/summary");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return {
    request:     new Request(url.toString(), { method: "GET" }),
    env,
    requestId:   "req-kpi-1",
    userContext: authed ? authedCtx : anonCtx,
  };
}

describe("handleKpisSummary", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws AuthError when unauthenticated", async () => {
    await expect(handleKpisSummary(buildArgs({}, false))).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ValidationError for a bad 'to' date", async () => {
    await expect(
      handleKpisSummary(buildArgs({ to: "not-a-date" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for a bad 'from' date", async () => {
    await expect(
      handleKpisSummary(buildArgs({ from: "not-a-date" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when from >= to", async () => {
    await expect(
      handleKpisSummary(buildArgs({
        from: "2026-05-08T12:00:00Z",
        to:   "2026-05-08T10:00:00Z",
      })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for unknown lookup_type", async () => {
    await expect(
      handleKpisSummary(buildArgs({ lookup_type: "bad_type" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns KPIs with default 7-day window", async () => {
    mockRpc.mockResolvedValueOnce({ data: STUB_KPIS, error: null });

    const res  = await handleKpisSummary(buildArgs());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<KpisSummaryData>;
    expect(body.success).toBe(true);
    expect(body.data?.total_lookups).toBe(42);
    expect(body.data?.cache_hit_rate).toBe(71.43);
    expect(body.data?.p95_latency_ms).toBe(480.0);
    expect(body.data?.time_window).toBeDefined();
    expect(body.requestId).toBe("req-kpi-1");

    // default window: from ~7 days ago
    const window = body.data?.time_window;
    const diffMs = new Date(window!.to).getTime() - new Date(window!.from).getTime();
    expect(diffMs).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);
  });

  it("returns KPIs with explicit filtered window", async () => {
    mockRpc.mockResolvedValueOnce({ data: STUB_KPIS, error: null });

    const res  = await handleKpisSummary(buildArgs({
      from:        "2026-05-01T00:00:00Z",
      to:          "2026-05-08T00:00:00Z",
      email:       "rami@texasautovalue.com",
      lookup_type: "vin",
    }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<KpisSummaryData>;
    expect(body.data?.time_window.from).toBe("2026-05-01T00:00:00.000Z");
    expect(body.data?.time_window.to).toBe("2026-05-08T00:00:00.000Z");

    // verify RPC was called with the right params
    expect(mockRpc).toHaveBeenCalledWith("get_mmr_kpis", {
      p_from:        "2026-05-01T00:00:00.000Z",
      p_to:          "2026-05-08T00:00:00.000Z",
      p_email:       "rami@texasautovalue.com",
      p_lookup_type: "vin",
    });
  });

  it("returns zeroed KPIs when no data in window", async () => {
    const empty = {
      total_lookups:      0,
      successful_lookups: 0,
      failed_lookups:     0,
      cache_hit_rate:     null,
      avg_latency_ms:     null,
      p95_latency_ms:     null,
      lookups_by_type:    {},
      lookups_by_outcome: {},
      top_requesters:     [],
      recent_error_count: 0,
    };
    mockRpc.mockResolvedValueOnce({ data: empty, error: null });

    const res  = await handleKpisSummary(buildArgs());
    const body = (await res.json()) as ApiResponse<KpisSummaryData>;
    expect(body.data?.total_lookups).toBe(0);
    expect(body.data?.cache_hit_rate).toBeNull();
    expect(body.data?.top_requesters).toEqual([]);
  });

  it("throws PersistenceError when RPC fails", async () => {
    mockRpc.mockResolvedValueOnce({
      data:  null,
      error: { code: "PGRST", message: "function not found" },
    });
    await expect(handleKpisSummary(buildArgs())).rejects.toBeInstanceOf(PersistenceError);
  });

  it("passes null filters when no optional params provided", async () => {
    mockRpc.mockResolvedValueOnce({ data: STUB_KPIS, error: null });
    await handleKpisSummary(buildArgs());
    const call = mockRpc.mock.calls[0]!;
    expect(call[1].p_email).toBeNull();
    expect(call[1].p_lookup_type).toBeNull();
  });

  it("uses a 7-day window relative to 'to' when only 'to' is provided", async () => {
    mockRpc.mockResolvedValueOnce({ data: STUB_KPIS, error: null });
    const to          = "2026-05-08T00:00:00.000Z";
    const expectedFrom = new Date(new Date(to).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    await handleKpisSummary(buildArgs({ to }));

    const call = mockRpc.mock.calls[0]!;
    expect(call[1].p_to).toBe(to);
    expect(call[1].p_from).toBe(expectedFrom);
  });

  it("throws ValidationError when window exceeds 90 days", async () => {
    await expect(
      handleKpisSummary(buildArgs({
        from: "2025-01-01T00:00:00Z",
        to:   "2026-05-08T00:00:00Z",
      })),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
