import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatch } from "../index";
import type { Env } from "../../types/env";
import type { ApiResponse } from "../../types/api";

// Universal fluent chain mock. All chainable methods return `this`; terminal
// async methods (range, maybeSingle) are controlled per-test. The chain is
// also thenable so `await query` works for handlers that don't call an
// explicit terminal method (activityFeed, activityVin).
const mockRange      = vi.fn();
const mockMaybeSingle = vi.fn();
const chain: Record<string, unknown> & { then: unknown; catch: unknown } = {
  select:      vi.fn().mockReturnThis(),
  order:       vi.fn().mockReturnThis(),
  is:          vi.fn().mockReturnThis(),
  eq:          vi.fn().mockReturnThis(),
  gte:         vi.fn().mockReturnThis(),
  lt:          vi.fn().mockReturnThis(),
  limit:       vi.fn().mockReturnThis(),
  range:       mockRange,
  maybeSingle: mockMaybeSingle,
  // Thenable: resolves when `await query` is used without an explicit terminal.
  then:  (onFulfilled: (v: unknown) => unknown, onRejected?: (v: unknown) => unknown) =>
           Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
  catch: (onRejected: (v: unknown) => unknown) =>
           Promise.resolve({ data: [], error: null }).catch(onRejected),
};
const mockFrom = vi.fn(() => chain);

const mockRpc = vi.fn().mockResolvedValue({ data: {
  total_lookups: 0, successful_lookups: 0, failed_lookups: 0,
  cache_hit_rate: null, avg_latency_ms: null, p95_latency_ms: null,
  lookups_by_type: {}, lookups_by_outcome: {}, top_requesters: [],
  recent_error_count: 0,
}, error: null });

vi.mock("../../persistence/supabase", () => ({
  getSupabaseClient: () => ({ rpc: mockRpc, from: mockFrom }),
}));

const env: Env = {
  TAV_INTEL_KV:              null as unknown as KVNamespace,
  MANAGER_EMAIL_ALLOWLIST:   "",
  MANHEIM_CLIENT_ID:         "",
  MANHEIM_CLIENT_SECRET:     "",
  MANHEIM_USERNAME:          "",
  MANHEIM_PASSWORD:          "",
  MANHEIM_TOKEN_URL:         "",
  MANHEIM_MMR_URL:           "",
  SUPABASE_URL:              "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  INTEL_SERVICE_SECRET: "",
};

const AUTH_HEADERS: HeadersInit = {
  "Cf-Access-Authenticated-User-Email": "rami@texasautovalue.com",
};

describe("dispatch", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 404 for an unknown path", async () => {
    const req = new Request("https://example.test/nope", { method: "GET" });
    const res = await dispatch(req, env, "req-404");
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<never>;
    expect(body.error?.code).toBe("not_found");
  });

  it("dispatches GET /health without auth", async () => {
    const req = new Request("https://example.test/health", { method: "GET" });
    const res = await dispatch(req, env, "req-h");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ worker: string }>;
    expect(body.data?.worker).toBe("tav-intelligence-worker");
  });

  it("dispatches GET /kpis/summary when authenticated", async () => {
    const req = new Request("https://example.test/kpis/summary", {
      method: "GET",
      headers: AUTH_HEADERS,
    });
    const res = await dispatch(req, env, "req-k");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ time_window: unknown }>;
    expect(body.data?.time_window).toBeDefined();
  });

  it("returns 404 when method does not match a known path", async () => {
    const req = new Request("https://example.test/health", { method: "POST" });
    const res = await dispatch(req, env, "req-bm");
    expect(res.status).toBe(404);
  });

  // ── G.3 routing ──────────────────────────────────────────────────────────

  it("dispatches GET /activity/feed when authenticated", async () => {
    const req = new Request("https://example.test/activity/feed", {
      method: "GET",
      headers: AUTH_HEADERS,
    });
    const res = await dispatch(req, env, "req-af");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ entries: unknown[] }>;
    expect(Array.isArray(body.data?.entries)).toBe(true);
  });

  it("dispatches GET /activity/vin/:vin when authenticated", async () => {
    const req = new Request("https://example.test/activity/vin/1HGCM82633A123456", {
      method: "GET",
      headers: AUTH_HEADERS,
    });
    const res = await dispatch(req, env, "req-av");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ vin: string; entries: unknown[] }>;
    expect(body.data?.vin).toBe("1HGCM82633A123456");
    expect(Array.isArray(body.data?.entries)).toBe(true);
  });

  it("dispatches GET /intel/mmr/queries when authenticated", async () => {
    mockRange.mockResolvedValueOnce({ data: [], count: 0, error: null });
    const req = new Request("https://example.test/intel/mmr/queries", {
      method: "GET",
      headers: AUTH_HEADERS,
    });
    const res = await dispatch(req, env, "req-imq");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ items: unknown[]; total_count: number }>;
    // Pagination shape confirms intelMmrQueries handled this, not intelMmrCacheKey
    expect(Array.isArray(body.data?.items)).toBe(true);
    expect(typeof body.data?.total_count).toBe("number");
  });

  it("routes /intel/mmr/queries to intelMmrQueries, not intelMmrCacheKey", async () => {
    // If /intel/mmr/:cacheKey captured this, it would look up "queries" as a cache key
    // and return a 404 not_found. intelMmrQueries returns a pagination envelope instead.
    mockRange.mockResolvedValueOnce({ data: [], count: 0, error: null });
    const req = new Request("https://example.test/intel/mmr/queries", {
      method: "GET",
      headers: AUTH_HEADERS,
    });
    const res = await dispatch(req, env, "req-order");
    const body = (await res.json()) as ApiResponse<{ items: unknown[]; has_more: boolean } | null>;
    // A cache-key miss returns 404; a pagination response returns 200 with items.
    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty("items");
    expect(body.data).toHaveProperty("has_more");
    expect(body.error).toBeUndefined();
  });

  it("dispatches GET /intel/mmr/:cacheKey when authenticated", async () => {
    // maybeSingle returns null → handler returns 404 not_found (correct path for unknown key)
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const req = new Request("https://example.test/intel/mmr/vin%3A1HGCM82633A123456", {
      method: "GET",
      headers: AUTH_HEADERS,
    });
    const res = await dispatch(req, env, "req-ck");
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<never>;
    expect(body.error?.code).toBe("not_found");
  });
});
