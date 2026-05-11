import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError, ValidationError, PersistenceError } from "../../errors";
import type { HandlerArgs } from "../types";
import type { Env } from "../../types/env";
import type { ApiResponse } from "../../types/api";
import type { MmrQueriesResponse } from "../intelMmrQueries";

// Builder-style mock: all chainable methods return `this`, terminal `.range()`
// is the async call we control per-test.
const mockRange = vi.fn();
const qb = {
  select: vi.fn().mockReturnThis(),
  order:  vi.fn().mockReturnThis(),
  range:  mockRange,
  eq:     vi.fn().mockReturnThis(),
  gte:    vi.fn().mockReturnThis(),
  lt:     vi.fn().mockReturnThis(),
};
const mockFrom = vi.fn(() => qb);

vi.mock("../../persistence/supabase", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

const { handleIntelMmrQueries } = await import("../intelMmrQueries");

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

function buildArgs(params: Record<string, string> = {}, authed = true): HandlerArgs {
  const url = new URL("https://worker.test/intel/mmr/queries");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return {
    request:     new Request(url.toString(), { method: "GET" }),
    env,
    requestId:   "req-q-1",
    userContext: authed ? authedCtx : anonCtx,
  };
}

const STUB_ROW = {
  id: "uuid-1", request_id: "req-abc", created_at: "2026-05-08T10:00:00Z",
  lookup_type: "vin", outcome: "hit", cache_hit: true, source: "cache",
  force_refresh: false, vin: "1HGCM82633A123456", year: 2003,
  make: null, model: null, trim: null, mileage_used: 55000,
  is_inferred_mileage: false, latency_ms: 45, retry_count: 0,
  mmr_value: 8500, error_code: null,
  requested_by_email: "rami@texasautovalue.com", requested_by_name: null,
};

describe("handleIntelMmrQueries", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws AuthError when unauthenticated", async () => {
    await expect(handleIntelMmrQueries(buildArgs({}, false))).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ValidationError for invalid lookup_type", async () => {
    await expect(
      handleIntelMmrQueries(buildArgs({ lookup_type: "bad" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for invalid outcome", async () => {
    await expect(
      handleIntelMmrQueries(buildArgs({ outcome: "unknown" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for invalid cache_hit value", async () => {
    await expect(
      handleIntelMmrQueries(buildArgs({ cache_hit: "maybe" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for invalid from date", async () => {
    await expect(
      handleIntelMmrQueries(buildArgs({ from: "not-a-date" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for invalid to date", async () => {
    await expect(
      handleIntelMmrQueries(buildArgs({ to: "not-a-date" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns 200 with items and pagination metadata", async () => {
    mockRange.mockResolvedValueOnce({ data: [STUB_ROW], count: 1, error: null });

    const res  = await handleIntelMmrQueries(buildArgs());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<MmrQueriesResponse>;
    expect(body.success).toBe(true);
    expect(body.data?.items).toHaveLength(1);
    expect(body.data?.items[0]?.id).toBe("uuid-1");
    expect(body.data?.total_count).toBe(1);
    expect(body.data?.limit).toBe(50);
    expect(body.data?.offset).toBe(0);
    expect(body.data?.has_more).toBe(false);
    expect(body.requestId).toBe("req-q-1");
  });

  it("returns empty items when no rows match", async () => {
    mockRange.mockResolvedValueOnce({ data: null, count: 0, error: null });

    const res  = await handleIntelMmrQueries(buildArgs());
    const body = (await res.json()) as ApiResponse<MmrQueriesResponse>;
    expect(body.data?.items).toEqual([]);
    expect(body.data?.total_count).toBe(0);
    expect(body.data?.has_more).toBe(false);
  });

  it("computes has_more correctly when more pages exist", async () => {
    mockRange.mockResolvedValueOnce({ data: Array(50).fill(STUB_ROW), count: 120, error: null });

    const res  = await handleIntelMmrQueries(buildArgs());
    const body = (await res.json()) as ApiResponse<MmrQueriesResponse>;
    expect(body.data?.has_more).toBe(true);
    expect(body.data?.total_count).toBe(120);
  });

  it("clamps limit to max 250", async () => {
    mockRange.mockResolvedValueOnce({ data: [], count: 0, error: null });

    const res  = await handleIntelMmrQueries(buildArgs({ limit: "9999" }));
    const body = (await res.json()) as ApiResponse<MmrQueriesResponse>;
    expect(body.data?.limit).toBe(250);
  });

  it("reflects applied filters in response", async () => {
    mockRange.mockResolvedValueOnce({ data: [], count: 0, error: null });

    const res  = await handleIntelMmrQueries(buildArgs({
      email: "rami@texasautovalue.com", lookup_type: "vin", cache_hit: "true",
    }));
    const body = (await res.json()) as ApiResponse<MmrQueriesResponse>;
    expect(body.data?.filters.email).toBe("rami@texasautovalue.com");
    expect(body.data?.filters.lookup_type).toBe("vin");
    expect(body.data?.filters.cache_hit).toBe(true);
  });

  it("throws PersistenceError when Supabase returns an error", async () => {
    mockRange.mockResolvedValueOnce({ data: null, count: null, error: { code: "PGRST", message: "db error" } });
    await expect(handleIntelMmrQueries(buildArgs())).rejects.toBeInstanceOf(PersistenceError);
  });

  it("queries mmr_queries table ordered newest-first", async () => {
    mockRange.mockResolvedValueOnce({ data: [], count: 0, error: null });
    await handleIntelMmrQueries(buildArgs());
    expect(mockFrom).toHaveBeenCalledWith("mmr_queries");
    expect(qb.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("normalizes vin filter to uppercase and reflects it in filters", async () => {
    mockRange.mockResolvedValueOnce({ data: [], count: 0, error: null });

    const res  = await handleIntelMmrQueries(buildArgs({ vin: "1hgcm82633a123456" }));
    const body = (await res.json()) as ApiResponse<MmrQueriesResponse>;

    expect(body.data?.filters.vin).toBe("1HGCM82633A123456");
    expect(qb.eq).toHaveBeenCalledWith("vin", "1HGCM82633A123456");
  });

  it("computes has_more correctly with non-zero offset", async () => {
    // page 2: offset=50, limit=50, total=120 → items 50–99 → has_more=true (100 < 120)
    mockRange.mockResolvedValueOnce({ data: Array(50).fill(STUB_ROW), count: 120, error: null });

    const res  = await handleIntelMmrQueries(buildArgs({ offset: "50", limit: "50" }));
    const body = (await res.json()) as ApiResponse<MmrQueriesResponse>;

    expect(body.data?.offset).toBe(50);
    expect(body.data?.has_more).toBe(true);
  });
});
