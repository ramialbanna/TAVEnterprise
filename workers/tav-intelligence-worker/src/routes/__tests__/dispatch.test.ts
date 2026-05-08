import { describe, it, expect, vi } from "vitest";
import { dispatch } from "../index";
import type { Env } from "../../types/env";
import type { ApiResponse } from "../../types/api";

// kpisSummary and activity handlers hit Supabase — stub the client here so
// dispatch routing tests don't need real credentials.
const mockRpc  = vi.fn().mockResolvedValue({ data: {
  total_lookups: 0, successful_lookups: 0, failed_lookups: 0,
  cache_hit_rate: null, avg_latency_ms: null, p95_latency_ms: null,
  lookups_by_type: {}, lookups_by_outcome: {}, top_requesters: [],
  recent_error_count: 0,
}, error: null });

vi.mock("../../persistence/supabase", () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
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
};

const AUTH_HEADERS: HeadersInit = {
  "Cf-Access-Authenticated-User-Email": "rami@texasautovalue.com",
};

describe("dispatch", () => {
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
});
